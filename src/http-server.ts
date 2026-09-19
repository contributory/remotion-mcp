import {timingSafeEqual} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {createMcpExpressApp} from '@modelcontextprotocol/sdk/server/express.js';
import {StreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {createMcpServer} from './mcp-server.js';
import {
  localVideoInfo,
  readLocalJob,
  renderPagePath,
  saveLocalState,
  saveLocalVideo,
  videoPath,
} from './local-store.js';
import {
  httpHost,
  httpPort,
  isStatelessEnvironment,
} from './runtime.js';
import type {
  BrowserRenderState,
  BrowserRenderStatus,
} from './task-types.js';

const allowedStatuses = new Set<BrowserRenderStatus>([
  'waiting_for_browser',
  'rendering',
  'uploading',
  'completed',
  'failed',
]);

const safeEqual = (actual: string, expected: string): boolean => {
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
};

const authenticateLocalTask = async (
  taskId: string,
  token: unknown,
): Promise<void> => {
  if (typeof token !== 'string' || !token) {
    throw new Error('Missing render token.');
  }

  const job = await readLocalJob(taskId);
  if (!safeEqual(token, job.renderToken)) {
    throw new Error('Invalid render token.');
  }
};

const normalizeState = (body: unknown): BrowserRenderState => {
  if (!body || typeof body !== 'object') {
    throw new Error('Invalid task state.');
  }

  const source = body as Record<string, unknown>;
  if (
    typeof source.status !== 'string' ||
    !allowedStatuses.has(source.status as BrowserRenderStatus)
  ) {
    throw new Error('Invalid render status.');
  }

  const progress = Number(source.progress);
  if (!Number.isFinite(progress) || progress < 0 || progress > 1) {
    throw new Error('Invalid render progress.');
  }

  return {
    status: source.status as BrowserRenderStatus,
    progress,
    updatedAt: new Date().toISOString(),
    error:
      typeof source.error === 'string' && source.error
        ? source.error.slice(0, 100_000)
        : undefined,
  };
};

const registerMcpRoutes = (app: ReturnType<typeof createMcpExpressApp>) => {
  app.post('/mcp', async (req, res) => {
    const server = createMcpServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);

      res.on('close', () => {
        void transport.close();
        void server.close();
      });
    } catch (error) {
      console.error('[remotion-mcp] HTTP MCP error:', error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal server error',
          },
          id: null,
        });
      }
    }
  });

  const methodNotAllowed = (_req: unknown, res: any) => {
    res.status(405).json({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Method not allowed.',
      },
      id: null,
    });
  };

  app.get('/mcp', methodNotAllowed);
  app.delete('/mcp', methodNotAllowed);
};

const registerLocalRenderRoutes = (
  app: ReturnType<typeof createMcpExpressApp>,
) => {
  app.get('/render/:taskId', async (req, res) => {
    try {
      await authenticateLocalTask(req.params.taskId, req.query.token);
      const html = await readFile(renderPagePath(req.params.taskId), 'utf8');
      res
        .status(200)
        .set('Cache-Control', 'no-store')
        .type('html')
        .send(html);
    } catch (error) {
      res.status(403).send(
        error instanceof Error ? error.message : String(error),
      );
    }
  });

  app.put('/api/local/jobs/:taskId/status', async (req, res) => {
    try {
      await authenticateLocalTask(req.params.taskId, req.query.token);
      await saveLocalState(req.params.taskId, normalizeState(req.body));
      res.status(200).json({ok: true});
    } catch (error) {
      res.status(400).json({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.put('/api/local/jobs/:taskId/video', async (req, res) => {
    try {
      await authenticateLocalTask(req.params.taskId, req.query.token);
      const sizeInBytes = await saveLocalVideo(req.params.taskId, req);
      res.status(200).json({ok: true, sizeInBytes});
    } catch (error) {
      res.status(400).json({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.get('/video/:file', async (req, res) => {
    const match = /^(.+)\.mp4$/.exec(req.params.file);
    if (!match) {
      res.status(404).send('Not found');
      return;
    }

    const taskId = match[1];

    try {
      await authenticateLocalTask(taskId, req.query.token);
      const info = await localVideoInfo(taskId);
      const range = req.headers.range;

      res.set('Cache-Control', 'no-store').set('Accept-Ranges', 'bytes');

      if (range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(range);
        if (!match) {
          res.status(416).set('Content-Range', `bytes */${info.size}`).end();
          return;
        }

        const start = match[1] ? Number(match[1]) : 0;
        const end = match[2] ? Number(match[2]) : info.size - 1;
        if (start < 0 || end < start || end >= info.size) {
          res.status(416).set('Content-Range', `bytes */${info.size}`).end();
          return;
        }

        res
          .status(206)
          .type('video/mp4')
          .set('Content-Range', `bytes ${start}-${end}/${info.size}`)
          .set('Content-Length', String(end - start + 1));
        createReadStream(videoPath(taskId), {start, end}).pipe(res);
        return;
      }

      res
        .status(200)
        .type('video/mp4')
        .set('Content-Length', String(info.size));
      createReadStream(videoPath(taskId)).pipe(res);
    } catch (error) {
      res.status(403).send(
        error instanceof Error ? error.message : String(error),
      );
    }
  });
};

export const startHttpService = async ({
  enableMcp,
}: {
  enableMcp: boolean;
}) => {
  const host = httpHost();
  const allowedHosts = process.env.REMOTION_MCP_ALLOWED_HOSTS
    ?.split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  const app = createMcpExpressApp({
    host,
    allowedHosts,
  });

  app.get('/health', (_req, res) => {
    res.json({
      ok: true,
      stateless: isStatelessEnvironment(),
      mcp: enableMcp ? '/mcp' : null,
    });
  });

  if (enableMcp) registerMcpRoutes(app);
  if (!isStatelessEnvironment()) registerLocalRenderRoutes(app);

  await new Promise<void>((resolve, reject) => {
    const listener = app.listen(httpPort(), host, () => {
      listener.off('error', reject);
      resolve();
    });
    listener.once('error', reject);
  });

  console.error(
    `[remotion-mcp] HTTP service listening on http://${host}:${httpPort()}`,
  );
};
