import {
  mkdir,
  readFile,
  readdir,
  rename,
  writeFile,
} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {storageBackend} from './runtime.js';
import {
  getTextObject,
  headObject,
  listObjectKeys,
  putObject,
} from './s3.js';

export type StoredComposition = {
  id: string;
  reactCode: string;
  durationInFrames: number;
  fps: number;
  width: number;
  height: number;
  defaultProps: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type StoredCompositionSummary = Omit<StoredComposition, 'reactCode'>;

const localRoot = (): string =>
  process.env.REMOTION_MCP_DATA_DIR ??
  join(homedir(), '.remotion-mcp');

const localCompositionDir = (): string =>
  join(localRoot(), 'compositions');

const localCompositionPath = (id: string): string =>
  join(localCompositionDir(), `${encodeURIComponent(id)}.json`);

const s3Prefix = 'remotion-mcp/compositions/';

const s3CompositionKey = (id: string): string =>
  `${s3Prefix}${encodeURIComponent(id)}.json`;

const toSummary = (
  composition: StoredComposition,
): StoredCompositionSummary => {
  const {reactCode: _reactCode, ...summary} = composition;
  return summary;
};

const readLocalComposition = async (
  id: string,
): Promise<StoredComposition> =>
  JSON.parse(
    await readFile(localCompositionPath(id), 'utf8'),
  ) as StoredComposition;

const localExists = async (id: string): Promise<boolean> => {
  try {
    await readFile(localCompositionPath(id), 'utf8');
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
};

const s3Exists = async (id: string): Promise<boolean> => {
  try {
    await headObject(s3CompositionKey(id));
    return true;
  } catch (error) {
    const statusCode = (error as {$metadata?: {httpStatusCode?: number}})
      .$metadata?.httpStatusCode;
    if (statusCode === 404) return false;

    const name = (error as {name?: string}).name;
    if (name === 'NotFound' || name === 'NoSuchKey') return false;

    throw error;
  }
};

export const createStoredComposition = async ({
  id,
  reactCode,
  durationInFrames,
  fps,
  width,
  height,
  defaultProps,
  overwrite,
}: {
  id: string;
  reactCode: string;
  durationInFrames: number;
  fps: number;
  width: number;
  height: number;
  defaultProps: Record<string, unknown>;
  overwrite: boolean;
}): Promise<StoredCompositionSummary> => {
  const backend = storageBackend();
  const exists =
    backend === 'local' ? await localExists(id) : await s3Exists(id);

  if (exists && !overwrite) {
    throw new Error(
      `Composition "${id}" already exists. Pass overwrite=true to replace it.`,
    );
  }

  const existing = exists
    ? await getStoredComposition(id)
    : undefined;
  const now = new Date().toISOString();

  const composition: StoredComposition = {
    id,
    reactCode,
    durationInFrames,
    fps,
    width,
    height,
    defaultProps,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  if (backend === 'local') {
    await mkdir(localCompositionDir(), {recursive: true});
    const target = localCompositionPath(id);
    const temporary = `${target}.tmp-${process.pid}-${Date.now()}`;
    await writeFile(
      temporary,
      JSON.stringify(composition, null, 2),
      'utf8',
    );
    await rename(temporary, target);
  } else {
    await putObject({
      key: s3CompositionKey(id),
      body: JSON.stringify(composition),
      contentType: 'application/json',
    });
  }

  return toSummary(composition);
};

export const getStoredComposition = async (
  id: string,
): Promise<StoredComposition> => {
  if (storageBackend() === 'local') {
    try {
      return await readLocalComposition(id);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`Composition "${id}" not found.`);
      }
      throw error;
    }
  }

  try {
    return JSON.parse(
      await getTextObject(s3CompositionKey(id)),
    ) as StoredComposition;
  } catch (error) {
    const statusCode = (error as {$metadata?: {httpStatusCode?: number}})
      .$metadata?.httpStatusCode;
    const name = (error as {name?: string}).name;
    if (
      statusCode === 404 ||
      name === 'NotFound' ||
      name === 'NoSuchKey'
    ) {
      throw new Error(`Composition "${id}" not found.`);
    }
    throw error;
  }
};

export const listStoredCompositions = async (): Promise<
  StoredCompositionSummary[]
> => {
  if (storageBackend() === 'local') {
    try {
      const entries = await readdir(localCompositionDir(), {
        withFileTypes: true,
      });

      const compositions = await Promise.all(
        entries
          .filter(
            (entry) =>
              entry.isFile() && entry.name.endsWith('.json'),
          )
          .map(async (entry) => {
            const parsed = JSON.parse(
              await readFile(
                join(localCompositionDir(), entry.name),
                'utf8',
              ),
            ) as StoredComposition;
            return toSummary(parsed);
          }),
      );

      return compositions.sort((a, b) =>
        a.id.localeCompare(b.id),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  const keys = (await listObjectKeys(s3Prefix)).filter((key) =>
    key.endsWith('.json'),
  );

  const compositions = await Promise.all(
    keys.map(async (key) =>
      toSummary(
        JSON.parse(await getTextObject(key)) as StoredComposition,
      ),
    ),
  );

  return compositions.sort((a, b) => a.id.localeCompare(b.id));
};
