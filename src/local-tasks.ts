import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {mkdir, readFile, rename, writeFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import type {GeneratedVideoRequest, LocalTaskRecord} from './task-types.js';

const storeDir = (): string =>
  process.env.REMOTION_MCP_TASK_DIR ??
  join(homedir(), '.remotion-mcp', 'tasks');

const recordPath = (taskId: string): string =>
  join(storeDir(), `${taskId}.json`);

export const readLocalTask = async (
  taskId: string,
): Promise<LocalTaskRecord> => {
  const data = await readFile(recordPath(taskId), 'utf8');
  return JSON.parse(data) as LocalTaskRecord;
};

export const writeLocalTask = async (
  record: LocalTaskRecord,
): Promise<void> => {
  await mkdir(storeDir(), {recursive: true});
  const target = recordPath(record.id);
  const temporary = `${target}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary, JSON.stringify(record, null, 2), 'utf8');
  await rename(temporary, target);
};

export const createLocalTask = async (
  request: GeneratedVideoRequest,
): Promise<string> => {
  const id = `local_${randomUUID()}`;
  const now = new Date().toISOString();
  const record: LocalTaskRecord = {
    id,
    backend: 'local',
    status: 'queued',
    createdAt: now,
    updatedAt: now,
    request,
  };

  await writeLocalTask(record);

  const workerPath = fileURLToPath(new URL('./local-worker.js', import.meta.url));
  const child = spawn(process.execPath, [workerPath, id], {
    detached: true,
    stdio: 'ignore',
    cwd: process.cwd(),
    env: process.env,
  });
  child.unref();

  return id;
};
