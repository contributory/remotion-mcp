// Temporary diagnostic function. Remove after the runtime issue is resolved.
import {build, version} from 'esbuild';

export default async (_req, res) => {
  const report = {esbuildVersion: version, checks: []};

  try {
    const result = await build({
      stdin: {
        contents: 'export const answer = 42;',
        loader: 'js',
        resolveDir: '/var/task',
      },
      bundle: true,
      write: false,
      format: 'esm',
      logLevel: 'silent',
    });
    report.checks.push({label: 'esbuild trivial build', ok: true, bytes: result.outputFiles[0]?.text.length});
  } catch (error) {
    report.checks.push({label: 'esbuild trivial build', ok: false, error: `${error.name}: ${error.message}`});
  }

  try {
    const result = await build({
      stdin: {
        contents: "import {renderMediaOnWeb} from '@remotion/web-renderer'; console.log(renderMediaOnWeb);",
        loader: 'tsx',
        resolveDir: '/var/task',
      },
      bundle: true,
      write: false,
      format: 'esm',
      platform: 'browser',
      logLevel: 'silent',
    });
    report.checks.push({label: 'esbuild resolve @remotion/web-renderer', ok: true, bytes: result.outputFiles[0]?.text.length});
  } catch (error) {
    report.checks.push({label: 'esbuild resolve @remotion/web-renderer', ok: false, error: `${error.name}: ${error.message}`});
  }

  res.status(200).json(report);
};
