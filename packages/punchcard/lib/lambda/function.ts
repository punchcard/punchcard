import AWS = require('aws-sdk');

import { Json } from '@punchcard/shape-json';

import { any, AnyShape, Mapper, MapperFactory, ShapeOrRecord, Value } from '@punchcard/shape';
import { Assembly } from '../core/assembly';
import { Build } from '../core/build';
import { Cache } from '../core/cache';
import { CDK } from '../core/cdk';
import { Client } from '../core/client';
import { Code } from '../core/code';
import { Dependency } from '../core/dependency';
import { Entrypoint, entrypoint } from '../core/entrypoint';
import { Global } from '../core/global';
import { Resource } from '../core/resource';
import { Run } from '../core/run';
import { ENTRYPOINT_ENV_KEY, IS_RUNTIME_ENV_KEY } from '../util/constants';

import type * as lambda from '@aws-cdk/aws-lambda';
import type * as cdk from '@aws-cdk/core';
import { Duration } from '../core/duration';

/**
 * Overridable subset of @aws-cdk/aws-lambda.FunctionProps
 */
export interface FunctionOverrideProps extends Omit<Partial<lambda.FunctionProps>, 'code' | 'functionName' | 'handler' | 'runtime' | 'memorySize'> {}

export interface FunctionProps<T extends ShapeOrRecord = AnyShape, U extends ShapeOrRecord = AnyShape, D extends Dependency<any> | undefined = undefined> {
  /**
   * Type of the request
   *
   * @default any
   */
  request?: T;

  /**
   * Type of the response
   *
   * @default any
   */
  response?: U;

  /**
   * Factory for a `Mapper` to serialize shapes to/from a `string`.
   *
   * @default Json
   */
  mapper?: MapperFactory<Json.Of<T>>;

  /**
   * Dependency resources which this Function needs clients for.
   *
   * Each client will have a chance to grant permissions to the function and environment variables.
   */
  depends?: D;

  /**
   * A name for the function.
   *
   * @default - AWS CloudFormation generates a unique physical ID and uses that
   * ID for the function's name. For more information, see Name Type.
   */
  functionName?: string;

  /**
   * A description of the function.
   *
   * @default - No description.
   */
  description?: string;

  /**
   * The amount of memory, in MB, that is allocated to your Lambda function.
   * Lambda uses this value to proportionally allocate the amount of CPU
   * power. For more information, see Resource Model in the AWS Lambda
   * Developer Guide.
   *
   * @default 128
   */
  memorySize?: number;

  /**
   * The function execution time (in seconds) after which Lambda terminates
   * the function. Because the execution time affects cost, set this value
   * based on the function's expected execution time.
   *
   * @default Duration.seconds(3)
   */
  timeout?: Duration;

  /**
   * Extra Lambda Function Props.
   */
  functionProps?: Build<FunctionOverrideProps>
}

/**
 * Runs a function `T => U` in AWS Lambda with some runtime dependencies, `D`.
 *
 * @typeparam T input type
 * @typeparam U return type
 * @typeparam D runtime dependencies
 */
export class Function<T extends ShapeOrRecord = AnyShape, U extends ShapeOrRecord = AnyShape, D extends Dependency<any> | undefined = undefined> implements Entrypoint, Resource<lambda.Function> {
  public readonly [entrypoint] = true;
  public readonly filePath: string;

  /**
   * The Lambda Function CDK Construct.
   */
  public readonly resource: Build<lambda.Function>;

  /**
   * Entrypoint handler function.
   */
  public readonly entrypoint: Run<Promise<(event: any, context: any) => Promise<any>>>;

  /**
   * Function to handle the event of type `T`, given initialized client instances `Clients<D>`.
   *
   * @param event the parsed request
   * @param clients initialized clients to dependency resources
   */
  public readonly handle: (event: Value.Of<T>, clients: Client<D>, context: any) => Promise<Value.Of<U>>;

  private readonly dependencies?: D;

  private readonly requestMapper: Mapper<Value.Of<T>, Json.Of<T>>;
  private readonly responseMapper: Mapper<Value.Of<U>, Json.Of<T>>;

