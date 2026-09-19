export const isTruthy = (value: string | undefined): boolean =>
  value === '1' || value === 'true' || value === 'yes';

export const isStatelessEnvironment = (): boolean =>
  isTruthy(process.env.REMOTION_MCP_STATELESS) ||
  Boolean(
    process.env.VERCEL ||
      process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.K_SERVICE ||
      process.env.FUNCTIONS_WORKER_RUNTIME ||
      process.env.NETLIFY ||
      process.env.CF_PAGES,
  );

export const executionBackend = (): 'local' | 'trigger' =>
  isStatelessEnvironment() ? 'trigger' : 'local';

export const transportMode = (): 'stdio' | 'http' => {
  if (isStatelessEnvironment()) return 'http';

  const configured = process.env.REMOTION_MCP_TRANSPORT?.toLowerCase();
  return configured === 'http' ? 'http' : 'stdio';
};

export const httpPort = (): number =>
  Number(process.env.REMOTION_MCP_HTTP_PORT ?? process.env.PORT ?? 3847);

export const httpHost = (): string =>
  process.env.REMOTION_MCP_HTTP_HOST ??
  (isStatelessEnvironment() ? '0.0.0.0' : '127.0.0.1');

export const publicBaseUrl = (): string => {
  const explicit = process.env.REMOTION_MCP_PUBLIC_BASE_URL?.replace(/\/$/, '');
  if (explicit) return explicit;

  return `http://127.0.0.1:${httpPort()}`;
};
