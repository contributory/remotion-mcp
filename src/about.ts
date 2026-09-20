export const REMOTION_MCP_VERSION = '1.5.0';
export const REMOTION_MCP_REPOSITORY = 'https://github.com/contributory/remotion-mcp';

export const getAboutInfo = () => {
  const functionsUrl = process.env.NHOST_FUNCTIONS_URL?.replace(/\/$/, '');

  return {
    name: 'remotion-mcp',
    version: REMOTION_MCP_VERSION,
    description:
      'An MCP server for creating, storing, and rendering Remotion videos from React/TSX. It supports reusable compositions, one-off AI-authored React videos, browser-side rendering, S3-compatible persistence, and traditional server-side Remotion workflows when available.',
    repository: REMOTION_MCP_REPOSITORY,
    documentation: `${REMOTION_MCP_REPOSITORY}#readme`,
    license: 'ISC',
    publicDeployment: functionsUrl
      ? {
          transport: 'Streamable HTTP',
          mcpEndpoint: `${functionsUrl}/mcp`,
        }
      : null,
    capabilities: [
      'Create and persist reusable React/Remotion compositions',
      'Create one-off browser-rendered videos from React/TSX',
      'Render persisted compositions with per-render input props',
      'Track browser render tasks and return final MP4 URLs',
      'List completed generated videos with cursor-based pagination and configurable page size',
      'Persist compositions, render pages, task state, and videos in S3-compatible storage',
      'Use local stateful storage when S3 is not configured',
      'Optionally track stateless browser renders with Trigger.dev',
      'Inspect and render traditional Remotion projects on compatible stateful hosts',
    ],
    browserRenderWorkflow: {
      summary:
        'create_video_from_react or create_video_from_composition returns a taskId and renderUrl. The user must open renderUrl in a browser; that browser performs the Remotion render and uploads the MP4. check_render_task then returns progress and eventually videoUrl.',
      importantForAi:
        'Always show the returned renderUrl to the user as a clickable link and tell them to open it and keep the tab open until rendering completes. Afterward, call check_render_task to obtain the final videoUrl.',
    },
    runtime: {
      stateful:
        'Uses local persistence by default, or S3-compatible storage when S3_BUCKET is configured. Traditional server-side Remotion tools are available on compatible hosts.',
      stateless:
        'Uses S3-compatible storage and browser rendering. S3_BUCKET is the only storage setting that is intrinsically required; S3_REGION defaults to us-east-1. Trigger.dev tracking is optional.',
      nhost:
        'The Nhost adapter exposes stateless Streamable HTTP MCP. Traditional filesystem/server-side rendering tools are disabled there; persisted compositions and browser rendering are supported.',
    },
    tools: [
      'about',
      'list_videos',
      'create_composition',
      'list_compositions',
      'get_composition',
      'create_video_from_composition',
      'create_video_from_react',
      'check_render_task',
      'list_project_compositions',
      'render_video',
      'render_still',
    ],
  };
};
