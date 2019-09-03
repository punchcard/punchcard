import AWS = require('aws-sdk');

import {
  ArrayShape,
  Kind,
  MapShape,
  OptionalShape,
  RuntimeShape,
  SetShape,
  Shape,
  StructShape,
  TypeSet
} from '../shape';

import {
  Mapper as IMapper,
  Reader as IReader,
  Writer as IWriter
} from '../shape/mapper';

// tslint:disable: no-shadowed-variable

export interface Configuration {
  readonly validate?: boolean;
  readonly reader?: IReader<AWS.DynamoDB.AttributeValue>;
  readonly writer?: IWriter<AWS.DynamoDB.AttributeValue>;
}

export function forShape<S extends StructShape<any>>(shape: S, configuration?: Configuration): Mapper<S> {
  return new Mapper(shape, configuration);
}

export class Mapper<S extends StructShape<any>> implements IMapper<RuntimeShape<S>, AWS.DynamoDB.AttributeMap> {
  private readonly validate: boolean;
  private readonly reader: IReader<AWS.DynamoDB.AttributeValue>;
  private readonly writer: IWriter<AWS.DynamoDB.AttributeValue>;

  constructor(private readonly type: S, props: Configuration = {}) {
    this.validate = props.validate === undefined ? false : props.validate;
    this.reader = props.reader || Reader.instance;
    this.writer = props.writer || Writer.instance;
  }

  public read(map: AWS.DynamoDB.AttributeMap): RuntimeShape<S> {
    const record: RuntimeShape<S> = this.reader.read(this.type, { M: map });
    if (this.validate) {
      this.type.validate(record);
    }
    return record;
  }

  public write(record: RuntimeShape<S>): AWS.DynamoDB.AttributeMap {
    if (this.validate) {
      this.type.validate(record);
    }
    return this.writer.write(this.type, record).M!;
  }
}

const setMappings: any = {
  [Kind.Binary]: { set: 'BS', item: 'B' },
  [Kind.String]: { set: 'SS', item: 'S' },
  [Kind.Integer]: { set: 'NS', item: 'N' },
  [Kind.Number]: { set: 'NS', item: 'N' }
};
// TODO: what to do about this?
// tslint:disable: radix
export class Reader implements IReader<AWS.DynamoDB.AttributeValue> {
  public static readonly instance: Reader = new Reader();

  private static throwError(kind: Kind, parsed: any, expected: string) {
    throw new Error(`expected a AttributeValue with type ${expected} for ${kind}, got ${Object.keys(parsed).join(',')}`);
  }

  public read<T extends Shape<V>, V>(type: T, value: AWS.DynamoDB.AttributeValue): any {
    if (type.kind === Kind.Dynamic) {
      return AWS.DynamoDB.Converter.output(value);
    } else if (type.kind === Kind.Boolean) {
      if (value.BOOL === undefined) {
        Reader.throwError(type.kind, value, 'BOOL');
      }

      return value.BOOL;
    } else if (type.kind === Kind.Integer) {
      if (value.N === undefined) {
        Reader.throwError(type.kind, value, 'N');
      }

      return parseInt(value.N!);
    } else if (type.kind === Kind.Number) {
      if (value.N === undefined) {
        Reader.throwError(type.kind, value, 'N');
      }
      return parseFloat(value.N!);
    } else if (type.kind === Kind.String) {
      if (value.S === undefined) {
        Reader.throwError(type.kind, value, 'S');
      }
      return value.S;
    } else if (type.kind === Kind.Binary) {
      if (value.B === undefined) {
        Reader.throwError(type.kind, value, 'B');
      }
      if (Buffer.isBuffer(value.B)) {
        return value.B;
      } else if (typeof value.B === 'string') {
        return new Buffer(value.B);
      } else if (Array.isArray(value.B)) {
        return new Buffer(value.B);
      } else {
        throw new Error(`unexpected type in B attribute, ${typeof value.B}`);
      }
    } else if (type.kind === Kind.Timestamp) {
      if (value.N === undefined) {
        Reader.throwError(type.kind, value, 'N');
      }
      return new Date(parseInt(value.N!));
    } else if (type.kind === Kind.Optional) {
      if (value === undefined || value === null || value.NULL) {
        return undefined;
      } else {
        const optional = type as any as OptionalShape<any>;
        return this.read(optional.type, value);
      }
    } else if (type.kind === Kind.Struct) {
      if (value.M === undefined) {
        Reader.throwError(type.kind, value, 'M');
      }

// tslint:disable-next-line: no-shadowed-variable
      const struct = type as any as StructShape<any>;
      const result: any = {};
      Object.keys(struct.fields).forEach(name => {
        const field = struct.fields[name];
        const v = value.M![name];
        result[name] = this.read(field, v);
      });
      return result;
    } else if (type.kind === Kind.Array) {
      if (value.L === undefined) {
        Reader.throwError(type.kind, value, 'L');
      }

      const array = type as any as ArrayShape<any>;
      const itemType: any = array.itemType;
      return value.L!.map(p => this.read(itemType, p)) as any;
    } else if (type.kind === Kind.Set) {
      const set: any = type as any as SetShape<any>;
      const itemType: any = set.itemType;
      const mapping: {set: string, item: string} = setMappings[set.itemType.kind];
      if (!mapping) {
        throw new Error(`dynamodb only supports binary, string or number sets, but got ${set.itemType.kind}`);
      }
      if ((value as any)[mapping.set] === undefined) {
        Reader.throwError(type.kind, value, mapping.set);
      }

      const typedSet = TypeSet.forType(itemType);
      (value as any)[mapping.set].forEach((p: any) => {
        typedSet.add(this.read(itemType, { [mapping.item]: p }));
      });
      return typedSet;
    } else if (type.kind === Kind.Map) {
      if (value.M === undefined) {
        Reader.throwError(type.kind, value, 'M');
      }
      const map = type as any as MapShape<any>;
      const result = {};
      Object.keys(value.M!).forEach(name => {
        const v = value.M![name];
        (result as any)[name] = this.read(map.valueType, v);
      });
      return result;
    } else {
      throw new Error(`encountered unknown type, ${type.kind}`);
    }
  }
}