  constructor(scope: Build<cdk.Construct>, id: string, props: FunctionProps<T, U, D>, handle: (event: Value.Of<T>, run: Client<D>, context: any) => Promise<Value.Of<U>>) {
    this.handle = handle;
    const entrypointId = Global.addEntrypoint(this);

    // default to JSON serialization
    const mapperFactory = (props.mapper || Json.mapper) as MapperFactory<Json.Of<T>>;
    this.requestMapper = mapperFactory(props.request || any);
    this.responseMapper = mapperFactory(props.response || any);
    this.dependencies = props.depends;

    this.resource = CDK.chain(({lambda}) => scope.chain(scope => (props.functionProps || Build.empty).map(functionProps => {
      const lambdaFunction: lambda.Function = new lambda.Function(scope, id, {
        code: Code.tryGetCode(scope) || Code.mock(),
        runtime: lambda.Runtime.NODEJS_10_X,
        handler: 'index.handler',
        functionName: props.functionName,
        memorySize: props.memorySize,
        description: props.description,
        timeout: props.timeout?.toCDKDuration(),
        ...functionProps,
      });
      lambdaFunction.addEnvironment(IS_RUNTIME_ENV_KEY, 'true');
      lambdaFunction.addEnvironment(ENTRYPOINT_ENV_KEY, entrypointId);

      const assembly = new Assembly();
      if (this.dependencies) {
        Build.resolve(this.dependencies.install)(assembly, lambdaFunction);
      }
      for (const [name, p] of Object.entries(assembly.properties)) {
        lambdaFunction.addEnvironment(name, p);
      }

      return lambdaFunction;
    })));

    this.entrypoint = Run.lazy(async () => {
      const bag: {[name: string]: string} = {};
      for (const [env, value] of Object.entries(process.env)) {
        if (env.startsWith('punchcard') && value !== undefined) {
          bag[env] = value;
        }
      }
      let client: Client<D> = undefined as any;

      if (this.dependencies) {
        const cache = new Cache();
        const runtimeProperties = new Assembly(bag);
        client = await (Run.resolve(this.dependencies!.bootstrap))(runtimeProperties, cache);
      }
      return (async (event: any, context: any) => {
        const parsed = this.requestMapper.read(event);
        try {
          const result = await this.handle(parsed as any, client, context);
          return this.responseMapper.write(result as any);
        } catch (err) {
          console.error(err);
          throw err;
        }
      });
    });
  }

  /**
   * Depend on invoking this Function.
   */
  public invokeAccess(): Dependency<Function.Client<Value.Of<T>, Value.Of<U>>> {
    return {
      install: this.resource.map(fn => (ns, g) => {
        fn.grantInvoke(g);
        ns.set('functionArn', fn.functionArn);
      }),
      bootstrap: Run.of(async (ns, cache) => {
        return new Function.Client(
          cache.getOrCreate('aws:lambda', () => new AWS.Lambda()),
          ns.get('functionArn'),
          Json.asString(this.requestMapper),
          Json.asString(this.requestMapper)
        ) as any;
      })
    };
  }
}

export namespace Function {
  /**
   * Client for invoking a Lambda Function
   */
  export class Client<T, U> {
    constructor(
      private readonly client: AWS.Lambda,
      private readonly functionArn: string,
      private readonly requestMapper: Mapper<T, string>,
      private readonly responseMapper: Mapper<U, string>) {}

    /**
     * Invoke the function synchronously and return the result.
     * @return Promise of the result
     */
    public async invoke(request: T): Promise<U> {
      const response = await this.client.invoke({
        FunctionName: this.functionArn,
        InvocationType: 'RequestResponse',
        Payload: this.requestMapper.write(request)
      }).promise();

      if (response.StatusCode === 200) {
        if (typeof response.Payload === 'string') {
          return this.responseMapper.read(response.Payload);
        } else if (Buffer.isBuffer(response.Payload)) {
          return this.responseMapper.read(response.Payload.toString('utf8'));
        } else {
          throw new Error(`Unknown response payload type: ${typeof response.Payload}`);
        }
      } else {
        throw new Error(`Function returned non-200 status code, '${response.StatusCode}' with error, '${response.FunctionError}'`);
      }
    }

    /**
     * Invoke the function asynchronously.
     */
    public async invokeAsync(request: T): Promise<void> {
      await this.client.invoke({
        FunctionName: this.functionArn,
        InvocationType: 'Event',
        Payload: this.requestMapper.write(request)
      }).promise();
    }
  }
}
