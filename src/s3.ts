import {
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from '@aws-sdk/client-s3';
import {getSignedUrl} from '@aws-sdk/s3-request-presigner';

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

const getClient = (): S3Client => {
  const config: S3ClientConfig = {
    region: process.env.S3_REGION ?? 'us-east-1',
  };

  if (process.env.S3_ENDPOINT) {
    config.endpoint = process.env.S3_ENDPOINT;
  }

  if (process.env.S3_FORCE_PATH_STYLE === 'true') {
    config.forcePathStyle = true;
  }

  if (process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY) {
    config.credentials = {
      accessKeyId: process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    };
  }

  return new S3Client(config);
};

export const getS3Bucket = (): string => required('S3_BUCKET');

const signedLifetime = (): number =>
  Math.min(
    Number(process.env.S3_RENDER_URL_EXPIRES_SECONDS ?? 86400),
    604800,
  );

export const putObject = async ({
  key,
  body,
  contentType,
}: {
  key: string;
  body: string | Uint8Array;
  contentType: string;
}): Promise<void> => {
  await getClient().send(
    new PutObjectCommand({
      Bucket: getS3Bucket(),
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: 'no-store',
    }),
  );
};

export const getTextObject = async (key: string): Promise<string> => {
  const response = await getClient().send(
    new GetObjectCommand({
      Bucket: getS3Bucket(),
      Key: key,
    }),
  );

  if (!response.Body) {
    throw new Error(`S3 object has no body: ${key}`);
  }

  return response.Body.transformToString();
};


export type ListedObject = {
  key: string;
  sizeInBytes: number;
  lastModified?: string;
};

export const listObjectPage = async ({
  prefix,
  limit,
  cursor,
}: {
  prefix: string;
  limit: number;
  cursor?: string;
}): Promise<{items: ListedObject[]; nextCursor?: string}> => {
  const response = await getClient().send(
    new ListObjectsV2Command({
      Bucket: getS3Bucket(),
      Prefix: prefix,
      MaxKeys: limit,
      ContinuationToken: cursor,
    }),
  );

  return {
    items: (response.Contents ?? [])
      .filter((object) => Boolean(object.Key))
      .map((object) => ({
        key: object.Key!,
        sizeInBytes: object.Size ?? 0,
        lastModified: object.LastModified?.toISOString(),
      })),
    nextCursor: response.IsTruncated
      ? response.NextContinuationToken
      : undefined,
  };
};

export const listObjectKeys = async (prefix: string): Promise<string[]> => {
  const keys: string[] = [];
  let continuationToken: string | undefined;

  do {
    const response = await getClient().send(
      new ListObjectsV2Command({
        Bucket: getS3Bucket(),
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    );

    for (const object of response.Contents ?? []) {
      if (object.Key) keys.push(object.Key);
    }

    continuationToken = response.IsTruncated
      ? response.NextContinuationToken
      : undefined;
  } while (continuationToken);

  return keys;
};

export const getObjectUrl = async (key: string): Promise<string> =>
  getSignedUrl(
    getClient(),
    new GetObjectCommand({
      Bucket: getS3Bucket(),
      Key: key,
    }),
    {expiresIn: signedLifetime()},
  );

export const createPutUrl = async ({
  key,
  contentType,
}: {
  key: string;
  contentType: string;
}): Promise<string> =>
  getSignedUrl(
    getClient(),
    new PutObjectCommand({
      Bucket: getS3Bucket(),
      Key: key,
      ContentType: contentType,
    }),
    {expiresIn: signedLifetime()},
  );

export const headObject = async (key: string) =>
  getClient().send(
    new HeadObjectCommand({
      Bucket: getS3Bucket(),
      Key: key,
    }),
  );

export const getVideoUrl = async ({
  bucket,
  key,
}: {
  bucket: string;
  key: string;
}): Promise<string> => {
  const publicBaseUrl = process.env.S3_PUBLIC_BASE_URL?.replace(/\/$/, '');
  if (publicBaseUrl) {
    return `${publicBaseUrl}/${key.split('/').map(encodeURIComponent).join('/')}`;
  }

  return getObjectUrl(key);
};
