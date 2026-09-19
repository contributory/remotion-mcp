# remotion-mcp

MCP server for inspecting and rendering existing [Remotion](https://www.remotion.dev/) projects.

## Tools

- `list_compositions` — list compositions and their metadata.
- `render_video` — render a composition to video/audio.
- `render_still` — render one frame to PNG, JPEG, or WebP.

Each call receives the path to the Remotion entry point, so one MCP server can work with multiple Remotion projects.

## Install

```bash
npm install
npm run build
```

## Run

```bash
npm start
```

The server communicates over stdio.

## MCP configuration

```json
{
  "mcpServers": {
    "remotion": {
      "command": "node",
      "args": ["/absolute/path/to/remotion-mcp/dist/index.js"]
    }
  }
}
```

Example tool input:

```json
{
  "entryPoint": "/workspace/my-video/src/index.ts",
  "compositionId": "Main",
  "outputPath": "/workspace/my-video/out/main.mp4",
  "inputProps": {
    "title": "Hello from MCP"
  }
}
```

Relative paths are resolved from the MCP server process working directory.
