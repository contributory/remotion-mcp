// adapter-src/runtime.ts
import { timingSafeEqual } from "node:crypto";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

// adapter-src/mcp-server.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";

// ../src/async-render.ts
import { randomBytes, randomUUID } from "node:crypto";
import { runs, tasks } from "@trigger.dev/sdk";

// adapter-src/browser-component.ts
import { dirname } from "node:path";
import { createRequire } from "node:module";
import { build } from "esbuild";
var require2 = createRequire(import.meta.url);
var packageRoot = dirname(require2.resolve("remotion/package.json"));
var userComponentPlugin = (reactCode) => ({
  name: "remotion-mcp-user-component",
  setup(buildApi) {
    buildApi.onResolve({ filter: /^remotion-mcp:user-component$/ }, () => ({
      path: "user-component",
      namespace: "remotion-mcp"
    }));
    buildApi.onLoad(
      { filter: /.*/, namespace: "remotion-mcp" },
      () => ({
        contents: reactCode,
        loader: "tsx",
        resolveDir: packageRoot
      })
    );
  }
});
var escapeScript = (javascript) => javascript.replace(/<\/script/gi, "<\\/script");
var compileBrowserPage = async ({
  taskId,
  request,
  videoUploadUrl,
  statusUploadUrl,
  videoViewUrl
}) => {
  const entry = `
import {renderMediaOnWeb} from '@remotion/web-renderer';
import Component from 'remotion-mcp:user-component';

const taskId = ${JSON.stringify(taskId)};
const config = ${JSON.stringify({
    compositionId: request.compositionId,
    durationInFrames: request.durationInFrames,
    fps: request.fps,
    width: request.width,
    height: request.height,
    inputProps: request.inputProps
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
    updateUi('Rendering in this browser\u2026', 0);

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
        updateUi('Rendering in this browser\u2026', progress);

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

    updateUi('Uploading video\u2026', 1);
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
  const result = await build({
    stdin: {
      contents: entry,
      sourcefile: "remotion-mcp-browser-runner.tsx",
      loader: "tsx",
      resolveDir: packageRoot
    },
    plugins: [userComponentPlugin(request.reactCode)],
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
    target: ["es2022"],
    sourcemap: false,
    minify: true,
    logLevel: "silent",
    define: {
      "process.env.NODE_ENV": '"production"'
    }
  });
  const javascript = result.outputFiles[0]?.text;
  if (!javascript) {
    throw new Error("Failed to compile browser render page.");
  }
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
  <p id="status">Preparing renderer\u2026</p>
  <div class="bar"><div class="fill" id="fill"></div></div>
  <p id="progress">0%</p>
  <pre id="error" hidden></pre>
  <script type="module">${escapeScript(javascript)}</script>
</body>
</html>`;
};

