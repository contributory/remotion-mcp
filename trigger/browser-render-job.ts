import {task, wait} from '@trigger.dev/sdk';
import {readState} from '../src/job-store.js';
import {getS3Bucket, getVideoUrl, headObject} from '../src/s3.js';

export const browserRenderJobTask = task({
  id: 'remotion-browser-render-job',
  retry: {
    maxAttempts: 1,
  },
  run: async (payload: {
    taskId: string;
    statusKey: string;
    outputKey: string;
  }) => {
    for (let attempt = 0; attempt < 1440; attempt += 1) {
      const state = await readState(payload.statusKey);

      if (state.status === 'failed') {
        throw new Error(state.error ?? 'Browser render failed.');
      }

      if (state.status === 'completed') {
        const object = await headObject(payload.outputKey);
        const bucket = getS3Bucket();

        return {
          taskId: payload.taskId,
          status: 'completed' as const,
          bucket,
          key: payload.outputKey,
          contentType: object.ContentType ?? 'video/mp4',
          sizeInBytes: object.ContentLength ?? 0,
          videoUrl: await getVideoUrl({
            bucket,
            key: payload.outputKey,
          }),
        };
      }

      await wait.for({minutes: 1});
    }

    throw new Error('Browser render timed out after 24 hours.');
  },
});
