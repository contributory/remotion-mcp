import {createReadStream} from 'node:fs';
import {stat} from 'node:fs/promises';
import {
  GetObjectCommand,
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

export const uploadVideo = async ({
  filePath,
  key,
}: {
  filePath: string;
  key: string;
}) => {
  const client = getClient();
  const bucket = getS3Bucket();
  const info = await stat(filePath);

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: createReadStream(filePath),
      ContentLength: info.size,
      ContentType: 'video/mp4',
    }),
  );

  return {
    bucket,
    key,
    contentType: 'video/mp4',
    sizeInBytes: info.size,
  };
};

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

  const expiresIn = Math.min(
    Number(process.env.S3_SIGNED_URL_EXPIRES_SECONDS ?? 3600),
    604800,
  );

  return getSignedUrl(
    getClient(),
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
    {expiresIn},
  );
};
