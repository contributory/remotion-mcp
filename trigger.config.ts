import {puppeteer} from '@trigger.dev/build/extensions/puppeteer';
import {ffmpeg} from '@trigger.dev/build/extensions/core';
import {defineConfig} from '@trigger.dev/sdk';

const project = process.env.TRIGGER_PROJECT_REF;

if (!project) {
  throw new Error('TRIGGER_PROJECT_REF is required to use Trigger.dev.');
}

export default defineConfig({
  project,
  dirs: ['./trigger'],
  maxDuration: 3600,
  build: {
    external: [
      '@remotion/bundler',
      '@remotion/renderer',
      'remotion',
      'react',
      'react-dom',
    ],
    extensions: [ffmpeg(), puppeteer()],
  },
});
