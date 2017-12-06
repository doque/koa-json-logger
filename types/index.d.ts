/// <reference types="node" />
/// <reference types="koa" />

declare module "koa-json-logger-next" {

  import * as Koa from "koa";

  interface LoggerOptions {
    name?: string;
    path?: string | null;
    json?: boolean;
    surfaceErrors?: boolean;
    isJson?: () => boolean;
  }

  /**
   * JSON Logger middleware for Koa
   */
  function logger(options?: LoggerOptions): Koa.Middleware;

  namespace logger { }
  export = logger;
}
