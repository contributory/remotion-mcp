# remotion-mcp 8base adapter

This directory is a standalone compatibility/deployment layer for 8base Functions.

It does **not** modify or replace the main `src/` runtime. The adapter bundles only the existing cloud-safe Remotion MCP modules that are needed by a stateless 8base webhook.

## Architecture

```text
MCP client
   |
   | Streamable HTTP POST
   v
8base webhook /mcp
   |
   | WebStandardStreamableHTTPServerTransport
   v
Remotion MCP cloud-safe tools
   |
   +--> S3: compositions, jobs, render pages, status, MP4
   |
   +--> Trigger.dev: stateless render-job lifecycle
   |
   +--> User browser: @remotion/web-renderer
```

8base Functions are treated as stateless regardless of any other environment detection.

The adapter uses JSON responses for Streamable HTTP, so the 8base webhook only needs the POST method.

## Supported MCP tools

Fully supported:

- `create_composition`
- `list_compositions`
- `get_composition`
- `create_video_from_composition`
- `create_video_from_react`
- `check_render_task`

The following names are kept in the MCP tool surface for compatibility, but return a clear unsupported error on 8base:

- `list_project_compositions`
- `render_video`
- `render_still`

Those three tools depend on a traditional server-side Remotion project/browser environment and are intentionally not included in the 8base deployment package.

## Required environment variables

Configure these in the 8base workspace environment:

```bash
S3_BUCKET=...
S3_REGION=...

TRIGGER_SECRET_KEY=...
```

For S3-compatible storage:

```bash
S3_ENDPOINT=...
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_FORCE_PATH_STYLE=true
```

Optional:

```bash
S3_PUBLIC_BASE_URL=https://cdn.example.com
S3_RENDER_URL_EXPIRES_SECONDS=86400
```

### MCP authentication

8base webhooks are public endpoints by default. Set this variable to require a bearer token:

```bash
MCP_BEARER_TOKEN=change-me
```

The MCP client must then send:

```http
Authorization: Bearer change-me
```

## Trigger.dev

The existing Trigger.dev task is not deployed to 8base. Deploy it from the repository root using the existing project configuration:

```bash
npm run trigger:deploy
```

The 8base function only triggers and checks that task through `TRIGGER_SECRET_KEY`.

## Build

From this directory:

```bash
npm install
npm run build
```

The build creates:

```text
dist/runtime.cjs
```

It bundles the compatibility code plus the selected existing `../src/` modules while leaving npm dependencies external. This avoids copying the main server-side renderer/bundler stack into the 8base package.

With the current lockfile, the adapter dependency tree measures about **146 MB unzipped**, below the 8base **250 MB unzipped** function limit.

## Test locally

```bash
npm run build
node test/smoke.cjs
node test/http-client-smoke.cjs
```

## Configure 8base

Install and authenticate the CLI:

```bash
npm install -g 8base-cli
8base login
```

Then, from `8base-adapter/`:

```bash
8base configure
```

This creates the local `.workspace.json` mapping for the target workspace.

## Deploy

Use the adapter deploy script so the bundle is rebuilt before 8base packages the function:

```bash
npm run deploy
```

Equivalent:

```bash
npm run build
8base deploy
```

The webhook is declared in `8base.yml` as:

```text
POST /webhook/mcp
```

After deployment, get the concrete URL with:

```bash
8base describe remotionMcp
```

The URL is normally shaped like:

```text
https://api.8base.com/<WORKSPACE_ID>/webhook/mcp
```

Use that URL as the Streamable HTTP MCP endpoint.