// ../src/local-store.ts
import {
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
var rootDir = () => process.env.REMOTION_MCP_DATA_DIR ?? join(homedir(), ".remotion-mcp");
var taskDir = (taskId) => join(rootDir(), "tasks", taskId);
var jobPath = (taskId) => join(taskDir(taskId), "job.json");
var statusPath = (taskId) => join(taskDir(taskId), "status.json");
var renderPagePath = (taskId) => join(taskDir(taskId), "render.html");
var videoPath = (taskId) => join(taskDir(taskId), "video.mp4");
var atomicJsonWrite = async (path, value) => {
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary, JSON.stringify(value, null, 2), "utf8");
  await rename(temporary, path);
};
var readLegacyLocalRequest = async (taskId) => {
  const legacyPath = join(rootDir(), "tasks", `${taskId}.json`);
  try {
    const record2 = JSON.parse(await readFile(legacyPath, "utf8"));
    return record2.request ?? null;
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
};
var createLocalJob = async ({
  taskId,
  request,
  renderHtml,
  renderToken
}) => {
  await mkdir(taskDir(taskId), { recursive: true });
  const createdAt = (/* @__PURE__ */ new Date()).toISOString();
  const job = {
    id: taskId,
    backend: "local",
    createdAt,
    request,
    renderToken
  };
  await Promise.all([
    atomicJsonWrite(jobPath(taskId), job),
    atomicJsonWrite(statusPath(taskId), {
      status: "waiting_for_browser",
      progress: 0,
      updatedAt: createdAt
    }),
    writeFile(renderPagePath(taskId), renderHtml, "utf8")
  ]);
  return job;
};
var readLocalJob = async (taskId) => JSON.parse(await readFile(jobPath(taskId), "utf8"));
var readLocalState = async (taskId) => JSON.parse(await readFile(statusPath(taskId), "utf8"));
var localVideoInfo = async (taskId) => stat(videoPath(taskId));

// ../src/s3.ts
import {
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
var required = (name) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};
var getClient = () => {
  const config = {
    region: process.env.S3_REGION ?? "us-east-1"
  };
  if (process.env.S3_ENDPOINT) {
    config.endpoint = process.env.S3_ENDPOINT;
  }
  if (process.env.S3_FORCE_PATH_STYLE === "true") {
    config.forcePathStyle = true;
  }
  if (process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY) {
    config.credentials = {
      accessKeyId: process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY
    };
  }
  return new S3Client(config);
};
var getS3Bucket = () => required("S3_BUCKET");
var signedLifetime = () => Math.min(
  Number(process.env.S3_RENDER_URL_EXPIRES_SECONDS ?? 86400),
  604800
);
var putObject = async ({
  key,
  body,
  contentType
}) => {
  await getClient().send(
    new PutObjectCommand({
      Bucket: getS3Bucket(),
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: "no-store"
    })
  );
};
var getTextObject = async (key) => {
  const response = await getClient().send(
    new GetObjectCommand({
      Bucket: getS3Bucket(),
      Key: key
    })
  );
  if (!response.Body) {
    throw new Error(`S3 object has no body: ${key}`);
  }
  return response.Body.transformToString();
};
var listObjectKeys = async (prefix) => {
  const keys = [];
  let continuationToken;
  do {
    const response = await getClient().send(
      new ListObjectsV2Command({
        Bucket: getS3Bucket(),
        Prefix: prefix,
        ContinuationToken: continuationToken
      })
    );
    for (const object of response.Contents ?? []) {
      if (object.Key) keys.push(object.Key);
    }
    continuationToken = response.IsTruncated ? response.NextContinuationToken : void 0;
  } while (continuationToken);
  return keys;
};
var getObjectUrl = async (key) => getSignedUrl(
  getClient(),
  new GetObjectCommand({
    Bucket: getS3Bucket(),
    Key: key
  }),
  { expiresIn: signedLifetime() }
);
var createPutUrl = async ({
  key,
  contentType
}) => getSignedUrl(
  getClient(),
  new PutObjectCommand({
    Bucket: getS3Bucket(),
    Key: key,
    ContentType: contentType
  }),
  { expiresIn: signedLifetime() }
);
var headObject = async (key) => getClient().send(
  new HeadObjectCommand({
    Bucket: getS3Bucket(),
    Key: key
  })
);
var getVideoUrl = async ({
  bucket,
  key
}) => {
  const publicBaseUrl2 = process.env.S3_PUBLIC_BASE_URL?.replace(/\/$/, "");
  if (publicBaseUrl2) {
    return `${publicBaseUrl2}/${key.split("/").map(encodeURIComponent).join("/")}`;
  }
  return getObjectUrl(key);
};

// ../src/job-store.ts
var jobKey = (taskId) => `remotion-mcp/jobs/${taskId}/job.json`;
var renderKey = (taskId) => `remotion-mcp/jobs/${taskId}/render.html`;
var statusKey = (taskId) => `remotion-mcp/jobs/${taskId}/status.json`;
var outputKey = (taskId) => `remotion-mcp/videos/${taskId}.mp4`;
var saveJob = async (job) => {
  await putObject({
    key: jobKey(job.id),
    body: JSON.stringify(job),
    contentType: "application/json"
  });
};
var readJob = async (taskId) => JSON.parse(await getTextObject(jobKey(taskId)));
var saveState = async (key, state) => {
  await putObject({
    key,
    body: JSON.stringify(state),
    contentType: "application/json"
  });
};
var readState = async (key) => JSON.parse(await getTextObject(key));

// ../src/runtime.ts
var isTruthy = (value) => value === "1" || value === "true" || value === "yes";
var isStatelessEnvironment = () => isTruthy(process.env.REMOTION_MCP_STATELESS) || Boolean(
  process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.K_SERVICE || process.env.FUNCTIONS_WORKER_RUNTIME || process.env.NETLIFY || process.env.CF_PAGES
);
var executionBackend = () => isStatelessEnvironment() ? "trigger" : "local";
var storageBackend = () => isStatelessEnvironment() || Boolean(process.env.S3_BUCKET) ? "s3" : "local";
var httpPort = () => Number(process.env.REMOTION_MCP_HTTP_PORT ?? process.env.PORT ?? 3847);
var publicBaseUrl = () => {
  const explicit = process.env.REMOTION_MCP_PUBLIC_BASE_URL?.replace(/\/$/, "");
  if (explicit) return explicit;
  return `http://127.0.0.1:${httpPort()}`;
};

// ../src/async-render.ts
var localUrls = ({
  taskId,
  token
}) => {
  const base = publicBaseUrl();
  const encodedTaskId = encodeURIComponent(taskId);
  const encodedToken = encodeURIComponent(token);
  const renderPath = `/render/${encodedTaskId}?token=${encodedToken}`;
  const videoPath2 = `/video/${encodedTaskId}.mp4?token=${encodedToken}`;
  return {
    renderUrl: `${base}${renderPath}`,
    statusUploadUrl: `/api/local/jobs/${encodedTaskId}/status?token=${encodedToken}`,
    videoUploadUrl: `/api/local/jobs/${encodedTaskId}/video?token=${encodedToken}`,
    videoViewUrl: videoPath2,
    absoluteVideoViewUrl: `${base}${videoPath2}`
  };
};
var startLocalTask = async (request) => {
  const taskId = `render_${randomUUID()}`;
  const token = randomBytes(32).toString("base64url");
  const urls = localUrls({ taskId, token });
  const renderHtml = await compileBrowserPage({
    taskId,
    request,
    videoUploadUrl: urls.videoUploadUrl,
    statusUploadUrl: urls.statusUploadUrl,
    videoViewUrl: urls.videoViewUrl
  });
  await createLocalJob({
    taskId,
    request,
    renderHtml,
    renderToken: token
  });
  return {
    taskId,
    backend: "local",
    storage: "local",
    renderUrl: urls.renderUrl,
    status: "waiting_for_browser"
  };
};
var startS3Task = async (request) => {
  const backend = executionBackend();
  if (backend === "trigger" && !process.env.TRIGGER_SECRET_KEY) {
    throw new Error("TRIGGER_SECRET_KEY is required in stateless mode.");
  }
  const taskId = `render_${randomUUID()}`;
  const createdAt = (/* @__PURE__ */ new Date()).toISOString();
  const jobRenderKey = renderKey(taskId);
  const jobStatusKey = statusKey(taskId);
  const jobOutputKey = outputKey(taskId);
  const [videoUploadUrl, statusUploadUrl, videoViewUrl] = await Promise.all([
    createPutUrl({
      key: jobOutputKey,
      contentType: "video/mp4"
    }),
    createPutUrl({
      key: jobStatusKey,
      contentType: "application/json"
    }),
    getVideoUrl({
      bucket: getS3Bucket(),
      key: jobOutputKey
    })
  ]);
  const renderHtml = await compileBrowserPage({
    taskId,
    request,
    videoUploadUrl,
    statusUploadUrl,
    videoViewUrl
  });
  const job = {
    id: taskId,
    backend,
    createdAt,
    compositionId: request.compositionId,
    durationInFrames: request.durationInFrames,
    fps: request.fps,
    width: request.width,
    height: request.height,
    inputProps: request.inputProps,
    renderKey: jobRenderKey,
    statusKey: jobStatusKey,
    outputKey: jobOutputKey
  };
  await Promise.all([
    saveJob(job),
    saveState(jobStatusKey, {
      status: "waiting_for_browser",
      progress: 0,
      updatedAt: createdAt
    }),
    putObject({
      key: jobRenderKey,
      body: renderHtml,
      contentType: "text/html; charset=utf-8"
    })
  ]);
  if (backend === "trigger") {
    const handle = await tasks.trigger("remotion-browser-render-job", {
      taskId,
      statusKey: jobStatusKey,
      outputKey: jobOutputKey
    });
    job.triggerRunId = handle.id;
    await saveJob(job);
  }
  return {
    taskId,
    backend,
    storage: "s3",
    renderUrl: await getObjectUrl(jobRenderKey),
    status: "waiting_for_browser"
  };
};
var startGeneratedVideoTask = async (request) => storageBackend() === "local" ? startLocalTask(request) : startS3Task(request);
var migrateLegacyLocalTask = async (taskId) => {
  const request = await readLegacyLocalRequest(taskId);
  if (!request) return null;
  const token = randomBytes(32).toString("base64url");
  const urls = localUrls({ taskId, token });
  const renderHtml = await compileBrowserPage({
    taskId,
    request,
    videoUploadUrl: urls.videoUploadUrl,
    statusUploadUrl: urls.statusUploadUrl,
    videoViewUrl: urls.videoViewUrl
  });
  return createLocalJob({
    taskId,
    request,
    renderHtml,
    renderToken: token
  });
};
var checkLocalTask = async (taskId) => {
  let job;
  try {
    job = await readLocalJob(taskId);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    job = await migrateLegacyLocalTask(taskId);
    if (!job) throw error;
  }
  const state = await readLocalState(taskId);
  const urls = localUrls({ taskId, token: job.renderToken });
  if (state.status === "completed") {
    const info = await localVideoInfo(taskId);
    return {
      taskId,
      backend: "local",
      storage: "local",
      status: "completed",
      progress: 1,
      contentType: "video/mp4",
      sizeInBytes: info.size,
      videoUrl: urls.absoluteVideoViewUrl,
      createdAt: job.createdAt,
      updatedAt: state.updatedAt
    };
  }
  return {
    taskId,
    backend: "local",
    storage: "local",
    status: state.status,
    progress: state.progress,
    error: state.error,
    renderUrl: urls.renderUrl,
    createdAt: job.createdAt,
    updatedAt: state.updatedAt
  };
};
var checkS3Task = async (taskId) => {
  const job = await readJob(taskId);
  const state = await readState(job.statusKey);
  const renderUrl = state.status === "completed" ? void 0 : await getObjectUrl(job.renderKey);
  let triggerStatus;
  let triggerError;
  if (job.triggerRunId) {
    const run = await runs.retrieve(job.triggerRunId);
    triggerStatus = run.status;
    triggerError = run.error?.message;
  }
  if (state.status === "completed") {
    const object = await headObject(job.outputKey);
    return {
      taskId,
      backend: job.backend,
      storage: "s3",
      status: "completed",
      progress: 1,
      bucket: getS3Bucket(),
      key: job.outputKey,
      contentType: object.ContentType ?? "video/mp4",
      sizeInBytes: object.ContentLength ?? 0,
      videoUrl: await getVideoUrl({
        bucket: getS3Bucket(),
        key: job.outputKey
      }),
      triggerRunId: job.triggerRunId,
      triggerStatus
    };
  }
  return {
    taskId,
    backend: job.backend,
    storage: "s3",
    status: state.status,
    progress: state.progress,
    error: state.error ?? triggerError,
    renderUrl,
    triggerRunId: job.triggerRunId,
    triggerStatus,
    createdAt: job.createdAt,
    updatedAt: state.updatedAt
  };
};
var checkGeneratedVideoTask = async (taskId) => storageBackend() === "local" ? checkLocalTask(taskId) : checkS3Task(taskId);

// ../src/composition-store.ts
import {
  mkdir as mkdir2,
  readFile as readFile2,
  readdir,
  rename as rename2,
  writeFile as writeFile2
} from "node:fs/promises";
import { homedir as homedir2 } from "node:os";
import { join as join2 } from "node:path";
var localRoot = () => process.env.REMOTION_MCP_DATA_DIR ?? join2(homedir2(), ".remotion-mcp");
var localCompositionDir = () => join2(localRoot(), "compositions");
var localCompositionPath = (id) => join2(localCompositionDir(), `${encodeURIComponent(id)}.json`);
var s3Prefix = "remotion-mcp/compositions/";
var s3CompositionKey = (id) => `${s3Prefix}${encodeURIComponent(id)}.json`;
var toSummary = (composition) => {
  const { reactCode: _reactCode, ...summary } = composition;
  return summary;
};
var readLocalComposition = async (id) => JSON.parse(
  await readFile2(localCompositionPath(id), "utf8")
);
var localExists = async (id) => {
  try {
    await readFile2(localCompositionPath(id), "utf8");
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
};
var s3Exists = async (id) => {
  try {
    await headObject(s3CompositionKey(id));
    return true;
  } catch (error) {
    const statusCode = error.$metadata?.httpStatusCode;
    if (statusCode === 404) return false;
    const name = error.name;
    if (name === "NotFound" || name === "NoSuchKey") return false;
    throw error;
  }
};
var createStoredComposition = async ({
  id,
  reactCode,
  durationInFrames,
  fps,
  width,
  height,
  defaultProps,
  overwrite
}) => {
  const backend = storageBackend();
  const exists = backend === "local" ? await localExists(id) : await s3Exists(id);
  if (exists && !overwrite) {
    throw new Error(
      `Composition "${id}" already exists. Pass overwrite=true to replace it.`
    );
  }
  const existing = exists ? await getStoredComposition(id) : void 0;
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const composition = {
    id,
    reactCode,
    durationInFrames,
    fps,
    width,
    height,
    defaultProps,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  };
  if (backend === "local") {
    await mkdir2(localCompositionDir(), { recursive: true });
    const target = localCompositionPath(id);
    const temporary = `${target}.tmp-${process.pid}-${Date.now()}`;
    await writeFile2(
      temporary,
      JSON.stringify(composition, null, 2),
      "utf8"
    );
    await rename2(temporary, target);
  } else {
    await putObject({
      key: s3CompositionKey(id),
      body: JSON.stringify(composition),
      contentType: "application/json"
    });
  }
  return toSummary(composition);
};
var getStoredComposition = async (id) => {
  if (storageBackend() === "local") {
    try {
      return await readLocalComposition(id);
    } catch (error) {
      if (error.code === "ENOENT") {
        throw new Error(`Composition "${id}" not found.`);
      }
      throw error;
    }
  }
  try {
    return JSON.parse(
      await getTextObject(s3CompositionKey(id))
    );
  } catch (error) {
    const statusCode = error.$metadata?.httpStatusCode;
    const name = error.name;
    if (statusCode === 404 || name === "NotFound" || name === "NoSuchKey") {
      throw new Error(`Composition "${id}" not found.`);
    }
    throw error;
  }
};
var listStoredCompositions = async () => {
  if (storageBackend() === "local") {
    try {
      const entries = await readdir(localCompositionDir(), {
        withFileTypes: true
      });
      const compositions2 = await Promise.all(
        entries.filter(
          (entry) => entry.isFile() && entry.name.endsWith(".json")
        ).map(async (entry) => {
          const parsed = JSON.parse(
            await readFile2(
              join2(localCompositionDir(), entry.name),
              "utf8"
            )
          );
          return toSummary(parsed);
        })
      );
      return compositions2.sort(
        (a, b) => a.id.localeCompare(b.id)
      );
    } catch (error) {
      if (error.code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }
  const keys = (await listObjectKeys(s3Prefix)).filter(
    (key) => key.endsWith(".json")
  );
  const compositions = await Promise.all(
    keys.map(
      async (key) => toSummary(
        JSON.parse(await getTextObject(key))
      )
    )
  );
  return compositions.sort((a, b) => a.id.localeCompare(b.id));
};

// adapter-src/mcp-server.ts
var compositionIdSchema = z.string().min(1).max(120).regex(
  /^[A-Za-z0-9_-]+$/,
  "Composition ID may only contain letters, numbers, underscores, and hyphens"
);
var inputPropsSchema = z.record(z.string(), z.unknown()).optional().default({});
var asText = (value) => ({
  content: [
    {
      type: "text",
      text: JSON.stringify(value, null, 2)
    }
  ]
});
var asError = (error) => ({
  content: [
    {
      type: "text",
      text: error instanceof Error ? error.message : String(error)
    }
  ],
  isError: true
});
var unsupportedOn8Base = () => asError(
  new Error(
    "This traditional server-side Remotion tool is not supported by the 8base compatibility adapter. Use the persisted composition + browser-render tools instead."
  )
);
var create8BaseMcpServer = () => {
  const server = new McpServer({
    name: "remotion-mcp",
    version: "1.5.0-8base"
  });
  server.registerTool(
    "create_composition",
    {
      description: "Persist a reusable React/Remotion composition in S3 for the 8base deployment.",
      inputSchema: {
        compositionId: compositionIdSchema,
        reactCode: z.string().min(1),
        durationInFrames: z.number().int().positive().max(216e3).optional().default(150),
        fps: z.number().int().positive().max(120).optional().default(30),
        width: z.number().int().positive().max(7680).optional().default(1920),
        height: z.number().int().positive().max(4320).optional().default(1080),
        defaultProps: z.record(z.string(), z.unknown()).optional().default({}),
        overwrite: z.boolean().optional().default(false)
      }
    },
    async ({
      compositionId,
      reactCode,
      durationInFrames,
      fps,
      width,
      height,
      defaultProps,
      overwrite
    }) => {
      try {
        return asText(
          await createStoredComposition({
            id: compositionId,
            reactCode,
            durationInFrames,
            fps,
            width,
            height,
            defaultProps,
            overwrite
          })
        );
      } catch (error) {
        return asError(error);
      }
    }
  );
  server.registerTool(
    "list_compositions",
    {
      description: "List reusable compositions persisted in S3.",
      inputSchema: {}
    },
    async () => {
      try {
        return asText(await listStoredCompositions());
      } catch (error) {
        return asError(error);
      }
    }
  );
  server.registerTool(
    "get_composition",
    {
      description: "Get one persisted composition including React source and default props.",
      inputSchema: {
        compositionId: compositionIdSchema
      }
    },
    async ({ compositionId }) => {
      try {
        return asText(await getStoredComposition(compositionId));
      } catch (error) {
        return asError(error);
      }
    }
  );
  server.registerTool(
    "create_video_from_composition",
    {
      description: "Create a browser-render task from a persisted composition. Returns taskId and renderUrl.",
      inputSchema: {
        compositionId: compositionIdSchema,
        inputProps: inputPropsSchema
      }
    },
    async ({ compositionId, inputProps }) => {
      try {
        const composition = await getStoredComposition(compositionId);
        return asText(
          await startGeneratedVideoTask({
            reactCode: composition.reactCode,
            compositionId: composition.id,
            durationInFrames: composition.durationInFrames,
            fps: composition.fps,
            width: composition.width,
            height: composition.height,
            inputProps: {
              ...composition.defaultProps,
              ...inputProps
            }
          })
        );
      } catch (error) {
        return asError(error);
      }
    }
  );
  server.registerTool(
    "create_video_from_react",
    {
      description: "Create a one-off browser-rendered Remotion task from React code. Returns taskId and renderUrl.",
      inputSchema: {
        reactCode: z.string().min(1),
        compositionId: compositionIdSchema.optional().default("GeneratedVideo"),
        durationInFrames: z.number().int().positive().max(216e3).optional().default(150),
        fps: z.number().int().positive().max(120).optional().default(30),
        width: z.number().int().positive().max(7680).optional().default(1920),
        height: z.number().int().positive().max(4320).optional().default(1080),
        inputProps: inputPropsSchema
      }
    },
    async ({
      reactCode,
      compositionId,
      durationInFrames,
      fps,
      width,
      height,
      inputProps
    }) => {
      try {
        return asText(
          await startGeneratedVideoTask({
            reactCode,
            compositionId,
            durationInFrames,
            fps,
            width,
            height,
            inputProps
          })
        );
      } catch (error) {
        return asError(error);
      }
    }
  );
  server.registerTool(
    "check_render_task",
    {
      description: "Check a browser render task and return progress, renderUrl, or final videoUrl.",
      inputSchema: {
        taskId: z.string().min(1)
      }
    },
    async ({ taskId }) => {
      try {
        return asText(await checkGeneratedVideoTask(taskId));
      } catch (error) {
        return asError(error);
      }
    }
  );
  server.registerTool(
    "list_project_compositions",
    {
      description: "Traditional filesystem Remotion project inspection. Not available on 8base Functions.",
      inputSchema: {
        entryPoint: z.string().min(1),
        inputProps: inputPropsSchema
      }
    },
    async () => unsupportedOn8Base()
  );
  server.registerTool(
    "render_video",
    {
      description: "Traditional server-side Remotion rendering. Not available on 8base Functions.",
      inputSchema: {
        entryPoint: z.string().min(1),
        compositionId: z.string().min(1),
        outputPath: z.string().min(1),
        inputProps: inputPropsSchema,
        codec: z.string().optional(),
        concurrency: z.number().int().positive().optional()
      }
    },
    async () => unsupportedOn8Base()
  );
  server.registerTool(
    "render_still",
    {
      description: "Traditional server-side still rendering. Not available on 8base Functions.",
      inputSchema: {
        entryPoint: z.string().min(1),
        compositionId: z.string().min(1),
        outputPath: z.string().min(1),
        inputProps: inputPropsSchema,
        frame: z.number().int().nonnegative().optional().default(0),
        imageFormat: z.enum(["png", "jpeg", "webp"]).optional().default("png")
      }
    },
    async () => unsupportedOn8Base()
  );
  return server;
};

// adapter-src/runtime.ts
var normalizeEvent = (event) => event?.event && typeof event.event === "object" ? event.event : event;
var getHeader = (headers, name) => {
  if (!headers) return void 0;
  const lower = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lower && value != null) {
      return String(value);
    }
  }
  return void 0;
};
var secureEqual = (left, right) => {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
};
var unauthorized = () => ({
  statusCode: 401,
  headers: {
    "content-type": "application/json",
    "www-authenticate": "Bearer"
  },
  body: JSON.stringify({
    error: "Unauthorized"
  })
});
var validateBearerToken = (headers) => {
  const required2 = process.env.MCP_BEARER_TOKEN;
  if (!required2) return true;
  const authorization = getHeader(headers, "authorization");
  if (!authorization?.startsWith("Bearer ")) return false;
  return secureEqual(authorization.slice(7), required2);
};
var requestHeaders = (source) => {
  const headers = new Headers();
  for (const [name, value] of Object.entries(source ?? {})) {
    const lower = name.toLowerCase();
    if (value == null || lower === "host" || lower === "content-length" || lower === "connection" || lower === "transfer-encoding") {
      continue;
    }
    headers.set(name, String(value));
  }
  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  if (!headers.has("accept")) {
    headers.set("accept", "application/json, text/event-stream");
  }
  return headers;
};
var requestBody = (event) => {
  if (typeof event.body === "string") return event.body;
  if (event.body != null) return JSON.stringify(event.body);
  return JSON.stringify(event.data ?? null);
};
var responseHeaders = (headers) => {
  const result = {};
  headers.forEach((value, name) => {
    if (name.toLowerCase() !== "content-length" && name.toLowerCase() !== "transfer-encoding") {
      result[name] = value;
    }
  });
  return result;
};
var handle8BaseWebhook = async (rawEvent, _context) => {
  process.env.REMOTION_MCP_STATELESS = "true";
  const event = normalizeEvent(rawEvent ?? {});
  if (!validateBearerToken(event.headers)) {
    return unauthorized();
  }
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: void 0,
    enableJsonResponse: true
  });
  const server = create8BaseMcpServer();
  try {
    await server.connect(transport);
    const request = new Request("https://8base.local/mcp", {
      method: "POST",
      headers: requestHeaders(event.headers),
      body: requestBody(event)
    });
    const response = await transport.handleRequest(request);
    const body = await response.text();
    return {
      statusCode: response.status,
      headers: responseHeaders(response.headers),
      body
    };
  } catch (error) {
    console.error("[remotion-mcp:8base] request failed", error);
    return {
      statusCode: 500,
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: error instanceof Error ? error.message : "Internal server error"
        },
        id: null
      })
    };
  } finally {
    await transport.close().catch(() => void 0);
    await server.close().catch(() => void 0);
  }
};
export {
  handle8BaseWebhook
};
