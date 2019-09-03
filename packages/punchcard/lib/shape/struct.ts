import { BaseDynamoPath, DSL, DynamoPath, MapKeyParent } from '../dynamodb/expression/path';
import { hashCode } from './hash';
import { InferJsonPathType, JsonPath } from './json/path';
import { Kind } from './kind';
import { OptionalShape } from './optional';
import { RuntimeShape, Shape } from './shape';

export function struct<F extends Fields>(fields: F): StructShape<F> {
  return new StructShape(fields);
}

export type Fields = {
  [field: string]: Shape<any>;
};

type OptionalKeys<T extends Fields> =
  Pick<T, { [K in keyof T]: T[K] extends OptionalShape<any> ? K : never; }[keyof T]>;

type MandatoryKeys<T extends Fields> =
  Pick<T, { [K in keyof T]: T[K] extends OptionalShape<any> ? never : K; }[keyof T]>;

type StructType<T extends Fields> =
  { [K in keyof MandatoryKeys<T>]-?: RuntimeShape<T[K]>; } &
  { [K in keyof OptionalKeys<T>]+?: RuntimeShape<T[K]>; };

export class StructShape<F extends Fields> implements Shape<StructType<F>> {
  public static isStruct(s: Shape<any>): s is StructShape<any> {
    return s.kind === Kind.Struct;
  }

  public readonly kind: Kind.Struct = Kind.Struct;

  constructor(public readonly fields: F) {}

  public validate(value: StructType<F>): void {
    Object.keys(this.fields).forEach(field => {
      const item = (value as any)[field];
      const schema = this.fields[field];

      if (item === undefined && !( schema as OptionalShape<any>).isOptional) {
        throw new Error(`required field ${field} is mising from object`);
      } else {
        schema.validate(item);
      }
    });
  }

  public toDynamoPath(parent: DynamoPath, name: string): StructDynamoPath<this> {
    return new StructDynamoPath(parent, name, this);
  }

  public toJsonPath(parent: JsonPath<any>, name: string): StructPath<this> {
    return new StructPath(parent, name, this);
  }

  public toJsonSchema(): object {
    const properties: any = {};
    const required: string[] = [];
    Object.keys(this.fields).forEach(field => {
      if (!( this.fields[field] as any).isOptional) {
        required.push(field);
      }
      properties[field] = this.fields[field].toJsonSchema();
    });

    return {
      type: 'object',
      properties,
      required: required.length > 0 ? required : undefined,
      additionalProperties: false
    };
  }

  public toGlueType() {
    return {
      inputString: `struct<${Object.keys(this.fields).map(name => {
        const field = this.fields[name];
        return `${name}:${field.toGlueType().inputString}`;
      }).join(',')}>`,
      isPrimitive: false
    };
  }

  public equals(a: StructType<F>, b: StructType<F>): boolean {
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) {
      return false;
    }
    for (const aKey of aKeys) {
      const aValue = (a as any)[aKey];
      const bValue = (b as any)[aKey];
      if (bValue === undefined) {
        return false;
      }
      if (!this.fields[aKey].equals(aValue, bValue)) {
        return false;
      }
    }
    return true;
  }

  public hashCode(value: StructType<F>): number {
    const prime = 31;
    let result = 1;
    Object.keys(value).forEach(key => {
      result += prime * result + hashCode(key);
      result += prime * result + this.fields[key].hashCode((value as any)[key]);
    });
    return result;
  }
}

export type StructFields<S extends StructShape<any>> = {
  [K in keyof S['fields']]: InferJsonPathType<S['fields'][K]>;
};

export class StructPath<S extends StructShape<any>> extends JsonPath<S> {
  public readonly fields: StructFields<S>;

  constructor(parent: JsonPath<any>, name: string, type: S) {
    super(parent, name, type);
    this.fields = {} as StructFields<S>;

    Object.keys(type.fields).forEach(field => {
      this.fields[field as keyof S] = type.fields[field].toJsonPath(this, `['${field}']`) as InferJsonPathType<S['fields'][typeof field]>;
    });
  }
}

/**
 * Path to a struct attribute (represented as a Map internally).
 *
 * Recursively creates an attribute for each key in the schema and assigns it to 'fields'.
 */
export class StructDynamoPath<S extends StructShape<any>> extends BaseDynamoPath<S> {
  public readonly fields: DSL<S['fields']> = {} as DSL<S['fields']>;

  constructor(parent: DynamoPath, name: string, shape: S) {
    super(parent, name, shape);
    for (const [key, schema] of Object.entries(shape.fields)) {
      this.fields[key as keyof S] = (schema as any).toDynamoPath(new MapKeyParent(this, key), key) as any;
    }
  }
}
