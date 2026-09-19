export type GeneratedVideoRequest = {
  reactCode: string;
  compositionId: string;
  durationInFrames: number;
  fps: number;
  width: number;
  height: number;
  inputProps: Record<string, unknown>;
};

export type GeneratedVideoResult = {
  bucket: string;
  key: string;
  contentType: string;
  sizeInBytes: number;
  videoUrl: string;
};

export type LocalTaskStatus = 'queued' | 'running' | 'completed' | 'failed';

export type LocalTaskRecord = {
  id: string;
  backend: 'local';
  status: LocalTaskStatus;
  createdAt: string;
  updatedAt: string;
  request: GeneratedVideoRequest;
  result?: GeneratedVideoResult;
  error?: string;
};
