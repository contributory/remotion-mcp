import {task} from '@trigger.dev/sdk';
import {renderGeneratedVideo} from '../src/generated-video.js';
import type {GeneratedVideoRequest} from '../src/task-types.js';

export const renderGeneratedVideoTask = task({
  id: 'remotion-render-generated-video',
  retry: {
    maxAttempts: 2,
  },
  run: async (payload: GeneratedVideoRequest, {ctx}) => {
    return renderGeneratedVideo({
      taskId: ctx.run.id,
      request: payload,
    });
  },
});
