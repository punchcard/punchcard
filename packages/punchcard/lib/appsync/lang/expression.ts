import { InterpreterState, isInterpreterState } from '../api/interpreter';
import { VObject } from './vtl-object';

export interface VExpressionResult {
  text: string;
  context?: InterpreterState;
}

export type VExpressionLiteral =
  | VExpression
  | string
  | number
  | boolean
  | (null | undefined)
  | VExpressionLiteral[]
  | {
    [key: string]: VExpressionLiteral;
  }
  | VObject
;

const isExpr = Symbol.for('AppSync.isExpr');

export class VExpression {
  public static isExpression(a: any): a is VExpression {
    return a && a[isExpr] === true;
  }

  public static json<L extends VExpressionLiteral>(obj: L): VExpression {
    if (VExpression.isExpression(obj)) {
      return obj;
    }
    if (VObject.isObject(obj)) {
      return VExpression.call('$util.toJson', [obj]);
    }

    if (typeof obj === 'string') {
      return VExpression.text(`"${obj}"`);
    } else if (typeof obj === 'number') {
      return VExpression.text(`${obj.toString(10)}`);
    } else if (typeof obj === 'boolean') {
      return VExpression.text(`${obj}`);
    } else if (typeof obj === 'undefined' || obj === null) {
      return VExpression.text('null');
    } else if ((obj as any) instanceof Date) {
      return VExpression.text(`"${(obj as any).toISOString()}"`);
    } else if (Array.isArray(obj)) {
      return VExpression.concat(
        '[',
        VExpression.indent(),
        VExpression.line(),

        ...obj.map((item, i) => VExpression.concat(
          VExpression.json(item),
          i < obj.length - 1 ?
            VExpression.concat(',', VExpression.line()) :
            ''
        )),

        VExpression.unindent(),
        VExpression.line(),
        ']',
      );
    } else if (typeof obj === 'object') {
      const members: [string, VExpressionLiteral][] = Object.entries(obj as any);
      return VExpression.concat(
        '{',
        VExpression.indent(),
        VExpression.line(),

        ...members.map(([name, value], i) => VExpression.concat(
          `"${name}": `,
          VExpression.json(value),
          i < members.length - 1 ?
            VExpression.concat(',', VExpression.line()) :
            ''
        )),
        VExpression.unindent(),
        VExpression.line(),
        '}',
      );
    }

    throw new Error(`could not convert literal type to expression: ${obj}`);
  }

  public static text(text: string) {
    return new VExpression(state => state.write(text));
  }

  public static indent(): VExpression {
    return new VExpression(state => state.indent());
  }

  public static unindent(): VExpression {
    return new VExpression(state => state.unindent());
  }

  public static block(expr: VExpression) {
    return VExpression.concat(
      VExpression.indent(),
      VExpression.line(),
      expr,
      VExpression.unindent(),
      VExpression.line()
    );
  }

  public static line(): VExpression {
    return new VExpression(state => state.writeLine());
  }

  public readonly [isExpr]: true = true;

  public static call(self: VObject, functionName: string, args: CallArg[]): VExpression;
  public static call(functionName: string, args: CallArg[]): VExpression;
  public static call(...args: any[]): VExpression {
    if (typeof args[0] === 'string') {
      const functionName = args[0];
      args = args[1];
      return VExpression.concat(
        functionName, '(', ...toArgs(args), ')'
      );
    } else {
      const self = args[0];
      const functionName = args[1];
      args = args[2];
      return VExpression.concat(
        self, '.', functionName, '(', ...toArgs(args), ')'
      );
    }

    function toArgs(args: any[]): any[] {
      return args.map((a, i) => {
        a =
          typeof a === 'string' ? `"${a}"` :
          typeof a === 'number' ? a.toString(10) :
          typeof a === 'boolean' ? `${a}` :
          a;
        return i < args.length - 1 ? VExpression.concat(a, ',') : a;
      });
    }
  }

  public static concat(...expressions: (VExpression | VObject | string | number)[]) {
    return new VExpression((ctx) => ctx.write(...expressions));
  }

  constructor(public readonly visit: ((state: InterpreterState) => InterpreterState | void)) {}
}

type CallArg = (VExpression | VObject | string | number | boolean);
