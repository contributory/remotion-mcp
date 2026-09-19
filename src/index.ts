#!/usr/bin/env node
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {createMcpServer} from './mcp-server.js';
import {startHttpService} from './http-server.js';
import {
  isStatelessEnvironment,
  transportMode,
} from './runtime.js';

const mode = transportMode();

if (mode === 'http') {
  await startHttpService({enableMcp: true});
  console.error(
    `[remotion-mcp] MCP running over HTTP at /mcp (${
      isStatelessEnvironment() ? 'stateless' : 'stateful'
    } environment)`,
  );
} else {
  await startHttpService({enableMcp: false});

  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error(
    '[remotion-mcp] MCP running over stdio; local browser-render HTTP service is enabled',
  );
}
