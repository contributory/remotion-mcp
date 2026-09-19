'use strict';

const assert = require('node:assert/strict');
const handler = require('../src/mcpWebhook.js');

const invoke = async (payload, headers = {}) => {
  const response = await handler(
    {
      headers: {
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(payload),
    },
    {},
  );

  return {
    ...response,
    json: JSON.parse(response.body),
  };
};

(async () => {
  delete process.env.MCP_BEARER_TOKEN;

  const initialized = await invoke({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: {
        name: '8base-adapter-smoke',
        version: '1.0.0',
      },
    },
  });

  assert.equal(initialized.statusCode, 200);
  assert.equal(initialized.json.jsonrpc, '2.0');
  assert.equal(initialized.json.id, 1);
  assert.equal(initialized.json.result.serverInfo.name, 'remotion-mcp');

  const listed = await invoke({
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/list',
    params: {},
  });

  assert.equal(listed.statusCode, 200);
  const names = listed.json.result.tools.map((tool) => tool.name);
  for (const expected of [
    'create_composition',
    'list_compositions',
    'get_composition',
    'create_video_from_composition',
    'create_video_from_react',
    'check_render_task',
    'list_project_compositions',
    'render_video',
    'render_still',
  ]) {
    assert.ok(names.includes(expected), `Missing tool: ${expected}`);
  }

  process.env.MCP_BEARER_TOKEN = 'adapter-secret';

  const denied = await invoke(
    {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/list',
      params: {},
    },
  );
  assert.equal(denied.statusCode, 401);

  const allowed = await invoke(
    {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/list',
      params: {},
    },
    {
      authorization: 'Bearer adapter-secret',
    },
  );
  assert.equal(allowed.statusCode, 200);

  console.log(
    JSON.stringify({
      initialize: 'ok',
      tools: names,
      bearerAuth: 'ok',
    }),
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
