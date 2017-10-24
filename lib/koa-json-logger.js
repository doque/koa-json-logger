'use strict';

var path = require('path'),
  bunyan = require('bunyan'),
  uuid = require('uuid');

function createReqSerializer(config) {
  return function reqSerializer(ctx) {
    return {
      url: ctx.url,
      header: Object.assign({}, ctx.request.header, {
        authorization: ctx.request.header['authorization'] && config.obfuscate ? 'obfuscated' : undefined,
        cookie: ctx.request.header['cookie'] && config.obfuscate ? 'obfuscated' : undefined,
      }),
      method: ctx.method,
      ip: ctx.ip,
      protocol: ctx.protocol,
      originalUrl: ctx.originalUrl,
      query: ctx.query
    };
  };
}

function resSerializer(ctx) {
  return {
    statusCode: ctx.status,
    responseTime: ctx.responseTime,
    header: ctx.response.header
  };
}

function uidSerializer(uuid) {
  return uuid;
}

var configDefaults = {
  name: 'app',
  path: null,
  json: true,
  surfaceErrors: false,
  isJson: function () {
    return this.json;
  },
};

module.exports = function koaLogger(opts) {

  opts = opts || {};

  var config = Object.assign({}, configDefaults, opts),
    env = process.env.NODE_ENV;

  var outStream = { level: 'info' };
  if (config.path === null) {
    outStream.stream = process.stdout;
  }
  else {
    outStream.path = path.join(config.path, config.name + '.log');
  }

  // Standard Logger
  var outLogger = bunyan.createLogger({

    name: config.name,

    serializers: {
      req: createReqSerializer(config),
      res: resSerializer
    },

    streams: [outStream]
  });

  var errStream = { level: 'error' };
  if (config.path === null) {
    errStream.stream = process.stderr;
  }
  else {
    errStream.path = path.join(config.path, config.name + '_error.log');
  }

  // Error Logger
  var errLogger = bunyan.createLogger({

    name: config.name,

    serializers: {
      uid: uidSerializer,
      req: createReqSerializer(config),
      res: resSerializer,
      err: bunyan.stdSerializers.err
    },

    streams: [errStream]
  });

  return async (ctx, next) => {
    const start = new Date();

    ctx.uuid = uuid.v4();

    try {
      await next();

      ctx.responseTime = new Date() - start;

      outLogger.info({ uid: ctx.uuid, req: ctx, res: ctx });
    }
    catch (err) {
      // If logging for a JSON API set the response Content-type before logging is done so the header  is correctly logged
      if (config.json) {
        ctx.response.type = 'application/json; charset=utf-8';
      }

      // Response properties
      ctx.status = err.statusCode || err.status || 500;
      ctx.responseTime = new Date() - start;

      // log error message and stack trace
      errLogger.error({ uid: ctx.uuid, req: ctx, res: ctx, err: err });

      // Handle 500 errors - do not leak internal server error message to the user.
      // Standard error response message for user
      if (ctx.status === 500) {
        (config.json) ? ctx.body = { status: 500, error: 'Internal Server Error' } : ctx.body = 'Internal Server Error';
      }
      else {
        (config.json) ? ctx.body = { message: err.message } : ctx.body = err.message;
      }

      // Error output only when specified
      if (config.surfaceErrors) {
        let errorToApply = err.error || err.message;
        if (typeof errorToApply === 'string' && config.json) {
          errorToApply = { error: errorToApply };
        }

        (config.json) ? ctx.body = errorToApply : ctx.body = errorToApply;
      }

      // Always emit
      ctx.app.emit('error', err, ctx);
    }
  };
};
