// Temporary diagnostic function. Remove after the runtime issue is resolved.
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {existsSync, readdirSync} from 'node:fs';

const attempt = (label, fn) => {
  try {
    return {label, ok: true, value: fn()};
  } catch (error) {
    return {label, ok: false, error: `${error.name}: ${error.message}`};
  }
};

export default (_req, res) => {
  const cwd = process.cwd();
  const bases = [
    join(cwd, 'noop.js'),
    join(cwd, 'functions', 'noop.js'),
    '/var/task/noop.js',
    '/var/task/functions/noop.js',
  ];

  const report = {
    cwd,
    dirEntries: attempt('readdir cwd', () => readdirSync(cwd).slice(0, 40)),
    nodeModulesCandidates: [cwd, join(cwd, '..'), join(cwd, 'functions'), '/var/task/functions'].map(
      (p) => ({p, exists: existsSync(join(p, 'node_modules'))}),
    ),
    resolves: bases.map((base) =>
      attempt(`createRequire(${base}) + resolve remotion/package.json`, () =>
        createRequire(base).resolve('remotion/package.json'),
      ),
    ),
  };

  res.status(200).json(report);
};
