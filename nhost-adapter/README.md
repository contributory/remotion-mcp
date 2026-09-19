# Nhost Function adapter

This adapter deploys the cloud/browser-rendered Remotion MCP as an Nhost Serverless Function without changing the main stateful runtime.

## Endpoint

Nhost maps:

```text
functions/mcp.ts
```

to:

```text
<NHOST_FUNCTIONS_URL>/mcp
```

For hosted projects, the Functions service follows Nhost's normal service URL pattern:

```text
https://<subdomain>.functions.<region>.nhost.run/v1/mcp
```

The exact base URL is also available at runtime as `NHOST_FUNCTIONS_URL`.

## Runtime behavior

The function always forces:

```text
REMOTION_MCP_STATELESS=true
```

Therefore:

- compositions are stored in S3;
- render job metadata/status/render pages/videos are stored in S3;
- Trigger.dev tracks browser-render task lifecycle;
- the user's browser performs the actual Remotion render;
- MCP transport is stateless Streamable HTTP with JSON responses.

## Environment

Required for the existing cloud workflow:

```text
S3_BUCKET
S3_REGION
TRIGGER_SECRET_KEY
```

For S3-compatible storage, the existing variables are supported:

```text
S3_ENDPOINT
S3_ACCESS_KEY_ID
S3_SECRET_ACCESS_KEY
S3_FORCE_PATH_STYLE
S3_PUBLIC_BASE_URL
S3_RENDER_URL_EXPIRES_SECONDS
```

Optional endpoint authentication:

```text
MCP_BEARER_TOKEN
```

Nhost makes project environment variables available to Functions through `process.env`.

## MCP tools

Fully supported:

- `create_composition`
- `list_compositions`
- `get_composition`
- `create_video_from_composition`
- `create_video_from_react`
- `check_render_task`

For API compatibility the following names remain visible but are disabled in Nhost Functions:

- `list_project_compositions`
- `render_video`
- `render_still`

Those three traditional tools depend on server-side project/browser rendering. Use the browser-render workflow instead.

## Validation

```bash
npm run typecheck:nhost
```

## Deployment

Nhost Functions are deployed with the project. For a Git-connected Nhost project, push the deployment branch to GitHub. Nhost also supports creating deployments from the CLI with `nhost deployments new`.
