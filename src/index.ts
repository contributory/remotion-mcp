#!/usr/bin/env node
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import * as z from 'zod/v4';
import {
  checkGeneratedVideoTask,
  startGeneratedVideoTask,
} from './async-render.js';
import {listCompositions, renderFrame, renderVideo} from './remotion.js';

const server = new McpServer({
  name: 'remotion-mcp',
  version: '1.2.0',
});

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

server.registerTool(
  'create_video_from_react',
  {
    description:
      'Create a browser-rendered Remotion video task from React code. Returns a task ID and a render URL that the user must open in a browser. The browser performs the render and uploads the MP4 directly to S3.',
    inputSchema: {
      reactCode: z
        .string()
        .min(1)
        .describe(
          'TSX/JSX source code that default-exports the React component to render. It may import React and Remotion APIs.',
        ),
      compositionId: z
        .string()
        .min(1)
        .optional()
        .default('GeneratedVideo'),
      durationInFrames: z
        .number()
        .int()
        .positive()
        .max(216000)
        .describe('Video duration in frames')
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
      'Check a browser render task. While pending, returns a fresh render URL. When complete, returns a fresh URL for viewing the MP4 stored in S3.',
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
  'list_compositions',
  {
    description:
      'Bundle a Remotion project and list all compositions with dimensions, FPS, and duration.',
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
      return asText(await listCompositions(entryPoint, inputProps));
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
  async ({entryPoint, compositionId, outputPath, inputProps, codec, concurrency}) => {
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
  async ({entryPoint, compositionId, outputPath, inputProps, frame, imageFormat}) => {
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


const transport = new StdioServerTransport();
await server.connect(transport);
console.error('[remotion-mcp] running on stdio');
