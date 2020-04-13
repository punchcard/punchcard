import { bool, never, string } from '@punchcard/shape';
import { VExpression } from '../expression';
import { set } from '../statement';
import { VTL } from '../vtl';
import { VBool, VNever, VObject, VString, VNothing } from '../vtl-object';
import { $DynamoDBUtil as DynamoDBUtil } from './dynamodb';
import { $ListUtil as ListUtil } from './list';
import { TimeUtil } from './time';

// tslint:disable: unified-signatures

export class Util {
  public validate(condition: VBool, message: VString | string, errorType?: VString | string): VTL<VNever> {
    throw new Error('todo');
  }

  public *autoId(): VTL<VString> {
    // return yield new Statements.Set(value, id);
    return yield* set(new VString(string, new VExpression('$util.autoId()')));
  }

  public matches(regex: RegExp | string): VTL<VBool> {
    throw new Error('todo');
  }

  public unauthorized(): VNever {
    return new VNever(never, new VExpression('$util.unauthorized()'));
  }

  public *throwUnauthorized(): VTL<VNever> {
    throw this.unauthorized();
  }

  public error(message: VString | string, errorType: VString | string, data: VObject, errorInfo: VObject): VNever;
  public error(message: VString | string, errorType: VString | string, data: VObject): VNever;
  public error(message: VString | string, errorType: VString | string): VNever;
  public error(message: VString | string): VNever;

  /**
   * @param message
   * @see https://docs.aws.amazon.com/appsync/latest/devguide/resolver-util-reference.html
   */
  public error(message: VString | string, errorType?: VString | string, data?: VObject, errorInfo?: VObject): VNever {
    return new VNever(never, call('$util.error', [message, errorType, data, errorInfo]));
  }

  public isNull(value: VObject): VBool {
    return new VBool(bool, new VExpression((ctx) => `$util.isNull(${VObject.exprOf(value).visit(ctx).text})`));
  }

  public isNotNull(value: VObject): VBool {
    return new VBool(bool, new VExpression((ctx) => `!$util.isNull(${VObject.exprOf(value).visit(ctx).text})`));
  }

  public readonly dynamodb = new DynamoDBUtil();
  public readonly list = new ListUtil();
  public readonly time = new TimeUtil();
}

function call(functionName: string, args: (string | VObject | undefined)[]) {
  return new VExpression(ctx => {
    const parameters = [];
    for (const arg of args) {
      if (arg === undefined) {
        // we do this weird loop so we stop when we hit the first undefined parameter
        // that's so we can support overloaded methods like `$util.error`.
        break;
      }
      parameters.push(typeof arg === 'string' ? arg : VObject.exprOf(arg!).visit(ctx).text);
    }

    return `${functionName}(${parameters.join(',')})`;
  });
}

/**
 * https://docs.aws.amazon.com/appsync/latest/devguide/resolver-util-reference.html
 */
export const $util = new Util();