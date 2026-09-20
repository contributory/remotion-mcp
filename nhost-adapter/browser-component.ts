import {transform} from 'sucrase';
import type {GeneratedVideoRequest} from '../src/task-types.js';

declare const __REMOTION_MCP_BROWSER_RUNTIME__: string;

const escapeScript = (javascript: string): string =>
  javascript.replace(/<\/script/gi, '<\\/script');

const compileUserComponent = (reactCode: string): string =>
  transform(reactCode, {
    transforms: ['typescript', 'jsx', 'imports'],
    filePath: 'remotion-mcp-user-component.tsx',
    jsxRuntime: 'classic',
    production: true,
  }).code;

export const compileBrowserPage = async ({
  taskId,
  request,
  videoUploadUrl,
  statusUploadUrl,
  videoViewUrl,
}: {
  taskId: string;
  request: GeneratedVideoRequest;
  videoUploadUrl: string;
  statusUploadUrl: string;
  videoViewUrl: string;
}): Promise<string> => {
  const userJavascript = compileUserComponent(request.reactCode);

  const javascript = `
${__REMOTION_MCP_BROWSER_RUNTIME__}

const runtime = globalThis.__REMOTION_MCP_RUNTIME__;
if (!runtime) {
  throw new Error('Remotion browser runtime failed to initialize.');
}

const requireModule = (specifier) => {
  if (specifier === 'react') return runtime.React;
  if (specifier === 'remotion') return runtime.Remotion;
  if (specifier === '@remotion/web-renderer') return runtime.WebRenderer;
  throw new Error('Unsupported browser-render import: ' + specifier);
};

const userModule = {exports: {}};
((module, exports, require) => {
${userJavascript}
})(userModule, userModule.exports, requireModule);

const Component = userModule.exports.default ?? userModule.exports;
if (!Component) {
  throw new Error('React source must default-export a component.');
}

const {renderMediaOnWeb} = runtime.WebRenderer;
const taskId = ${JSON.stringify(taskId)};
const config = ${JSON.stringify({
    compositionId: request.compositionId,
    durationInFrames: request.durationInFrames,
    fps: request.fps,
    width: request.width,
    height: request.height,
    inputProps: request.inputProps,
  })};
const videoUploadUrl = ${JSON.stringify(videoUploadUrl)};
const statusUploadUrl = ${JSON.stringify(statusUploadUrl)};
const videoViewUrl = ${JSON.stringify(videoViewUrl)};

const statusElement = document.getElementById('status');
const fillElement = document.getElementById('fill');
const progressElement = document.getElementById('progress');
const errorElement = document.getElementById('error');
let lastUploadedProgress = -1;
let stateQueue = Promise.resolve();

const updateUi = (message, progress) => {
  if (statusElement) statusElement.textContent = message;
  if (typeof progress === 'number') {
    const pct = Math.max(0, Math.min(100, Math.round(progress * 100)));
    if (fillElement) fillElement.style.width = pct + '%';
    if (progressElement) progressElement.textContent = pct + '%';
  }
};

const writeStateNow = async (state) => {
  const response = await fetch(statusUploadUrl, {
    method: 'PUT',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({
      ...state,
      updatedAt: new Date().toISOString(),
    }),
  });

  if (!response.ok) {
    throw new Error(
      'Failed to update task status: ' +
        response.status +
        ' ' +
        (await response.text()),
    );
  }
};

const writeState = (state) => {
  stateQueue = stateQueue.then(() => writeStateNow(state));
  return stateQueue;
};

const fail = async (error) => {
  const message =
    error instanceof Error ? error.stack || error.message : String(error);

  updateUi('Render failed');
  if (errorElement) {
    errorElement.hidden = false;
    errorElement.textContent = message;
  }

  try {
    await writeState({
      status: 'failed',
      progress: 0,
      error: message,
    });
  } catch (statusError) {
    console.error(statusError);
  }
};

const run = async () => {
  try {
    await writeState({status: 'rendering', progress: 0});
    updateUi('Rendering in this browser…', 0);

    const rendered = await renderMediaOnWeb({
      composition: {
        id: config.compositionId,
        component: Component,
        durationInFrames: config.durationInFrames,
        fps: config.fps,
        width: config.width,
        height: config.height,
      },
      inputProps: config.inputProps,
      container: 'mp4',
      onProgress: ({progress}) => {
        updateUi('Rendering in this browser…', progress);

        const bucket = Math.floor(progress * 20);
        if (bucket > lastUploadedProgress) {
          lastUploadedProgress = bucket;
          void writeState({
            status: 'rendering',
            progress,
          }).catch(console.error);
        }
      },
    });

    updateUi('Uploading video…', 1);
    await writeState({status: 'uploading', progress: 1});

    const blob = await rendered.getBlob();
    const uploadResponse = await fetch(videoUploadUrl, {
      method: 'PUT',
      headers: {'content-type': 'video/mp4'},
      body: blob,
    });

    if (!uploadResponse.ok) {
      throw new Error(
        'Video upload failed: ' +
          uploadResponse.status +
          ' ' +
          (await uploadResponse.text()),
      );
    }

    await writeState({
      status: 'completed',
      progress: 1,
    });

    updateUi('Completed', 1);

    if (progressElement) {
      progressElement.textContent = '';
      const link = document.createElement('a');
      link.href = videoViewUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = 'Open rendered video';
      progressElement.append(link);
    }
  } catch (error) {
    await fail(error);
  }
};

void run();
`;

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Remotion render ${taskId}</title>
  <style>
    :root{color-scheme:dark}
    body{font-family:system-ui,sans-serif;max-width:760px;margin:48px auto;padding:0 20px;background:#111;color:#eee}
    .bar{height:14px;background:#333;border-radius:999px;overflow:hidden}
    .fill{height:100%;width:0;background:#fff;transition:width .15s linear}
    pre{white-space:pre-wrap;background:#1b1b1b;padding:12px;border-radius:8px;overflow:auto}
    a{color:#fff}
    .muted{color:#aaa}
  </style>
</head>
<body>
  <h1>Rendering video</h1>
  <p class="muted">Task <code>${taskId}</code></p>
  <p id="status">Preparing renderer…</p>
  <div class="bar"><div class="fill" id="fill"></div></div>
  <p id="progress">0%</p>
  <pre id="error" hidden></pre>
  <script>${escapeScript(javascript)}</script>
</body>
</html>`;
};
