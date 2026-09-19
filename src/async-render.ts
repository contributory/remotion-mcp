import {runs, tasks} from '@trigger.dev/sdk';
import {createLocalTask, readLocalTask} from './local-tasks.js';
import {getVideoUrl} from './s3.js';
import type {GeneratedVideoRequest, GeneratedVideoResult} from './task-types.js';

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
): Promise<{taskId: string; backend: 'local' | 'trigger'}> => {
  const backend = executionBackend();

  if (backend === 'trigger') {
    if (!process.env.TRIGGER_SECRET_KEY) {
      throw new Error(
        'TRIGGER_SECRET_KEY is required when REMOTION_MCP_EXECUTION_MODE=trigger or the environment is detected as stateless.',
      );
    }

    const handle = await tasks.trigger('remotion-render-generated-video', request);
    return {taskId: handle.id, backend};
  }

  return {
    taskId: await createLocalTask(request),
    backend,
  };
};

const completedResponse = async ({
  taskId,
  backend,
  result,
}: {
  taskId: string;
  backend: 'local' | 'trigger';
  result: GeneratedVideoResult;
}) => ({
  taskId,
  backend,
  status: 'completed' as const,
  videoUrl: await getVideoUrl({
    bucket: result.bucket,
    key: result.key,
  }),
  bucket: result.bucket,
  key: result.key,
  contentType: result.contentType,
  sizeInBytes: result.sizeInBytes,
});

export const checkGeneratedVideoTask = async (taskId: string) => {
  if (taskId.startsWith('local_')) {
    const record = await readLocalTask(taskId);

    if (record.status === 'completed' && record.result) {
      return completedResponse({
        taskId,
        backend: 'local',
        result: record.result,
      });
    }

    return {
      taskId,
      backend: 'local' as const,
      status: record.status,
      error: record.error,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  if (!process.env.TRIGGER_SECRET_KEY) {
    throw new Error('TRIGGER_SECRET_KEY is required to check a Trigger.dev task.');
  }

  const run = await runs.retrieve(taskId);

  if (run.isSuccess && run.output) {
    return completedResponse({
      taskId,
      backend: 'trigger',
      result: run.output as GeneratedVideoResult,
    });
  }

  return {
    taskId,
    backend: 'trigger' as const,
    status: run.isFailed
      ? ('failed' as const)
      : run.isExecuting
        ? ('running' as const)
        : ('queued' as const),
    triggerStatus: run.status,
    error: run.error?.message,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
  };
};
