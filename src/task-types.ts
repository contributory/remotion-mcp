export type GeneratedVideoRequest = {
  reactCode: string;
  compositionId: string;
  durationInFrames: number;
  fps: number;
  width: number;
  height: number;
  inputProps: Record<string, unknown>;
};

export type BrowserRenderStatus =
  | 'waiting_for_browser'
  | 'rendering'
  | 'uploading'
  | 'completed'
  | 'failed';

export type BrowserRenderState = {
  status: BrowserRenderStatus;
  progress: number;
  updatedAt: string;
  error?: string;
};

export type LocalBrowserRenderJob = {
  id: string;
  backend: 'local';
  createdAt: string;
  request: GeneratedVideoRequest;
  renderToken: string;
};

export type BrowserRenderJob = {
  id: string;
  backend: 'local' | 'browser' | 'trigger';
  createdAt: string;
  compositionId: string;
  durationInFrames: number;
  fps: number;
  width: number;
  height: number;
  inputProps: Record<string, unknown>;
  renderKey: string;
  statusKey: string;
  outputKey: string;
  triggerRunId?: string;
};
