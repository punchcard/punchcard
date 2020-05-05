import { number as numberShape, ShapeGuards, string as stringShape } from '@punchcard/shape';
import { Shape } from '@punchcard/shape/lib/shape';
import { VExpression } from './expression';
import { stash, Statement } from './statement';
import { VFloat, VObject, VString } from './vtl-object';

/**
 * Represents a Velocity Template program.
 */
export type VTL<T, Stmt = Statement<any>> = Generator<Stmt, T>;
export type ConstrainedVTL<S extends Statement<any>, T> = Generator<S, T>;

/**
 * Type of an ExpressionTemplate factory.
 *
 * ```ts
 * GraphQL.string`${mustBeAGraphQLType}`;
 * ```
 */
export type ExpressionTemplate<T extends Shape> = <
  Args extends (VObject | string | number)[]
>(
  template: TemplateStringsArray,
  ...args: Args
) => VTL<VObject.Of<T>>;

/**
 * Evaluate a VTL template as an instance of some shape.
 *
 * The VTL expression must be valid on the RHS of a #set operation.
 *
 * ```ts
 * const str = vtl(string)`hello`;
 * ```
 *
 * Translates to:
 * ```
 * #set($var1 = "hello")
 * ```
 *
 * @param type what type to treat the assigned variable
 */
export function vtl<T extends Shape>(type: T): ExpressionTemplate<T>;

export function vtl<Args extends (VObject | string | number)[]>(
  template: TemplateStringsArray,
  ...args: Args
): VTL<VExpression>;

export function vtl(...args: any[]): any {
  if (ShapeGuards.isShape(args[0])) {
    const type: Shape = args[0];
    return function*(template: TemplateStringsArray, args: (VObject | string | number)[] = []) {
      // console.log(template, args);
      const obj = VObject.ofExpression(type,  VExpression.concat(
        quotes(type),
        ...template.map((str, i) => new VExpression(ctx =>
          `${str}${i < args.length ?
            VObject.isObject(args[i]) ? VObject.getExpression(args[i] as VObject).visit(ctx).text : '' :
            typeof args[i] === 'string' ? `${args[i]}` :
            typeof args[i] === 'number' ? args[i].toString(10) :
            (args[i] || '').toString()
          }`
        )),
        quotes(type)
      ));
      return yield* stash(obj);
    };
  } else {
    const template = args[0];
    args = args.slice(1);
    return (function*() {
      return VExpression.concat(template.map((str: string, i: number) => new VExpression(ctx =>
        `${str}${i < args.length ?
          VObject.isObject(args[i]) ? VObject.getExpression(args[i] as VObject).visit(ctx).text : '' :
          typeof args[i] === 'string' ? `${args[i]}` :
          typeof args[i] === 'number' ? args[i].toString(10) :
          args[i].toString()
        }`
      )));
    })();
  }
}

function quotes(type: Shape): string {
  return needsQuotes(type) ? '"' : '';
}

function needsQuotes(type: Shape): boolean {
  return ShapeGuards.isStringShape(type) || ShapeGuards.isBinaryShape(type) || ShapeGuards.isTimestampShape(type);
}

export namespace VTL {
  export function *string(s: string): VTL<VString> {
    return yield* stash(VObject.ofExpression(stringShape, new VExpression(`"${s}"`)));
  }

  export function *number(n: number): VTL<VFloat> {
    return yield* stash(VObject.ofExpression(numberShape, new VExpression(n.toString(10))));
  }
}