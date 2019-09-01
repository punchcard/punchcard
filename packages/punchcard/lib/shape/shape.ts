import { DynamoPath } from '../dynamodb/expression/path';
import { JsonPath } from './json/path';
import { Kind } from './kind';

export interface Shape<V> {
  kind: Kind;
  /**
   * TODO: improve return type for better error tracing
   */
  validate(value: V): void;
  toJsonPath(parent: JsonPath<any>, name: string): JsonPath<Shape<any>>;
  toDynamoPath(parent: DynamoPath, name: string): DynamoPath;
  toJsonSchema(): {[key: string]: any};
  toGlueType(): {
    inputString: string;
    isPrimitive: boolean;
  };
  hashCode(value: V): number;
  equals(a: V, b: V): boolean;
}

export type RuntimeShape<T extends Shape<any>> = T extends Shape<infer V> ? V : never;
