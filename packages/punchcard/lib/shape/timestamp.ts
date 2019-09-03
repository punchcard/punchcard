import { DynamoPath, Minus, Plus, SetAction } from '../dynamodb/expression/path';
import { JsonPath } from './json/path';
import { Kind } from './kind';
import { NumericDynamoPath } from './number';
import { Shape } from './shape';

/**
 * Represents a timestamp JSON string
 *
 * https://tools.ietf.org/html/rfc3339#section-5.6
 */
export class TimestampShape implements Shape<Date> {
  private static readonly schema = {
    type: 'string',
    format: 'date-time'
  };

  public kind: Kind = Kind.Timestamp;

  public validate(_value: Date): void {
    // do nothing
  }

  public toDynamoPath(parent: DynamoPath, name: string): TimestampDynamoPath {
    return new TimestampDynamoPath(parent, name, this);
  }

  public toJsonPath(parent: JsonPath<any>, name: string): JsonPath<this> {
    return new JsonPath(parent, name, this);
  }

  public toJsonSchema(): { [key: string]: any; } {
    return TimestampShape.schema;
  }

  public toGlueType() {
    return {
      inputString: 'timestamp',
      isPrimitive: true
    };
  }

  public equals(a: Date, b: Date): boolean {
    return a.getTime() === b.getTime();
  }

  public hashCode(value: Date): number {
    return value.getTime();
  }
}

export const timestamp = new TimestampShape();

export class TimestampDynamoPath extends NumericDynamoPath<TimestampShape> {
  public plusMs(ms: number): Plus<TimestampShape> {
    return this.plus(new Date(ms));
  }

  public minusMs(ms: number): Minus<TimestampShape> {
    return this.minus(new Date(ms));
  }

  public incrementMs(ms: number): SetAction<TimestampShape> {
    return this.increment(new Date(ms));
  }

  public decrementMs(ms: number): SetAction<TimestampShape> {
    return this.decrement(new Date(ms));
  }
}
