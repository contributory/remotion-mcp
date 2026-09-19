// Temporary diagnostic function. Remove after the runtime issue is resolved.
import {createRequire} from 'node:module';

const attempt = async (label, fn) => {
  try {
    return {label, ok: true, value: await fn()};
  } catch (error) {
    return {
      label,
      ok: false,
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      stack: error instanceof Error ? String(error.stack).split('\n').slice(0, 6) : undefined,
    };
  }
};

export default async (_req, res) => {
  const report = {
    node: process.version,
    cwd: process.cwd(),
    importMetaUrl: typeof import.meta.url === 'string' ? import.meta.url : 'N/A',
    hasRequest: typeof globalThis.Request,
    hasFetch: typeof globalThis.fetch,
    env: {
      NHOST_FUNCTIONS_URL: process.env.NHOST_FUNCTIONS_URL ?? null,
      S3_BUCKET: process.env.S3_BUCKET ?? null,
      TRIGGER_SECRET_KEY: Boolean(process.env.TRIGGER_SECRET_KEY),
      MCP_BEARER_TOKEN: Boolean(process.env.MCP_BEARER_TOKEN),
    },
    checks: [],
  };

  report.checks.push(
    await attempt('createRequire(import.meta.url)', () => {
      const req = createRequire(import.meta.url);
      return typeof req;
    }),
    await attempt('require.resolve remotion/package.json', () => {
      const req = createRequire(import.meta.url);
      return req.resolve('remotion/package.json');
    }),
    await attempt('require.resolve esbuild', () => {
      const req = createRequire(import.meta.url);
      return req.resolve('esbuild');
    }),
    await attempt('import esbuild', async () => Object.keys(await import('esbuild')).join(',')),
    await attempt('import @modelcontextprotocol/sdk/server/mcp.js', async () =>
      Object.keys(await import('@modelcontextprotocol/sdk/server/mcp.js')).join(','),
    ),
    await attempt('import zod/v4', async () => Object.keys(await import('zod/v4')).slice(0, 8).join(',')),
    await attempt('import @remotion/web-renderer', async () =>
      Object.keys(await import('@remotion/web-renderer')).slice(0, 8).join(','),
    ),
    await attempt('import @trigger.dev/sdk', async () =>
      Object.keys(await import('@trigger.dev/sdk')).slice(0, 8).join(','),
    ),
    await attempt('import @aws-sdk/client-s3', async () =>
      Object.keys(await import('@aws-sdk/client-s3')).slice(0, 8).join(','),
    ),
  );

  res.status(200).json(report);
};
