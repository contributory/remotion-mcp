import {getTextObject, putObject} from './s3.js';
import type {
  BrowserRenderJob,
  BrowserRenderState,
} from './task-types.js';

export const jobKey = (taskId: string): string =>
  `remotion-mcp/jobs/${taskId}/job.json`;

export const renderKey = (taskId: string): string =>
  `remotion-mcp/jobs/${taskId}/render.html`;

export const statusKey = (taskId: string): string =>
  `remotion-mcp/jobs/${taskId}/status.json`;

export const outputKey = (taskId: string): string =>
  `remotion-mcp/videos/${taskId}.mp4`;

export const saveJob = async (job: BrowserRenderJob): Promise<void> => {
  await putObject({
    key: jobKey(job.id),
    body: JSON.stringify(job),
    contentType: 'application/json',
  });
};

export const readJob = async (
  taskId: string,
): Promise<BrowserRenderJob> =>
  JSON.parse(await getTextObject(jobKey(taskId))) as BrowserRenderJob;

export const saveState = async (
  key: string,
  state: BrowserRenderState,
): Promise<void> => {
  await putObject({
    key,
    body: JSON.stringify(state),
    contentType: 'application/json',
  });
};

export const readState = async (
  key: string,
): Promise<BrowserRenderState> =>
  JSON.parse(await getTextObject(key)) as BrowserRenderState;
