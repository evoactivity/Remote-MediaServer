/**
 * Created by Owen on 15-4-2016.
 */

const Settings = require('../Settings');
const Log = require('../Log');

const Koa = require('koa');
const Router = require('koa-router');
const Static = require('koa-static');
const cors = require('koa-cors');
const nodeCache = require('node-file-cache');
const destroyable = require('server-destroy');
const bodyParser = require('koa-bodyparser');
const opn = require('opn');
const ip = require('ip');


let server;
let serverInstance;
let cache;
const router = new Router();
const cacheRoute = [];
const routes = [];

class HttpServer {
  static preflight() {
    cache = nodeCache.create({ file: `${process.cwd()}/cache/httpCache` });
    Settings.addObserver('port', HttpServer.onPortChange);
    server = new Koa();
    server.use(cors({ origin: '*', methods: ['GET', 'HEAD', 'PUT', 'POST', 'DELETE', 'PATCH'] }));
    // eslint-disable-next-line global-require
    require('./coreHandlers');
  }

  static async start() {
    Log.info('starting http server');
    server.use(bodyParser());
    server.use(router.routes());
    server.use(router.allowedMethods());

    // make sure frontend javascript url handling works.
    // for example /library/list redirects to /
    server.use((context, next) => {
      if (context.url.split('?')[0].indexOf('.') === -1) {
        context.url = '/';
      }
      return next();
    });
    server.use(new Static(`${__dirname}/../../../frontend/build`));

    // Lets start our server
    serverInstance = server.listen(Settings.getValue('port'), Settings.getValue('bind'), HttpServer.onConnected);
    destroyable(serverInstance);
  }

  static stop(and) {
    Log.info('shutting down http server');
    serverInstance.destroy(and);
  }

  static async onConnected() {
    let host = Settings.getValue('bind');
    if (host === '0.0.0.0') host = ip.address();
    try {
      await opn(`http://${host}:${Settings.getValue('port')}`);
    } catch (e) {
      Log.debug(e);
    }
    Log.info('Server listening on: http://localhost:%s', Settings.getValue('port'));
  }

  /**
     *
     * @param method
     * @param routepath
     * @param {RequestHandler} requestHandler
     */
  static registerRoute(method, routepath, RequestHandler, cacheFor, priority) {
    if (!priority) {
      priority = 0;
    }
    const route = `${method}@${routepath}`;
    cacheRoute[`${route}@${priority}`] = cacheFor;

    // if there's no such route yet, register it
    if (!routes[route]) {
      routes[route] = [];

      router[method](routepath, context => HttpServer.checkCache(
        context,
        `${route}@${priority}`,
        () => {
          // run routes by priority, if one returns true, we'll stop propagating
          for (let c = 10; c >= -10; c -= 1) {
            const R = routes[route][c];
            if (R) {
              const result = new R(context, method, routepath).handleRequest();
              if (result) {
                return result;
              }
            }
          }
          return false;
        },
      ));
    }
    routes[route][priority] = RequestHandler;
  }

  static checkCache(context, key, func) {
    const cacheFor = cacheRoute[key];
    if (!cacheFor) {
      return func();
    }

    const entry = cache.get(context.url);
    if (entry) {
      context.body = entry;
      return true;
    }

    return new Promise((resolve) => {
      Promise.resolve(func()).then(() => {
        if (context.body) {
          const cacheObj = context.body;
          cache.set(context.url, cacheObj, { life: cacheFor }, [key]);
        }
        resolve();
      });
    });
  }

  static onPortChange() {
    Log.info('onPortChange', this);
    HttpServer.stop(HttpServer.start);
  }
}

module.exports = HttpServer;