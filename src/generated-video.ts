import {createRequire} from 'node:module';
import {mkdir, mkdtemp, rm, symlink, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {bundle} from '@remotion/bundler';
import {renderMedia, selectComposition} from '@remotion/renderer';
import {getVideoUrl, uploadVideo} from './s3.js';
import type {GeneratedVideoRequest, GeneratedVideoResult} from './task-types.js';

const require = createRequire(import.meta.url);

const safeId = (value: string): string =>
  value.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 120) || 'GeneratedVideo';

const runtimeRoot = (): string =>
  process.env.REMOTION_MCP_RUNTIME_DIR ?? tmpdir();

const dependencyRoot = (): string =>
  dirname(dirname(require.resolve('remotion/package.json')));

const browserExecutable = (): string | undefined =>
  process.env.REMOTION_BROWSER_EXECUTABLE ??
  process.env.PUPPETEER_EXECUTABLE_PATH ??
  undefined;

export const renderGeneratedVideo = async ({
  taskId,
  request,
}: {
  taskId: string;
  request: GeneratedVideoRequest;
}): Promise<GeneratedVideoResult> => {
  await mkdir(runtimeRoot(), {recursive: true});
  const workDir = await mkdtemp(
    join(runtimeRoot(), `remotion-mcp-${safeId(taskId)}-`),
  );
  const componentPath = join(workDir, 'Component.tsx');
  const entryPath = join(workDir, 'entry.tsx');
  const outputPath = join(workDir, 'output.mp4');

  const entryCode = `
import React from 'react';
import {Composition, registerRoot} from 'remotion';
import GeneratedComponent from './Component';

const Root: React.FC = () => (
  <Composition
    id=${JSON.stringify(request.compositionId)}
    component={GeneratedComponent}
    durationInFrames={${request.durationInFrames}}
    fps={${request.fps}}
    width={${request.width}}
    height={${request.height}}
  />
);

registerRoot(Root);
`;

  try {
    await Promise.all([
      writeFile(componentPath, request.reactCode, 'utf8'),
      writeFile(entryPath, entryCode, 'utf8'),
      symlink(dependencyRoot(), join(workDir, 'node_modules'), 'dir'),
    ]);

    const serveUrl = await bundle({
      entryPoint: entryPath,
      outDir: join(workDir, 'bundle'),
      onProgress: () => undefined,
    });

    const composition = await selectComposition({
      serveUrl,
      id: request.compositionId,
      inputProps: request.inputProps,
      browserExecutable: browserExecutable(),
    });

    await renderMedia({
      serveUrl,
      composition,
      codec: 'h264',
      outputLocation: outputPath,
      inputProps: request.inputProps,
      browserExecutable: browserExecutable(),
      overwrite: true,
      onProgress: ({progress}) => {
        const percent = Math.round(progress * 100);
        if (percent % 10 === 0) {
          console.error(`[remotion-mcp] ${taskId}: ${percent}%`);
        }
      },
    });

    const uploaded = await uploadVideo({
      filePath: outputPath,
      key: `remotion-mcp/${safeId(taskId)}.mp4`,
    });

    return {
      ...uploaded,
      videoUrl: await getVideoUrl({
        bucket: uploaded.bucket,
        key: uploaded.key,
      }),
    };
  } finally {
    await rm(workDir, {recursive: true, force: true});
  }
};
