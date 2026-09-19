import {timingSafeEqual} from 'node:crypto';
import {WebStandardStreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import {create8BaseMcpServer} from './mcp-server.js';

type EightBaseEvent = {
  event?: EightBaseEvent;
  data?: unknown;
  body?: unknown;
  headers?: Record<string, unknown>;
};

const normalizeEvent = (event: EightBaseEvent): EightBaseEvent =>
  event?.event && typeof event.event === 'object'
    ? event.event
    : event;

const getHeader = (
  headers: Record<string, unknown> | undefined,
  name: string,
): string | undefined => {
  if (!headers) return undefined;
  const lower = name.toLowerCase();

  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lower && value != null) {
      return String(value);
    }
  }

  return undefined;
};

const secureEqual = (left: string, right: string): boolean => {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
};

const unauthorized = () => ({
  statusCode: 401,
  headers: {
    'content-type': 'application/json',
    'www-authenticate': 'Bearer',
  },
  body: JSON.stringify({
    error: 'Unauthorized',
  }),
});

const validateBearerToken = (
  headers: Record<string, unknown> | undefined,
): boolean => {
  const required = process.env.MCP_BEARER_TOKEN;
  if (!required) return true;

  const authorization = getHeader(headers, 'authorization');
  if (!authorization?.startsWith('Bearer ')) return false;

  return secureEqual(authorization.slice(7), required);
};

const requestHeaders = (
  source: Record<string, unknown> | undefined,
): Headers => {
  const headers = new Headers();

  for (const [name, value] of Object.entries(source ?? {})) {
    const lower = name.toLowerCase();
    if (
      value == null ||
      lower === 'host' ||
      lower === 'content-length' ||
      lower === 'connection' ||
      lower === 'transfer-encoding'
    ) {
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

const requestBody = (event: EightBaseEvent): string => {
  if (typeof event.body === 'string') return event.body;
  if (event.body != null) return JSON.stringify(event.body);
  return JSON.stringify(event.data ?? null);
};

const responseHeaders = (headers: Headers): Record<string, string> => {
  const result: Record<string, string> = {};

  headers.forEach((value, name) => {
    if (
      name.toLowerCase() !== 'content-length' &&
      name.toLowerCase() !== 'transfer-encoding'
    ) {
      result[name] = value;
    }
  });

  return result;
};

export const handle8BaseWebhook = async (
  rawEvent: EightBaseEvent,
  _context: unknown,
) => {
  process.env.REMOTION_MCP_STATELESS = 'true';

  const event = normalizeEvent(rawEvent ?? {});
  if (!validateBearerToken(event.headers)) {
    return unauthorized();
  }

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  const server = create8BaseMcpServer();

  try {
    await server.connect(transport);

    const request = new Request('https://8base.local/mcp', {
      method: 'POST',
      headers: requestHeaders(event.headers),
      body: requestBody(event),
    });

    const response = await transport.handleRequest(request);
    const body = await response.text();

    return {
      statusCode: response.status,
      headers: responseHeaders(response.headers),
      body,
    };
  } catch (error) {
    console.error('[remotion-mcp:8base] request failed', error);

    return {
      statusCode: 500,
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message:
            error instanceof Error
              ? error.message
              : 'Internal server error',
        },
        id: null,
      }),
    };
  } finally {
    await transport.close().catch(() => undefined);
    await server.close().catch(() => undefined);
  }
};
