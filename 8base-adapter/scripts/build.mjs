import {mkdir, rm} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outdir = resolve(root, 'dist');

await rm(outdir, {recursive: true, force: true});
await mkdir(outdir, {recursive: true});

await build({
  entryPoints: [resolve(root, 'adapter-src/runtime.ts')],
  outfile: resolve(outdir, 'runtime.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  sourcemap: false,
  minify: false,
  legalComments: 'none',
  logLevel: 'info',
  plugins: [{
    name: '8base-browser-component-shim',
    setup(buildApi) {
      buildApi.onResolve({filter: /^\.\/browser-component\.js$/}, (args) => {
        if (!args.importer.endsWith('/src/async-render.ts')) return null;
        return {path: resolve(root, 'adapter-src/browser-component.ts')};
      });
    },
  }],
  external: [
    '@aws-sdk/client-s3',
    '@aws-sdk/s3-request-presigner',
    '@modelcontextprotocol/sdk',
    '@modelcontextprotocol/sdk/*',
    '@remotion/web-renderer',
    '@trigger.dev/sdk',
    'esbuild',
    'react',
    'react-dom',
    'remotion',
    'zod',
    'zod/*',
  ],
});

console.log('Built 8base adapter:', resolve(outdir, 'runtime.mjs'));
