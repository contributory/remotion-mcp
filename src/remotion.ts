import {mkdtemp, mkdir, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, isAbsolute, join, resolve} from 'node:path';
import {bundle} from '@remotion/bundler';
import {
  getCompositions,
  renderMedia,
  renderStill,
  selectComposition,
  type Codec,
} from '@remotion/renderer';

const SUPPORTED_CODECS = [
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
] as const;

export type SupportedCodec = (typeof SUPPORTED_CODECS)[number];

const resolvePath = (value: string): string =>
  isAbsolute(value) ? value : resolve(process.cwd(), value);

async function withBundle<T>(
  entryPoint: string,
  fn: (serveUrl: string) => Promise<T>,
): Promise<T> {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'remotion-mcp-'));
  const resolvedEntryPoint = resolvePath(entryPoint);

  try {
    const serveUrl = await bundle({
      entryPoint: resolvedEntryPoint,
      outDir: temporaryDirectory,
      onProgress: () => undefined,
    });

    return await fn(serveUrl);
  } finally {
    await rm(temporaryDirectory, {recursive: true, force: true});
  }
}

export const listCompositions = async (
  entryPoint: string,
  inputProps: Record<string, unknown> = {},
) =>
  withBundle(entryPoint, async (serveUrl) => {
    const compositions = await getCompositions({
      serveUrl,
      inputProps,
    });

    return compositions.map((composition) => ({
      id: composition.id,
      width: composition.width,
      height: composition.height,
      fps: composition.fps,
      durationInFrames: composition.durationInFrames,
      durationInSeconds: composition.durationInFrames / composition.fps,
    }));
  });

export const renderVideo = async ({
  entryPoint,
  compositionId,
  outputPath,
  inputProps = {},
  codec = 'h264',
  concurrency,
}: {
  entryPoint: string;
  compositionId: string;
  outputPath: string;
  inputProps?: Record<string, unknown>;
  codec?: SupportedCodec;
  concurrency?: number;
}) =>
  withBundle(entryPoint, async (serveUrl) => {
    const composition = await selectComposition({
      serveUrl,
      id: compositionId,
      inputProps,
    });

    const resolvedOutputPath = resolvePath(outputPath);
    await mkdir(dirname(resolvedOutputPath), {recursive: true});

    const result = await renderMedia({
      serveUrl,
      composition,
      codec: codec as Codec,
      outputLocation: resolvedOutputPath,
      inputProps,
      overwrite: true,
      concurrency,
      onProgress: ({progress}) => {
        const percent = Math.round(progress * 100);
        if (percent % 10 === 0) {
          console.error(`[remotion-mcp] render ${compositionId}: ${percent}%`);
        }
      },
    });

    return {
      compositionId,
      outputPath: resolvedOutputPath,
      codec,
      contentType: result.contentType,
      slowestFrames: result.slowestFrames,
    };
  });

export const renderFrame = async ({
  entryPoint,
  compositionId,
  outputPath,
  inputProps = {},
  frame = 0,
  imageFormat = 'png',
}: {
  entryPoint: string;
  compositionId: string;
  outputPath: string;
  inputProps?: Record<string, unknown>;
  frame?: number;
  imageFormat?: 'png' | 'jpeg' | 'webp';
}) =>
  withBundle(entryPoint, async (serveUrl) => {
    const composition = await selectComposition({
      serveUrl,
      id: compositionId,
      inputProps,
    });

    const resolvedOutputPath = resolvePath(outputPath);
    await mkdir(dirname(resolvedOutputPath), {recursive: true});

    await renderStill({
      serveUrl,
      composition,
      output: resolvedOutputPath,
      inputProps,
      frame,
      imageFormat,
      overwrite: true,
    });

    return {
      compositionId,
      frame,
      imageFormat,
      outputPath: resolvedOutputPath,
    };
  });
