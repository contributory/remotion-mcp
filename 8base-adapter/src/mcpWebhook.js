'use strict';

const runtime = require('../dist/runtime.cjs');

module.exports = async (event, context) =>
  runtime.handle8BaseWebhook(event, context);
