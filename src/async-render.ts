import {randomBytes, randomUUID} from 'node:crypto';
import {runs, tasks} from '@trigger.dev/sdk';
import {compileBrowserPage} from './browser-component.js';
import {
  createLocalJob,
  localVideoInfo,
  readLegacyLocalRequest,
  readLocalJob,
  readLocalState,
} from './local-store.js';
import {
  outputKey,
  readJob,
  readState,
  renderKey,
  saveJob,
  saveState,
  statusKey,
} from './job-store.js';
import {
  createPutUrl,
  getObjectUrl,
  getS3Bucket,
  getVideoUrl,
  headObject,
  putObject,
} from './s3.js';
import {
  executionBackend,
  publicBaseUrl,
} from './runtime.js';
import type {
  BrowserRenderJob,
  GeneratedVideoRequest,
} from './task-types.js';

const localUrls = ({
  taskId,
  token,
}: {
  taskId: string;
  token: string;
}) => {
  const base = publicBaseUrl();
  const encodedTaskId = encodeURIComponent(taskId);
  const encodedToken = encodeURIComponent(token);

  const renderPath = `/render/${encodedTaskId}?token=${encodedToken}`;
  const videoPath = `/video/${encodedTaskId}.mp4?token=${encodedToken}`;

  return {
    renderUrl: `${base}${renderPath}`,
    statusUploadUrl: `/api/local/jobs/${encodedTaskId}/status?token=${encodedToken}`,
    videoUploadUrl: `/api/local/jobs/${encodedTaskId}/video?token=${encodedToken}`,
    videoViewUrl: videoPath,
    absoluteVideoViewUrl: `${base}${videoPath}`,
  };
};

const startLocalTask = async (request: GeneratedVideoRequest) => {
  const taskId = `render_${randomUUID()}`;
  const token = randomBytes(32).toString('base64url');
  const urls = localUrls({taskId, token});

  const renderHtml = await compileBrowserPage({
    taskId,
    request,
    videoUploadUrl: urls.videoUploadUrl,
    statusUploadUrl: urls.statusUploadUrl,
    videoViewUrl: urls.videoViewUrl,
  });

  await createLocalJob({
    taskId,
    request,
    renderHtml,
    renderToken: token,
  });

  return {
    taskId,
    backend: 'local' as const,
    renderUrl: urls.renderUrl,
    status: 'waiting_for_browser' as const,
  };
};

const startStatelessTask = async (request: GeneratedVideoRequest) => {
  if (!process.env.TRIGGER_SECRET_KEY) {
    throw new Error('TRIGGER_SECRET_KEY is required in stateless mode.');
  }

  const taskId = `render_${randomUUID()}`;
  const createdAt = new Date().toISOString();
  const jobRenderKey = renderKey(taskId);
  const jobStatusKey = statusKey(taskId);
  const jobOutputKey = outputKey(taskId);

  const [videoUploadUrl, statusUploadUrl, videoViewUrl] = await Promise.all([
    createPutUrl({
      key: jobOutputKey,
      contentType: 'video/mp4',
    }),
    createPutUrl({
      key: jobStatusKey,
      contentType: 'application/json',
    }),
    getVideoUrl({
      bucket: getS3Bucket(),
      key: jobOutputKey,
    }),
  ]);

  const renderHtml = await compileBrowserPage({
    taskId,
    request,
    videoUploadUrl,
    statusUploadUrl,
    videoViewUrl,
  });

  const job: BrowserRenderJob = {
    id: taskId,
    backend: 'trigger',
    createdAt,
    compositionId: request.compositionId,
    durationInFrames: request.durationInFrames,
    fps: request.fps,
    width: request.width,
    height: request.height,
    inputProps: request.inputProps,
    renderKey: jobRenderKey,
    statusKey: jobStatusKey,
    outputKey: jobOutputKey,
  };

  await Promise.all([
    saveJob(job),
    saveState(jobStatusKey, {
      status: 'waiting_for_browser',
      progress: 0,
      updatedAt: createdAt,
    }),
    putObject({
      key: jobRenderKey,
      body: renderHtml,
      contentType: 'text/html; charset=utf-8',
    }),
  ]);

  const handle = await tasks.trigger('remotion-browser-render-job', {
    taskId,
    statusKey: jobStatusKey,
    outputKey: jobOutputKey,
  });

  job.triggerRunId = handle.id;
  await saveJob(job);

  return {
    taskId,
    backend: 'trigger' as const,
    renderUrl: await getObjectUrl(jobRenderKey),
    status: 'waiting_for_browser' as const,
  };
};

