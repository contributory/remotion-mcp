'use strict';

const runtime = require('./runtime.js');

module.exports = async (event, context) =>
  runtime.handle8BaseWebhook(event, context);
