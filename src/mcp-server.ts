import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod/v4';
import {getAboutInfo, REMOTION_MCP_VERSION} from './about.js';
import {
  checkGeneratedVideoTask,
  startGeneratedVideoTask,
} from './async-render.js';
import {
  listCompositions as listProjectCompositions,
  renderFrame,
  renderVideo,
} from './remotion.js';
import {
  createStoredComposition,
  getStoredComposition,
  listStoredCompositions,
} from './composition-store.js';

const compositionIdSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(
    /^[A-Za-z0-9_-]+$/,
    'Composition ID may only contain letters, numbers, underscores, and hyphens',
  );

const inputPropsSchema = z
  .record(z.string(), z.unknown())
  .optional()
  .describe('Props passed to the Remotion composition');

const asText = (value: unknown) => ({
  content: [
    {
      type: 'text' as const,
      text: JSON.stringify(value, null, 2),
    },
  ],
});

const asError = (error: unknown) => ({
  content: [
    {
      type: 'text' as const,
      text: error instanceof Error ? error.message : String(error),
    },
  ],
  isError: true,
});

export const createMcpServer = () => {
  const server = new McpServer({
    name: 'remotion-mcp',
    version: REMOTION_MCP_VERSION,
  });


  server.registerTool(
    'about',
    {
      description:
        'Get authoritative information about remotion-mcp itself, including its public repository, capabilities, deployment/runtime model, render workflow, and guidance for using its tools correctly.',
      inputSchema: {},
    },
    async () => asText(getAboutInfo()),
  );

  server.registerTool(
    'create_composition',
    {
      description:
        'Persist a reusable React/Remotion composition. Storage is local by default on stateful hosts, switches to S3 when S3_BUCKET is configured, and is always S3 in stateless mode.',
      inputSchema: {
        compositionId: compositionIdSchema.describe(
          'Stable ID used to list and render this composition later',
        ),
        reactCode: z
          .string()
          .min(1)
          .describe('TSX/JSX source that default-exports the React component'),
        durationInFrames: z
          .number()
          .int()
          .positive()
          .max(216000)
          .optional()
          .default(150),
        fps: z.number().int().positive().max(120).optional().default(30),
        width: z.number().int().positive().max(7680).optional().default(1920),
        height: z.number().int().positive().max(4320).optional().default(1080),
        defaultProps: z
          .record(z.string(), z.unknown())
          .optional()
          .default({})
          .describe('Default props used whenever this composition is rendered'),
        overwrite: z
          .boolean()
          .optional()
          .default(false)
          .describe('Replace an existing composition with the same ID'),
      },
    },
    async ({
      compositionId,
      reactCode,
      durationInFrames,
      fps,
      width,
      height,
      defaultProps,
      overwrite,
    }) => {
      try {
        return asText(
          await createStoredComposition({
            id: compositionId,
            reactCode,
            durationInFrames,
            fps,
            width,
            height,
            defaultProps,
            overwrite,
          }),
        );
      } catch (error) {
        return asError(error);
      }
    },
  );

  server.registerTool(
    'list_compositions',
    {
      description:
        'List reusable compositions persisted by create_composition. Returns metadata only, not the full React source.',
      inputSchema: {},
    },
    async () => {
      try {
        return asText(await listStoredCompositions());
      } catch (error) {
        return asError(error);
      }
    },
  );

  server.registerTool(
    'get_composition',
    {
      description:
        'Get one persisted composition including its React source and default props.',
      inputSchema: {
        compositionId: compositionIdSchema,
      },
    },
    async ({compositionId}) => {
      try {
        return asText(await getStoredComposition(compositionId));
      } catch (error) {
        return asError(error);
      }
    },
  );

  server.registerTool(
    'create_video_from_composition',
    {
      description:
        'Start a browser-rendered video task from a persisted composition. Returns taskId and renderUrl; the user must open renderUrl in a browser.',
      inputSchema: {
        compositionId: compositionIdSchema,
        inputProps: z
          .record(z.string(), z.unknown())
          .optional()
          .default({})
          .describe(
            'Props for this render. These override the stored defaultProps.',
          ),
      },
    },
    async ({compositionId, inputProps}) => {
      try {
        const composition = await getStoredComposition(compositionId);
        return asText(
          await startGeneratedVideoTask({
            reactCode: composition.reactCode,
            compositionId: composition.id,
            durationInFrames: composition.durationInFrames,
            fps: composition.fps,
            width: composition.width,
            height: composition.height,
            inputProps: {
              ...composition.defaultProps,
              ...inputProps,
            },
          }),
        );
      } catch (error) {
        return asError(error);
      }
    },
  );

  server.registerTool(
    'create_video_from_react',
    {
      description:
        'Create a browser-rendered Remotion video task from React code. Returns a task ID and a render URL that the user must open in a browser. The user browser performs the render.',
      inputSchema: {
        reactCode: z
          .string()
          .min(1)
          .describe(
            'TSX/JSX source code that default-exports the React component to render. It may import React and Remotion APIs.',
          ),
        compositionId: compositionIdSchema.optional().default('GeneratedVideo'),
        durationInFrames: z
          .number()
          .int()
          .positive()
          .max(216000)
          .optional()
          .default(150),
        fps: z.number().int().positive().max(120).optional().default(30),
        width: z.number().int().positive().max(7680).optional().default(1920),
        height: z.number().int().positive().max(4320).optional().default(1080),
        inputProps: z
          .record(z.string(), z.unknown())
          .optional()
          .default({})
          .describe('Props passed to the generated React component'),
      },
    },
    async ({
      reactCode,
      compositionId,
      durationInFrames,
      fps,
      width,
      height,
      inputProps,
    }) => {
      try {
        return asText(
          await startGeneratedVideoTask({
            reactCode,
            compositionId,
            durationInFrames,
            fps,
            width,
            height,
            inputProps,
          }),
        );
      } catch (error) {
        return asError(error);
      }
    },
  );

  server.registerTool(
    'check_render_task',
    {
      description:
        'Check a browser render task. While pending, returns the render URL. When complete, returns a URL for viewing the MP4.',
      inputSchema: {
        taskId: z.string().min(1),
      },
    },
    async ({taskId}) => {
      try {
        return asText(await checkGeneratedVideoTask(taskId));
      } catch (error) {
        return asError(error);
      }
    },
  );

  server.registerTool(
    'list_project_compositions',
    {
      description:
        'Bundle a traditional Remotion project and list its compositions. This is separate from the persisted composition registry.',
      inputSchema: {
        entryPoint: z
          .string()
          .min(1)
          .describe(
            'Absolute path, or path relative to the MCP server working directory, to the Remotion entry point',
          ),
        inputProps: inputPropsSchema,
      },
    },
    async ({entryPoint, inputProps}) => {
      try {
        return asText(await listProjectCompositions(entryPoint, inputProps));
      } catch (error) {
        return asError(error);
      }
    },
  );

  server.registerTool(
    'render_video',
    {
      description: 'Render a Remotion composition to a video or audio file.',
      inputSchema: {
        entryPoint: z.string().min(1).describe('Path to the Remotion entry point'),
        compositionId: z.string().min(1).describe('Remotion composition ID'),
        outputPath: z.string().min(1).describe('Destination file path'),
        inputProps: inputPropsSchema,
        codec: z
          .enum([
            'h264',
            'h265',
            'vp8',
            'vp9',
            'av1',
            'mp3',
            'aac',
            'wav',
            'prores',
            'h264-mkv',
            'h264-ts',
            'gif',
          ])
          .optional()
          .default('h264'),
        concurrency: z.number().int().positive().optional(),
      },
    },
    async ({
      entryPoint,
      compositionId,
      outputPath,
      inputProps,
      codec,
      concurrency,
    }) => {
      try {
        return asText(
          await renderVideo({
            entryPoint,
            compositionId,
            outputPath,
            inputProps,
            codec,
            concurrency,
          }),
        );
      } catch (error) {
        return asError(error);
      }
    },
  );

  server.registerTool(
    'render_still',
    {
      description: 'Render one frame from a Remotion composition to an image.',
      inputSchema: {
        entryPoint: z.string().min(1).describe('Path to the Remotion entry point'),
        compositionId: z.string().min(1).describe('Remotion composition ID'),
        outputPath: z.string().min(1).describe('Destination image path'),
        inputProps: inputPropsSchema,
        frame: z.number().int().nonnegative().optional().default(0),
        imageFormat: z.enum(['png', 'jpeg', 'webp']).optional().default('png'),
      },
    },
    async ({
      entryPoint,
      compositionId,
      outputPath,
      inputProps,
      frame,
      imageFormat,
    }) => {
      try {
        return asText(
          await renderFrame({
            entryPoint,
            compositionId,
            outputPath,
            inputProps,
            frame,
            imageFormat,
          }),
        );
      } catch (error) {
        return asError(error);
      }
    },
  );

  return server;
};
