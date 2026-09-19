import {timingSafeEqual} from 'node:crypto';
import type {Request, Response} from 'express';
import {WebStandardStreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import {createNhostMcpServer} from './mcp-server.js';

const toHeaders = (req: Request): Headers => {
  const headers = new Headers();

  for (const [name, value] of Object.entries(req.headers)) {
    if (value == null) continue;
    if (Array.isArray(value)) {
      for (const item of value) headers.append(name, item);
      continue;
    }
    headers.set(name, String(value));
  }

  if (!headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }

  if (!headers.has('accept')) {
    headers.set('accept', 'application/json, text/event-stream');
  }

  return headers;
};

const requestBody = (req: Request): string => {
  if (typeof req.body === 'string') return req.body;
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8');
  return JSON.stringify(req.body ?? null);
};

const secureEqual = (left: string, right: string): boolean => {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
};

const authorized = (req: Request): boolean => {
  const required = process.env.MCP_BEARER_TOKEN;
  if (!required) return true;

  const authorization = req.headers.authorization;
  if (!authorization?.startsWith('Bearer ')) return false;

  return secureEqual(authorization.slice(7), required);
};

const setResponseHeaders = (res: Response, headers: Headers) => {
  headers.forEach((value, name) => {
    if (
      name.toLowerCase() !== 'content-length' &&
      name.toLowerCase() !== 'transfer-encoding'
    ) {
      res.setHeader(name, value);
    }
  });
};

export default async (req: Request, res: Response) => {
  process.env.REMOTION_MCP_STATELESS = 'true';

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'authorization, content-type, accept, mcp-protocol-version',
  );
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Method not allowed.',
      },
      id: null,
    });
  }

  if (!authorized(req)) {
    res.setHeader('WWW-Authenticate', 'Bearer');
    return res.status(401).json({
      error: 'Unauthorized',
    });
  }

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  const server = createNhostMcpServer();

  try {
    await server.connect(transport);

    const request = new globalThis.Request('https://nhost.local/mcp', {
      method: 'POST',
      headers: toHeaders(req),
      body: requestBody(req),
    });

    const response = await transport.handleRequest(request);
    const body = await response.text();

    setResponseHeaders(res, response.headers);
    return res.status(response.status).send(body);
  } catch (error) {
    console.error('[remotion-mcp:nhost] request failed', error);
    return res.status(500).json({
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message:
          error instanceof Error ? error.message : 'Internal server error',
      },
      id: null,
    });
  } finally {
    await transport.close().catch(() => undefined);
    await server.close().catch(() => undefined);
  }
};