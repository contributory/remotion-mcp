import {
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {pipeline} from 'node:stream/promises';
import type {IncomingMessage} from 'node:http';
import type {
  BrowserRenderState,
  GeneratedVideoRequest,
  LocalBrowserRenderJob,
} from './task-types.js';

const rootDir = (): string =>
  process.env.REMOTION_MCP_DATA_DIR ??
  join(homedir(), '.remotion-mcp');

const taskDir = (taskId: string): string =>
  join(rootDir(), 'tasks', taskId);

const jobPath = (taskId: string): string =>
  join(taskDir(taskId), 'job.json');

const statusPath = (taskId: string): string =>
  join(taskDir(taskId), 'status.json');

export const renderPagePath = (taskId: string): string =>
  join(taskDir(taskId), 'render.html');

export const videoPath = (taskId: string): string =>
  join(taskDir(taskId), 'video.mp4');

const atomicJsonWrite = async (path: string, value: unknown) => {
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary, JSON.stringify(value, null, 2), 'utf8');
  await rename(temporary, path);
};

export const createLocalJob = async ({
  taskId,
  request,
  renderHtml,
  renderToken,
}: {
  taskId: string;
  request: GeneratedVideoRequest;
  renderHtml: string;
  renderToken: string;
}): Promise<LocalBrowserRenderJob> => {
  await mkdir(taskDir(taskId), {recursive: true});
  const createdAt = new Date().toISOString();
  const job: LocalBrowserRenderJob = {
    id: taskId,
    backend: 'local',
    createdAt,
    request,
    renderToken,
  };

  await Promise.all([
    atomicJsonWrite(jobPath(taskId), job),
    atomicJsonWrite(statusPath(taskId), {
      status: 'waiting_for_browser',
      progress: 0,
      updatedAt: createdAt,
    } satisfies BrowserRenderState),
    writeFile(renderPagePath(taskId), renderHtml, 'utf8'),
  ]);

  return job;
};

export const saveLocalJob = async (job: LocalBrowserRenderJob) => {
  await mkdir(taskDir(job.id), {recursive: true});
  await atomicJsonWrite(jobPath(job.id), job);
};

export const readLocalJob = async (
  taskId: string,
): Promise<LocalBrowserRenderJob> =>
  JSON.parse(await readFile(jobPath(taskId), 'utf8')) as LocalBrowserRenderJob;

export const readLocalState = async (
  taskId: string,
): Promise<BrowserRenderState> =>
  JSON.parse(await readFile(statusPath(taskId), 'utf8')) as BrowserRenderState;

export const saveLocalState = async (
  taskId: string,
  state: BrowserRenderState,
): Promise<void> => {
  await atomicJsonWrite(statusPath(taskId), state);
};

export const saveLocalVideo = async (
  taskId: string,
  request: IncomingMessage,
): Promise<number> => {
  await mkdir(taskDir(taskId), {recursive: true});
  const target = videoPath(taskId);
  const temporary = `${target}.upload-${process.pid}-${Date.now()}`;

  try {
    await pipeline(request, createWriteStream(temporary));
    await rename(temporary, target);
  } catch (error) {
    await rm(temporary, {force: true});
    throw error;
  }

  const info = await stat(target);
  return info.size;
};

export const localVideoInfo = async (taskId: string) =>
  stat(videoPath(taskId));
