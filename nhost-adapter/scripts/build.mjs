import {mkdir, rm} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const adapterRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(adapterRoot, '..');
const output = resolve(repoRoot, 'functions/mcp.js');

await mkdir(resolve(repoRoot, 'functions'), {recursive: true});
await rm(output, {force: true});

const browserRuntimeBuild = await build({
  stdin: {
    contents: `
import ReactDefault, * as React from 'react';
import * as Remotion from 'remotion';
import * as WebRenderer from '@remotion/web-renderer';

const ReactModule = {...React, default: ReactDefault};
Object.defineProperty(ReactModule, '__esModule', {value: true});

globalThis.__REMOTION_MCP_RUNTIME__ = {
  React: ReactModule,
  Remotion,
  WebRenderer,
};
`,
    sourcefile: 'remotion-mcp-browser-runtime.ts',
    loader: 'ts',
    resolveDir: repoRoot,
  },
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: ['es2022'],
  write: false,
  sourcemap: false,
  minify: true,
  legalComments: 'none',
  logLevel: 'silent',
  define: {
    'process.env.NODE_ENV': '"production"',
  },
});

const browserRuntime = browserRuntimeBuild.outputFiles[0]?.text;
if (!browserRuntime) {
  throw new Error('Failed to build embedded Remotion browser runtime.');
}

await build({
  entryPoints: [resolve(adapterRoot, 'entry.ts')],
  outfile: output,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: false,
  minify: false,
  legalComments: 'none',
  logLevel: 'info',
  define: {
    __REMOTION_MCP_BROWSER_RUNTIME__: JSON.stringify(browserRuntime),
  },
  plugins: [
    {
      name: 'nhost-browser-component-shim',
      setup(buildApi) {
        buildApi.onResolve({filter: /^\.\/browser-component\.js$/}, (args) => {
          if (!args.importer.endsWith('/src/async-render.ts')) return null;
          return {
            path: resolve(adapterRoot, 'browser-component.ts'),
          };
        });
      },
    },
  ],
  external: [
    '@aws-sdk/client-s3',
    '@aws-sdk/s3-request-presigner',
    '@modelcontextprotocol/sdk',
    '@modelcontextprotocol/sdk/*',
    '@trigger.dev/sdk',
    'react',
    'react-dom',
    'remotion',
    'zod',
    'zod/*',
  ],
});

console.log('Built Nhost Function:', output);
console.log('Embedded browser runtime bytes:', Buffer.byteLength(browserRuntime));