export const startGeneratedVideoTask = async (
  request: GeneratedVideoRequest,
) =>
  executionBackend() === 'local'
    ? startLocalTask(request)
    : startStatelessTask(request);

const migrateLegacyLocalTask = async (taskId: string) => {
  const request = await readLegacyLocalRequest(taskId);
  if (!request) return null;

  const token = randomBytes(32).toString('base64url');
  const urls = localUrls({taskId, token});
  const renderHtml = await compileBrowserPage({
    taskId,
    request,
    videoUploadUrl: urls.videoUploadUrl,
    statusUploadUrl: urls.statusUploadUrl,
    videoViewUrl: urls.videoViewUrl,
  });

  return createLocalJob({
    taskId,
    request,
    renderHtml,
    renderToken: token,
  });
};

const checkLocalTask = async (taskId: string) => {
  let job;

  try {
    job = await readLocalJob(taskId);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    job = await migrateLegacyLocalTask(taskId);
    if (!job) throw error;
  }

  const state = await readLocalState(taskId);
  const urls = localUrls({taskId, token: job.renderToken});

  if (state.status === 'completed') {
    const info = await localVideoInfo(taskId);
    return {
      taskId,
      backend: 'local' as const,
      status: 'completed' as const,
      progress: 1,
      contentType: 'video/mp4',
      sizeInBytes: info.size,
      videoUrl: urls.absoluteVideoViewUrl,
      createdAt: job.createdAt,
      updatedAt: state.updatedAt,
    };
  }

  return {
    taskId,
    backend: 'local' as const,
    status: state.status,
    progress: state.progress,
    error: state.error,
    renderUrl: urls.renderUrl,
    createdAt: job.createdAt,
    updatedAt: state.updatedAt,
  };
};

const checkStatelessTask = async (taskId: string) => {
  const job = await readJob(taskId);
  const state = await readState(job.statusKey);
  const renderUrl =
    state.status === 'completed' ? undefined : await getObjectUrl(job.renderKey);

  let triggerStatus: string | undefined;
  let triggerError: string | undefined;

  if (job.triggerRunId) {
    const run = await runs.retrieve(job.triggerRunId);
    triggerStatus = run.status;
    triggerError = run.error?.message;
  }

  if (state.status === 'completed') {
    const object = await headObject(job.outputKey);
    return {
      taskId,
      backend: 'trigger' as const,
      status: 'completed' as const,
      progress: 1,
      bucket: getS3Bucket(),
      key: job.outputKey,
      contentType: object.ContentType ?? 'video/mp4',
      sizeInBytes: object.ContentLength ?? 0,
      videoUrl: await getVideoUrl({
        bucket: getS3Bucket(),
        key: job.outputKey,
      }),
      triggerRunId: job.triggerRunId,
      triggerStatus,
    };
  }

  return {
    taskId,
    backend: 'trigger' as const,
    status: state.status,
    progress: state.progress,
    error: state.error ?? triggerError,
    renderUrl,
    triggerRunId: job.triggerRunId,
    triggerStatus,
    createdAt: job.createdAt,
    updatedAt: state.updatedAt,
  };
};

export const checkGeneratedVideoTask = async (taskId: string) =>
  executionBackend() === 'local'
    ? checkLocalTask(taskId)
    : checkStatelessTask(taskId);
