import {listLocalCompletedVideosPage} from './local-store.js';
import {publicBaseUrl, storageBackend} from './runtime.js';
import {
  getS3Bucket,
  getVideoUrl,
  listObjectPage,
} from './s3.js';

const VIDEO_PREFIX = 'remotion-mcp/videos/';
const VIDEO_SUFFIX = '.mp4';

const localVideoUrl = ({
  taskId,
  token,
}: {
  taskId: string;
  token: string;
}): string => {
  const encodedTaskId = encodeURIComponent(taskId);
  const encodedToken = encodeURIComponent(token);
  return `${publicBaseUrl()}/video/${encodedTaskId}.mp4?token=${encodedToken}`;
};

export const listGeneratedVideos = async ({
  limit,
  cursor,
}: {
  limit: number;
  cursor?: string;
}) => {
  if (storageBackend() === 'local') {
    const page = await listLocalCompletedVideosPage({limit, cursor});
    return {
      storage: 'local' as const,
      items: page.items.map((item) => ({
        taskId: item.taskId,
        sizeInBytes: item.sizeInBytes,
        lastModified: item.lastModified,
        videoUrl: localVideoUrl({
          taskId: item.taskId,
          token: item.renderToken,
        }),
      })),
      nextCursor: page.nextCursor ?? null,
    };
  }

  const page = await listObjectPage({
    prefix: VIDEO_PREFIX,
    limit,
    cursor,
  });
  const bucket = getS3Bucket();

  const items = await Promise.all(
    page.items
      .filter((item) => item.key.endsWith(VIDEO_SUFFIX))
      .map(async (item) => ({
        taskId: item.key.slice(VIDEO_PREFIX.length, -VIDEO_SUFFIX.length),
        sizeInBytes: item.sizeInBytes,
        lastModified: item.lastModified,
        videoUrl: await getVideoUrl({bucket, key: item.key}),
      })),
  );

  return {
    storage: 's3' as const,
    items,
    nextCursor: page.nextCursor ?? null,
  };
};
