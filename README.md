# remotion-mcp

MCP server for Remotion with browser-side rendering.

## Browser render flow

`create_video_from_react` accepts TSX/JSX that default-exports a React component. The MCP compiles a self-contained HTML render page with React, Remotion, and `@remotion/web-renderer`, stores it in S3, and returns:

```json
{
  "taskId": "render_...",
  "backend": "local",
  "status": "waiting_for_browser",
  "renderUrl": "https://..."
}
```

The user must open `renderUrl` in a browser. That browser performs the Remotion render, uploads the MP4 directly to S3 using a short-lived presigned PUT URL, and updates task status in S3.

No Puppeteer, Chrome, or FFmpeg is required on the MCP or Trigger.dev side for this browser-render workflow.

`check_render_task` returns `waiting_for_browser`, `rendering`, `uploading`, `failed`, or `completed`. While unfinished it also returns a fresh `renderUrl`. When complete it returns a fresh `videoUrl`.

## Stateful and stateless

Both modes render in the user's browser.

- Stateful/default mode stores task state and output in S3; no background worker is required.
- Stateless mode uses Trigger.dev only to track the remote task lifecycle while the browser still performs the actual render.
- Set `REMOTION_MCP_STATELESS=true` to force stateless detection.
- Set `REMOTION_MCP_EXECUTION_MODE=local` or `trigger` to override auto detection.

Trigger.dev task ID: `remotion-browser-render-job`.

## S3

Required:

```bash
S3_BUCKET=my-video-bucket
S3_REGION=us-east-1
```

The normal AWS credential chain is supported. For S3-compatible storage:

```bash
S3_ENDPOINT=https://...
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_FORCE_PATH_STYLE=true
```

Render HTML, status updates, and video uploads use presigned S3 URLs. Their default lifetime is 24 hours:

```bash
S3_RENDER_URL_EXPIRES_SECONDS=86400
```

The maximum is seven days. `check_render_task` can issue a fresh render URL while the task is unfinished.

For public/CDN-backed completed videos:

```bash
S3_PUBLIC_BASE_URL=https://cdn.example.com
```

## Trigger.dev

Only stateless/trigger mode requires:

```bash
TRIGGER_SECRET_KEY=tr_...
TRIGGER_PROJECT_REF=proj_...
```

Deploy the tracker task with:

```bash
npm run trigger:deploy
```

## MCP tools

- `create_video_from_react`
- `check_render_task`
- `list_compositions`
- `render_video`
- `render_still`

The last three tools operate on existing Remotion projects and still use the traditional server-side Remotion renderer. The browser-render workflow is used by `create_video_from_react`.

## Build

```bash
npm install
npm run typecheck
npm run build
npm start
```

VS Code MCP configuration:

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
