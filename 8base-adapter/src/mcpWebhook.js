'use strict';

let runtimePromise;

module.exports = async (event, context) => {
  runtimePromise ??= import('../dist/runtime.mjs');
  const runtime = await runtimePromise;
  return runtime.handle8BaseWebhook(event, context);
};
