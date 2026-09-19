# remotion-mcp

MCP server for rendering Remotion projects and for generating videos asynchronously from AI-authored React code.

## MCP tools

- `create_video_from_react` — accepts TSX/JSX code that default-exports a React component, starts a background render, and returns a task ID immediately.
- `check_render_task` — checks the task status. When complete, returns a fresh URL for the MP4 stored in S3.
- `list_compositions` — lists compositions from an existing Remotion entry point.
- `render_video` — renders an existing composition directly.
- `render_still` — renders one frame from an existing composition.

## Async rendering

`create_video_from_react` wraps the submitted component in a Remotion `Composition`. The caller controls:

- `durationInFrames` (default 150)
- `fps` (default 30)
- `width` (default 1920)
- `height` (default 1080)
- `inputProps`

Example React source:

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

The tool immediately returns:

```json
{
  "taskId": "local_... or run_...",
  "backend": "local or trigger"
}
```

Then call `check_render_task` with that ID until the status is `completed`.

## Execution backend

The default mode is `auto`.

- Stateful environments use a detached local Node worker.
- Common stateless/serverless environments are routed to Trigger.dev.
- Set `REMOTION_MCP_STATELESS=true` to explicitly mark the environment as stateless.
- Set `REMOTION_MCP_EXECUTION_MODE=local` or `trigger` to override auto detection.

Trigger.dev task ID: `remotion-render-generated-video`.

## S3 configuration

Required:

```bash
S3_BUCKET=my-video-bucket
S3_REGION=us-east-1
```

Authentication uses the normal AWS credential chain. For S3-compatible services you can instead set:

```bash
S3_ENDPOINT=https://...
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_FORCE_PATH_STYLE=true
```

For public/CDN-backed buckets, set:

```bash
S3_PUBLIC_BASE_URL=https://cdn.example.com
```

Otherwise `check_render_task` returns a fresh presigned S3 URL. Its lifetime defaults to 3600 seconds and can be changed with `S3_SIGNED_URL_EXPIRES_SECONDS` (maximum 604800).

## Trigger.dev

For stateless deployment configure:

```bash
TRIGGER_SECRET_KEY=tr_...
TRIGGER_PROJECT_REF=proj_...
PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable
```

The Trigger.dev build installs FFmpeg and Google Chrome using official build extensions. Remotion uses `PUPPETEER_EXECUTABLE_PATH` automatically in this project.

Run:

```bash
npm run trigger:dev
npm run trigger:deploy
```

## Build and run MCP

```bash
npm install
npm run typecheck
npm run build
npm start
```

MCP configuration:

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
