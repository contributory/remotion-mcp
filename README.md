# remotion-mcp

MCP server for Remotion with browser-side video generation from AI-authored React code.

Public repository: https://github.com/contributory/remotion-mcp

## Async browser-render flow

`create_video_from_react` always returns:

```json
{
  "taskId": "render_...",
  "backend": "local, browser, or trigger",
  "storage": "local or s3",
  "renderUrl": "...",
  "status": "waiting_for_browser"
}
```

The user opens `renderUrl`. The page uses `@remotion/web-renderer` in the user's browser, shows progress, uploads the finished MP4, and updates the task state.

Then `check_render_task` returns progress or the final `videoUrl`.


## Reusable composition registry

Use `create_composition` when React/Remotion code should be reusable instead of one-off. A stored composition contains the React source, dimensions, FPS, duration, and `defaultProps`.

Stateful mode stores compositions locally by default. If `S3_BUCKET` is configured, stateful mode automatically stores compositions in S3 instead. Stateless mode always uses S3.

Local path:

```text
~/.remotion-mcp/compositions/<compositionId>.json
```

S3 key:

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

Stateful mode never requires Trigger.dev. Storage is selected automatically:

- without `S3_BUCKET`: all persistent data stays local;
- with `S3_BUCKET`: compositions, job metadata, status, render pages, and MP4 files are all stored in S3.

When local storage is selected, jobs are persisted under:

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

MCP messages use stdio. When storage is local, the same process also starts a small HTTP service, defaulting to:

```text
http://127.0.0.1:3847
```

That HTTP service only serves the browser render page, receives the MP4 upload, and serves completed local videos. If `S3_BUCKET` is configured, stdio mode does not need this local render service because the browser reads/writes directly through presigned S3 URLs.

### Stateful HTTP

```bash
REMOTION_MCP_TRANSPORT=http npm start
```

The MCP endpoint is:

```text
POST http://127.0.0.1:3847/mcp
```

When storage is local, the same HTTP service also handles the render page and local MP4 storage. With `S3_BUCKET` configured, `/mcp` still uses HTTP but render pages/status/video live in S3.

Useful settings:

```bash
REMOTION_MCP_HTTP_HOST=127.0.0.1
REMOTION_MCP_HTTP_PORT=3847
REMOTION_MCP_PUBLIC_BASE_URL=http://127.0.0.1:3847
```

For a remote stateful server using local storage, set `REMOTION_MCP_PUBLIC_BASE_URL` to the URL the user's browser can actually reach. This is unnecessary when stateful storage is S3.

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

- S3 storage is mandatory;
- render page, task state, compositions, and MP4 are stored in S3;
- the user's browser uploads directly to S3 using presigned URLs;
- Trigger.dev can optionally track the browser-render job;
- when configured, Trigger.dev does not run Chrome, Puppeteer, FFmpeg, or Remotion rendering.

Required configuration:

```bash
REMOTION_MCP_STATELESS=true
S3_BUCKET=my-video-bucket
```

Optional S3 region override (defaults to `us-east-1`):

```bash
S3_REGION=eu-west-1
```

Optional Trigger.dev lifecycle tracking:

```bash
TRIGGER_SECRET_KEY=tr_...
```

`TRIGGER_PROJECT_REF` is only needed by the Trigger.dev CLI/config when deploying the tracker; the MCP runtime does not require it.

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

### Stateful with S3

Setting `S3_BUCKET` on a stateful MCP automatically switches **all persistent storage** to S3 while keeping execution stateful:

```bash
S3_BUCKET=my-video-bucket
```

`S3_REGION` remains optional here and defaults to `us-east-1`.

In this mode task responses use:

```json
{
  "backend": "local",
  "storage": "s3"
}
```

Trigger.dev is not used. Stateful transport can still be stdio or HTTP.

If you want Trigger.dev lifecycle tracking, deploy the optional tracker with:

```bash
npm run trigger:deploy
```

Trigger task ID:

```text
remotion-browser-render-job
```

## MCP tools

- `about` — return authoritative metadata about remotion-mcp, including the public repository, capabilities, runtime/deployment model, and browser-render workflow guidance.
- `list_videos` — list completed generated MP4 videos with a configurable `limit` (1–50) and `nextCursor` pagination.
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


## Nhost Function deployment

The repository includes a cloud adapter for Nhost Serverless Functions. Build it with:

```bash
npm run typecheck:nhost
npm run build:nhost
```

This generates `functions/mcp.js`. Nhost installs the cloud-only dependencies from `functions/package.json` and exposes the function at:

```text
<NHOST_FUNCTIONS_URL>/mcp
```

The Nhost Function always runs the MCP in stateless mode, using S3 for persistence and Trigger.dev for render-task lifecycle. The user browser still performs the actual Remotion render.

Optional endpoint authentication is available with `MCP_BEARER_TOKEN`.

See `nhost-adapter/README.md` for the deployment layout and required environment variables.

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
