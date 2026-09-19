import {randomUUID} from 'node:crypto';
import {runs, tasks} from '@trigger.dev/sdk';
import {compileBrowserPage} from './browser-component.js';
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
import type {
  BrowserRenderJob,
  GeneratedVideoRequest,
} from './task-types.js';

const isTruthy = (value: string | undefined): boolean =>
  value === '1' || value === 'true' || value === 'yes';

const isStatelessEnvironment = (): boolean => {
  if (isTruthy(process.env.REMOTION_MCP_STATELESS)) {
    return true;
  }

  return Boolean(
    process.env.VERCEL ||
      process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.K_SERVICE ||
      process.env.FUNCTIONS_WORKER_RUNTIME ||
      process.env.NETLIFY ||
      process.env.CF_PAGES,
  );
};

export const executionBackend = (): 'local' | 'trigger' => {
  const configured = process.env.REMOTION_MCP_EXECUTION_MODE?.toLowerCase();
  if (configured === 'local' || configured === 'trigger') {
    return configured;
  }

  return isStatelessEnvironment() ? 'trigger' : 'local';
};

export const startGeneratedVideoTask = async (
  request: GeneratedVideoRequest,
): Promise<{
  taskId: string;
  backend: 'local' | 'trigger';
  renderUrl: string;
  status: 'waiting_for_browser';
}> => {
  const backend = executionBackend();

  if (backend === 'trigger' && !process.env.TRIGGER_SECRET_KEY) {
    throw new Error(
      'TRIGGER_SECRET_KEY is required for stateless/Trigger.dev mode.',
    );
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
    backend,
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

  if (backend === 'trigger') {
    const handle = await tasks.trigger('remotion-browser-render-job', {
      taskId,
      statusKey: jobStatusKey,
      outputKey: jobOutputKey,
    });
    job.triggerRunId = handle.id;
    await saveJob(job);
  }

  return {
    taskId,
    backend,
    renderUrl: await getObjectUrl(jobRenderKey),
    status: 'waiting_for_browser',
  };
};

export const checkGeneratedVideoTask = async (taskId: string) => {
  const job = await readJob(taskId);
  const state = await readState(job.statusKey);
  const renderUrl =
    state.status === 'completed' ? undefined : await getObjectUrl(job.renderKey);

  let triggerStatus: string | undefined;
  let triggerError: string | undefined;

  if (job.backend === 'trigger' && job.triggerRunId) {
    const run = await runs.retrieve(job.triggerRunId);
    triggerStatus = run.status;
    triggerError = run.error?.message;
  }

  if (state.status === 'completed') {
    const object = await headObject(job.outputKey);
    return {
      taskId,
      backend: job.backend,
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
    backend: job.backend,
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
