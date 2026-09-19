import {defineConfig} from '@trigger.dev/sdk';

const project = process.env.TRIGGER_PROJECT_REF;

if (!project) {
  throw new Error('TRIGGER_PROJECT_REF is required to use Trigger.dev.');
}

export default defineConfig({
  project,
  dirs: ['./trigger'],
  maxDuration: 86400,
});
