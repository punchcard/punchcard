import { ArrayShape, MapShape, SetShape } from './collection';
import { ShapeGuards } from './guards';
import { Apply, Meta, Trait } from './metadata';
import { BinaryShape, BoolShape, IntegerShape, NumberShape, PrimitiveShapes, StringShape, TimestampShape } from './primitive';
import { Value } from './value';
import { ShapeVisitor } from './visitor';

// Track this issue for the emitting of generic metadata by the TS compiler.
// https://github.com/Microsoft/TypeScript/issues/7169

/**
 * Root of the Shape type-system.
 */
export abstract class Shape {
  public readonly [Value.Tag]: any;

  public readonly NodeType: 'shape' = 'shape';

  public abstract readonly FQN: string | undefined;

  public abstract readonly Kind: keyof ShapeVisitor;

  public visit<V extends ShapeVisitor<T, C>, T, C>(visitor: V, context: C): T {
    return visitor[this.Kind](this as any, context) as T;
  }

  public apply<T extends Trait<this, any>>(trait: T): Apply<this, Trait.GetData<T>> {
    return Meta.apply(this, trait[Trait.Data]);
  }
}
export namespace Shape {
  export type Primitive = PrimitiveShapes;

  export type Infer<T> =
    T extends boolean ? BoolShape :
    T extends Buffer ? BinaryShape :
    T extends Date ? TimestampShape :
    T extends number ? NumberShape :
    T extends string ? StringShape :
    T extends bigint ? IntegerShape :
    T extends (infer I)[] ? ArrayShape<Infer<I>> :
    T extends Map<string, infer V> ? MapShape<Infer<V>> :
    T extends Set<infer I> ? SetShape<Infer<I>> :
    T extends object ? {
      Members: {
        [m in keyof T]: Infer<T[m]>;
      }
    } & Shape :
    never
    ;
}
