import { integer, Kind, MapShape, Shape, string, StringShape, timestamp } from '../shape';

export const isMapping = Symbol.for('stdlib.isMapping');

export class Mapping {
  public readonly [isMapping]: true = true;
  constructor(public readonly path: string) {}

  public as<T extends Shape<any>>(type: T): TypedMapping<T> {
    return new TypedMapping(type, this.path);
  }
}
export class TypedMapping<T extends Shape<any>> extends Mapping {
  constructor(public readonly type: T, path: string) {
    super(type.kind === Kind.String || type.kind === Kind.Timestamp || type.kind === Kind.Binary
      ? `"${path}"` // add quote around string types
      : path);
  }
}
export type StringMapping = TypedMapping<StringShape>;
function stringMapping(name: string) {
  return new TypedMapping(string(), name);
}

export function dynamicVariable(fn: (name: string) => StringMapping): {[key: string]: Mapping} {
  return new Proxy({}, {
    get: (_target, name) => {
      return fn(name.toString());
    }
  });
}

export class Input {
  public readonly body = stringMapping('$input.body');

  private readonly _params = stringMapping('$input.params()');
  public params(): TypedMapping<MapShape<StringShape>>;
  public params(name: string): TypedMapping<StringShape>;
  public params<T extends Shape<any>>(name: string, type: T): TypedMapping<T>;
  public params(name?: any, type?: any) {
    if (name !== undefined) {
      return new TypedMapping(type || string(), `$input.params('${name}')`);
    } else {
      return this._params;
    }
  }
}
export const $input = new Input();

export const $context = {
  apiId: stringMapping('$context.apiId'),
  authorizer: new Proxy({}, {
    get: (_target, name) => {
      if (name === 'principalId') {
        return stringMapping('$context.authorizer.principalId');
      } else if (name === 'claims') {
        return dynamicVariable(name => stringMapping(`$context.claims.${name}`));
      } else {
        return dynamicVariable(name => stringMapping(`$context.authorizer.${name}`));
      }
    }
  }) as {
    claims: {
      [key: string]: Mapping;
    };
    principalId: StringMapping;
  } & {
    [key: string]: Mapping;
  },

  httpMethod: stringMapping('$context.httpMethod'),
  error: {
    message: stringMapping('$context.error.message'),
    messageString: stringMapping('$context.error.messageString'),
  },
  extendedRequestId: stringMapping('$context.extendedRequestId'),
  identity: {
    accountId: stringMapping('$context.identity.accountId'),
    apiKey: stringMapping('$context.identity.apiKey'),
    apiKeyId: stringMapping('$context.identity.apiKeyId'),
    caller: stringMapping('$context.identity.caller'),
    cognitoAuthenticationProvider: stringMapping('$context.identity.cognitoAuthenticationProvider'),
    cognitoAuthenticationType: stringMapping('$context.identity.cognitoAuthenticationType'),
    cognitoIdentityId: stringMapping('$context.identity.cognitoIdentityId'),
    cognitoIdentityPoolId: stringMapping('$context.identity.cognitoIdentityPoolId'),
    sourceIp: stringMapping('$context.identity.sourceIp'),
    user: stringMapping('$context.identity.user'),
    userAgent: stringMapping('$context.identity.userAgent'),
    userArn: stringMapping('$context.identity.userArn')
  },
  integrationLatency: new TypedMapping(integer(), '$context.integrationLatency'),
  path: stringMapping('$context.path'),
  protocol: stringMapping('$context.protocol'),
  requestOverride: {
    header: dynamicVariable(name => stringMapping(`$context.requestOverride.header.${name}`)),
    path: dynamicVariable(name => stringMapping(`$context.requestOverride.path.${name}`)),
    querystring: dynamicVariable(name => stringMapping(`$context.requestOverride.querystring.${name}`)),
  },
  responseOverride: {
    header: dynamicVariable(name => stringMapping(`$context.responseOverride.header.${name}`)),
    path: dynamicVariable(name => stringMapping(`$context.responseOverride.path.${name}`)),
    querystring: dynamicVariable(name => stringMapping(`$context.responseOverride.querystring.${name}`)),
    status: new TypedMapping(integer(), '$context.responseOverride.status')
  },
  requestTime: new TypedMapping(timestamp, '$context.requestTime'),
  requestTimeEpoch: new TypedMapping(integer(), '$context.requestTimeEpoch'),
  resourceId: stringMapping('$context.resourceId'),
  responseLength: new TypedMapping(integer(), '$context.responseLength'),
  responseLatency: new TypedMapping(integer(), '$context.responseLatency'),
  status: new TypedMapping(integer(), '$context.status'),
  stage: stringMapping('$context.stage'),
  wafResponseCode: stringMapping('$context.wafResponseCode'),
  webaclArn: stringMapping('$context.webaclArn'),
};

export const $stageVariables = dynamicVariable(name => stringMapping(`$stageVariables.${name}`));

export const $util = {
  escapeJavaScript: (mapping: StringMapping): StringMapping => {
    return stringMapping(`$util.escapeJavaScript(${mapping.path})`);
  },

  parseJson<T extends Shape<any>>(mapping: StringMapping, type: T): TypedMapping<T> {
    return new TypedMapping(type, `$util.escapeJavaScript(${mapping.path})`);
  },

  // TODO: data types?
  // urlEncode:
  // urlDecode:

  base64Encode(mapping: StringMapping): StringMapping {
    return stringMapping(`$util.base64Encode(${mapping.path})`);
  },

  // Should this return a Buffer?
  base64Decode(mapping: StringMapping): StringMapping {
    return stringMapping(`$util.base64Decode(${mapping.path})`);
  },
};
