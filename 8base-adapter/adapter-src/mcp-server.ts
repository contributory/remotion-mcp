import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod';
import {
  checkGeneratedVideoTask,
  startGeneratedVideoTask,
} from '../../src/async-render.js';
import {
  createStoredComposition,
  getStoredComposition,
  listStoredCompositions,
} from '../../src/composition-store.js';

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
  .default({});

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

const unsupportedOn8Base = () =>
  asError(
    new Error(
      'This traditional server-side Remotion tool is not supported by the 8base compatibility adapter. Use the persisted composition + browser-render tools instead.',
    ),
  );

export const create8BaseMcpServer = () => {
  const server = new McpServer({
    name: 'remotion-mcp',
    version: '1.5.0-8base',
  });

  server.registerTool(
    'create_composition',
    {
      description:
        'Persist a reusable React/Remotion composition in S3 for the 8base deployment.',
      inputSchema: {
        compositionId: compositionIdSchema,
        reactCode: z.string().min(1),
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
          .default({}),
        overwrite: z.boolean().optional().default(false),
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
      description: 'List reusable compositions persisted in S3.',
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
        'Get one persisted composition including React source and default props.',
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
        'Create a browser-render task from a persisted composition. Returns taskId and renderUrl.',
      inputSchema: {
        compositionId: compositionIdSchema,
        inputProps: inputPropsSchema,
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
        'Create a one-off browser-rendered Remotion task from React code. Returns taskId and renderUrl.',
      inputSchema: {
        reactCode: z.string().min(1),
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
        inputProps: inputPropsSchema,
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
        'Check a browser render task and return progress, renderUrl, or final videoUrl.',
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
        'Traditional filesystem Remotion project inspection. Not available on 8base Functions.',
      inputSchema: {
        entryPoint: z.string().min(1),
        inputProps: inputPropsSchema,
      },
    },
    async () => unsupportedOn8Base(),
  );

  server.registerTool(
    'render_video',
    {
      description:
        'Traditional server-side Remotion rendering. Not available on 8base Functions.',
      inputSchema: {
        entryPoint: z.string().min(1),
        compositionId: z.string().min(1),
        outputPath: z.string().min(1),
        inputProps: inputPropsSchema,
        codec: z.string().optional(),
        concurrency: z.number().int().positive().optional(),
      },
    },
    async () => unsupportedOn8Base(),
  );

  server.registerTool(
    'render_still',
    {
      description:
        'Traditional server-side still rendering. Not available on 8base Functions.',
      inputSchema: {
        entryPoint: z.string().min(1),
        compositionId: z.string().min(1),
        outputPath: z.string().min(1),
        inputProps: inputPropsSchema,
        frame: z.number().int().nonnegative().optional().default(0),
        imageFormat: z.enum(['png', 'jpeg', 'webp']).optional().default('png'),
      },
    },
    async () => unsupportedOn8Base(),
  );

  return server;
};