export interface WriterConfig {
  writeNulls?: boolean;
}
export class Writer implements IWriter<AWS.DynamoDB.AttributeValue> {
  public static readonly instance: Writer = new Writer();

  private readonly writeNulls: boolean;

  constructor(props: WriterConfig = {}) {
    this.writeNulls = props.writeNulls === undefined ? false : props.writeNulls;
  }

  public write<T extends Shape<V>, V>(type: T, value: any): AWS.DynamoDB.AttributeValue {
    if (type.kind === Kind.Dynamic) {
      return AWS.DynamoDB.Converter.input(value);
    } else if (type.kind === Kind.Boolean) {
      return { BOOL: value };
    } else if (type.kind === Kind.Integer || type.kind === Kind.Number) {
      return { N: value.toString() };
    } else if (type.kind === Kind.String) {
      return { S: value };
    } else if (type.kind === Kind.Binary) {
      return { B: value };
    } else if (type.kind === Kind.Timestamp) {
      return { N: (value as Date).getTime().toString() };
    } else if (type.kind === Kind.Optional) {
      if (value === undefined || value === null) {
        return this.writeNulls ? { NULL: true } : (undefined as any);
      } else {
        const optional = type as any as OptionalShape<any>;
        return this.write(optional.type, value);
      }
    } else if (type.kind === Kind.Struct) {
      const struct = type as any as StructShape<any>;
      const result = {};
      Object.keys(struct.fields).forEach(name => {
        const field = struct.fields[name];
        const v = value[name];
        (result as any)[name] = this.write(field, v);
      });
      return { M: result };

    } else if (type.kind === Kind.Array) {
      const array = type as any as ArrayShape<any>;
      const itemType: any = array.itemType;
      return { L: value.map((p: any) => this.write(itemType, p)) };
    } else if (type.kind === Kind.Set) {
      const setType = type as any as SetShape<any>;
      const setValue: TypeSet<any> = value;
      const itemType: any = setType.itemType;
      const mapping = setMappings[itemType.kind];

      if (!mapping) {
        throw new Error(`dynamodb only supports binary, string or number sets, but got ${type.kind}`);
      }

      const result = [];
      for (const v of setValue.values()) {
        const ser: any = this.write(itemType, v);
        const res = ser[mapping.item];
        if (!res) {
          throw new Error(`expected value for ${mapping.item}, but got ${Object.keys(ser).join(',')}`);
        }
        result.push(res);
      }

      return { [mapping.set]: result };
    } else if (type.kind === Kind.Map) {
      const map = type as any as MapShape<any>;
      const result = {};
      Object.keys(value).forEach(name => {
        const v = value[name];
        (result as any)[name] = this.write(map.valueType, v);
      });
      return { M: result };
    } else {
      throw new Error(`encountered unknown type, ${type.kind}`);
    }
  }
}
