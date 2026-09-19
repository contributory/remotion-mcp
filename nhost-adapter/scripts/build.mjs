import {mkdir, rm} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const adapterRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(adapterRoot, '..');
const output = resolve(repoRoot, 'functions/mcp.js');

await mkdir(resolve(repoRoot, 'functions'), {recursive: true});
await rm(output, {force: true});

await build({
  entryPoints: [resolve(adapterRoot, 'entry.ts')],
  outfile: output,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  sourcemap: false,
  minify: false,
  legalComments: 'none',
  logLevel: 'info',
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

console.log('Built Nhost Function:', output);
