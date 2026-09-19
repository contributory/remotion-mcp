# remotion-mcp

MCP server for Remotion with browser-side video generation from AI-authored React code.

## Async browser-render flow

`create_video_from_react` always returns:

```json
{
  "taskId": "render_...",
  "backend": "local or trigger",
  "renderUrl": "...",
  "status": "waiting_for_browser"
}
```

The user opens `renderUrl`. The page uses `@remotion/web-renderer` in the user's browser, shows progress, uploads the finished MP4, and updates the task state.

Then `check_render_task` returns progress or the final `videoUrl`.


## Reusable composition registry

Use `create_composition` when React/Remotion code should be reusable instead of one-off. A stored composition contains the React source, dimensions, FPS, duration, and `defaultProps`.

Stateful mode stores compositions at:

```text
~/.remotion-mcp/compositions/<compositionId>.json
```

Stateless mode stores them in S3 under:

```text
remotion-mcp/compositions/<compositionId>.json
```

Typical workflow:

```text
create_composition
  -> list_compositions
  -> create_video_from_composition
  -> open renderUrl
  -> check_render_task
```

`create_video_from_composition` merges the saved `defaultProps` with per-render `inputProps`; per-render values win. `create_composition` refuses to replace an existing ID unless `overwrite: true` is passed.

## Stateful mode

Stateful mode requires **no S3 and no Trigger.dev**.

Jobs are persisted under:

```text
~/.remotion-mcp/tasks/<taskId>/
  job.json
  status.json
  render.html
  video.mp4
```

Override the data directory with:

```bash
REMOTION_MCP_DATA_DIR=/persistent/remotion-mcp
```

The MCP can use either transport.

### Stateful stdio

This is the default for a normal stateful machine:

```bash
npm start
```

MCP messages use stdio. The same process also starts a small HTTP service, defaulting to:

```text
http://127.0.0.1:3847
```

That HTTP service only serves the browser render page, receives the MP4 upload, and serves completed local videos.

### Stateful HTTP

```bash
REMOTION_MCP_TRANSPORT=http npm start
```

The MCP endpoint is:

```text
POST http://127.0.0.1:3847/mcp
```

The same HTTP service also handles the render page and local MP4 storage.

Useful settings:

```bash
REMOTION_MCP_HTTP_HOST=127.0.0.1
REMOTION_MCP_HTTP_PORT=3847
REMOTION_MCP_PUBLIC_BASE_URL=http://127.0.0.1:3847
```

For a remote stateful server, set `REMOTION_MCP_PUBLIC_BASE_URL` to the URL the user's browser can actually reach.

## Stateless mode

Stateless mode is enabled with:

```bash
REMOTION_MCP_STATELESS=true
```

Known serverless environment variables such as Vercel, Lambda, Cloud Run, Azure Functions, Netlify, and Cloudflare Pages also enable it automatically.

**Stateless mode always uses Streamable HTTP MCP transport.** Setting `REMOTION_MCP_TRANSPORT=stdio` is ignored in stateless mode.

The MCP endpoint is:

```text
POST /mcp
```

In stateless mode:

- render page, task state, and MP4 are stored in S3;
- the user's browser uploads directly to S3 using presigned URLs;
- Trigger.dev tracks the browser-render job;
- Trigger.dev does not run Chrome, Puppeteer, FFmpeg, or Remotion rendering.

Required configuration:

```bash
REMOTION_MCP_STATELESS=true

S3_BUCKET=my-video-bucket
S3_REGION=us-east-1

TRIGGER_SECRET_KEY=tr_...
TRIGGER_PROJECT_REF=proj_...
```

S3-compatible services can additionally use:

```bash
S3_ENDPOINT=https://...
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_FORCE_PATH_STYLE=true
```

Optional:

```bash
S3_PUBLIC_BASE_URL=https://cdn.example.com
S3_RENDER_URL_EXPIRES_SECONDS=86400
```

The S3 bucket must allow browser `PUT` requests for the presigned upload URLs.

Deploy the Trigger.dev tracker with:

```bash
npm run trigger:deploy
```

Trigger task ID:

```text
remotion-browser-render-job
```

## MCP tools

- `create_composition` — create or explicitly overwrite a reusable persisted composition.
- `list_compositions` — list persisted composition metadata.
- `get_composition` — get one persisted composition including React source.
- `create_video_from_composition` — render a persisted composition through the browser-render workflow.
- `create_video_from_react` — one-off browser render without persisting a composition.
- `check_render_task` — return status/progress and eventually `videoUrl`.
- `list_project_compositions` — inspect compositions from a traditional Remotion project entry point.
- `render_video` — traditional server-side Remotion render.
- `render_still` — traditional server-side still render.

`list_project_compositions`, `render_video`, and `render_still` use the traditional server-side Remotion project workflow and may require a compatible local browser.

## Example component

```tsx
import React from "react";
import {AbsoluteFill, interpolate, useCurrentFrame} from "remotion";

export default function Video({title = "Hello"}) {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 30], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "white",
        fontSize: 96,
      }}
    >
      <div style={{opacity}}>{title}</div>
    </AbsoluteFill>
  );
}
```

## Build

```bash
npm install
npm run typecheck
npm run build
```

## VS Code stdio configuration

The repository includes `.vscode/mcp.json`. Equivalent configuration:

```json
{
  "servers": {
    "remotion": {
      "type": "stdio",
      "command": "node",
      "args": ["/absolute/path/to/remotion-mcp/dist/index.js"]
    }
  }
}
```
