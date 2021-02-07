import type * as lambda from '@aws-cdk/aws-lambda';
import type * as cdk from '@aws-cdk/core';
import type * as webpack from 'webpack';

import { ENTRYPOINT_ENV_KEY, GLOBAL_SYMBOL_NAME, WEBPACK_MODE } from '../util/constants';
import { Build } from './build';
import { CDK } from './cdk';

import _fs = require('fs');
const fs = _fs.promises;
import path = require('path');

import erasure = require('@punchcard/erasure');
import { Webpack } from './app';

export namespace Code {
  const symbol = Symbol.for('punchcard:code');

  function findApp(c: cdk.IConstruct): cdk.App {
    while (c.node.scope !== undefined) {
      c = c.node.scope;
    }
    return c as cdk.App;
  }

  export function getCode(scope: cdk.Construct): lambda.Code {
    const c = tryGetCode(scope);
    if (!c) {
      throw new Error('code does not exist on app');
    }
    return c;
  }

  export function tryGetCode(scope: cdk.Construct): lambda.Code | undefined {
    return (findApp(scope) as any)[symbol];
  }

  async function exists(path: string): Promise<boolean> {
    try {
      await fs.stat(path);
      return true;
    } catch (err) {
      if (err.code === 'ENOENT') {
        return false;
      }
      throw err;
    }
  }

  export function mock(): lambda.Code {
    class MockCode extends Build.resolve(CDK).lambda.Code {
      public readonly isInline: boolean = true;

      public bind(): lambda.CodeConfig {
        return {
          inlineCode: 'exports.handler = function(){ throw new Error("Mocked code is running, oops!");}'
        };
      }
    }
    return new MockCode();
  }

  export async function initCode(app: cdk.App, externals: string[], plugins: Build<webpack.Plugin>[]): Promise<lambda.Code> {
    if ((app as any)[symbol] === undefined) {
      if (process.mainModule === undefined) {
        // console.warn('Mocking code, assuming its a unit test. Are you running the node process from another tool like jest?');
        return mock();
      }
      const index = process.mainModule.filename;
      // TODO: probably better to stash things in the CWD instead of next to the app
      const dist = path.resolve(path.dirname(index), '.punchcard');
      const name = path.basename(index, '.js');
      const codePath = path.join(dist, name);
      // HACK: this block is effectively erased at runtime:
      // 1) it is guarded by an environment variable expected to only be set at runtime
      // 2) webpack removes calls to itself, i.e. require('webpack')
      if (!(await exists(dist))) {
        await fs.mkdir(dist);
      }
      if (!(await exists(codePath))) {
        await fs.mkdir(codePath);
      }

      const webpack = require('webpack') as typeof import('webpack');

      const config: import('webpack').Configuration = {
        mode: app.node.tryGetContext(WEBPACK_MODE) || 'production',
        entry: index,
        target: 'node',
        output: {
          path: codePath,
          filename: 'app.js',
          libraryTarget: 'umd',
        },
        resolve: {
          // Add `.ts` and `.tsx` as a resolvable extension.
          extensions: [".ts", ".tsx", ".js"]
        },
        module: {
          rules: [
            // all files with a `.ts` or `.tsx` extension will be handled by `ts-loader`
            { test: /\.tsx?$/, loader: "ts-loader", options: { transpileOnly: true } }
          ]
        },
        externals,
        plugins: plugins
          .map(Build.resolve)
          // add an IgnorePlugin for each globally registered pattern
          .concat(erasure.getPatterns().map(regexp =>
            new (Build.resolve(Webpack)).IgnorePlugin(regexp)))
      };
      const compiler = webpack(config);

      await fs.writeFile(path.join(codePath, 'index.js'), indexFile);

      const asset = await new Promise((resolve, reject) => {
        // this must be called before the CDK Construct tree is built because it is async and Construct constructors
        // like Assets require synchronous instantiation
        compiler.run((err: any, stats: any) => {
          if (err) {
            reject(err);
          } else if (stats?.compilation?.errors?.length) {
            // Sometimes the err will be null, but the errors array won't, so map each
            // one individually to the console
            stats.compilation.errors.map((s: any) => console.error(s.message ?? s));
          }
          resolve(Build.resolve(CDK).lambda.Code.asset(codePath));
        });
      });

      // cache the asset
      (app as any)[symbol] = asset;
    }

    // return the cached one
    return (app as any)[symbol];
  }
}

// TODO: put in a static file?
// TODO: substitute values?
const indexFile = `
require('./app');
const entrypointId = process.env.${ENTRYPOINT_ENV_KEY};
if (!entrypointId) {
  throw new Error('${ENTRYPOINT_ENV_KEY} environment variable is missing');
}
const state = global[Symbol.for('${GLOBAL_SYMBOL_NAME}')];
if (!state) {
  throw new Error('global state missing');
}
const entrypoint = state.entrypoints[entrypointId];
if (!entrypoint) {
  throw new Error('entrypoint with id "' + entrypointId + '" does not exist');
}

var handler;
exports.handler = async (event, context) => {
if (!handler) {
  handler = await entrypoint.entrypoint[Symbol.for('Runtime.get')]();
}
return await handler(event, context);
}
`;
