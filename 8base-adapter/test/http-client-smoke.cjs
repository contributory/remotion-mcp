'use strict';

const http = require('node:http');
const handler = require('../src/mcpWebhook.js');

(async () => {
  const server = http.createServer(async (req, res) => {
    if (req.method !== 'POST' || req.url !== '/mcp') {
      res.statusCode = 405;
      res.end('Method not allowed');
      return;
    }

    const chunks = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));

    const response = await handler(
      {
        headers: req.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      },
      {},
    );

    res.statusCode = response.statusCode;
    for (const [name, value] of Object.entries(response.headers ?? {})) {
      res.setHeader(name, value);
    }
    res.end(response.body);
  });

  await new Promise((resolve) =>
    server.listen(0, '127.0.0.1', resolve),
  );

  try {
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Failed to get local test address');
    }

    const {Client} = await import(
      '@modelcontextprotocol/sdk/client/index.js'
    );
    const {StreamableHTTPClientTransport} = await import(
      '@modelcontextprotocol/sdk/client/streamableHttp.js'
    );

    const transport = new StreamableHTTPClientTransport(
      new URL(`http://127.0.0.1:${address.port}/mcp`),
    );
    const client = new Client({
      name: '8base-http-shim-smoke',
      version: '1.0.0',
    });

    await client.connect(transport);
    const listed = await client.listTools();
    const names = listed.tools.map((tool) => tool.name);

    if (!names.includes('create_video_from_react')) {
      throw new Error('Expected create_video_from_react tool');
    }

    console.log(
      JSON.stringify({
        streamableHttpClient: 'ok',
        toolCount: names.length,
      }),
    );

    await client.close();
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
