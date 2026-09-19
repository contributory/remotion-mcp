#!/usr/bin/env node
import {renderGeneratedVideo} from './generated-video.js';
import {readLocalTask, writeLocalTask} from './local-tasks.js';

const taskId = process.argv[2];

if (!taskId) {
  throw new Error('Usage: local-worker <taskId>');
}

const record = await readLocalTask(taskId);
record.status = 'running';
record.updatedAt = new Date().toISOString();
await writeLocalTask(record);

try {
  record.result = await renderGeneratedVideo({
    taskId,
    request: record.request,
  });
  record.status = 'completed';
} catch (error) {
  record.status = 'failed';
  record.error = error instanceof Error ? error.stack ?? error.message : String(error);
}

record.updatedAt = new Date().toISOString();
await writeLocalTask(record);
