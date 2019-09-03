import 'jest';

import { DynamoDB, Shape } from '../../lib';

const {
  _,
  and,
  attribute_exists,
  attribute_not_exists,
  not,
  or,
  toDSL: toFacade,
} = DynamoDB;

/**
 * TODO: Tests for optional attributes
 */
const table = {
  anyAttribute: Shape.dynamic,
  stringAttribute: Shape.string(),
  intAttribute: Shape.integer(),
  floatAttribute: Shape.float(),
  timestampAttribute: Shape.timestamp,
  binaryAttribute: Shape.binary(),
  boolAttribute: Shape.boolean,
  struct: Shape.struct({
    nested_id: Shape.integer()
  }),
  list: Shape.array(Shape.integer()),
  map: Shape.map(Shape.string()),
  stringSetAttribute: Shape.set(Shape.string()),
  intSetAttribute: Shape.set(Shape.integer()),
  floatSetAttribute: Shape.set(Shape.float()),
  binarySetAttribute: Shape.set(Shape.binary())
};

const facade = toFacade(table);

/**
 * @see https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Expressions.OperatorsAndFunctions.html
 */
describe('condition-expression', () => {
  describe('operand comparator operand', () => {
    describe('=', () => {
      it('dynamic', () => {
        expect(facade.anyAttribute.as(Shape.boolean).equals(true).render(new DynamoDB.CompileContextImpl())).toEqual({
          ConditionExpression: '#0 = :0',
          ExpressionAttributeNames: {
            '#0': 'anyAttribute'
          },
          ExpressionAttributeValues: {
            ':0': {
              BOOL: true
            }
          }
        });
      });

      it('boolean', () => {
        expect(facade.boolAttribute.equals(true).render(new DynamoDB.CompileContextImpl())).toEqual({
          ConditionExpression: '#0 = :0',
          ExpressionAttributeNames: {
            '#0': 'boolAttribute'
          },
          ExpressionAttributeValues: {
            ':0': {
              BOOL: true
            }
          }
        });
      });

      it('string', () => {
        expect(facade.stringAttribute.equals('test').render(new DynamoDB.CompileContextImpl())).toEqual({
          ConditionExpression: '#0 = :0',
          ExpressionAttributeNames: {
            '#0': 'stringAttribute'
          },
          ExpressionAttributeValues: {
            ':0': {
              S: 'test'
            }
          }
        });
      });

      it('int', () => {
        expect(facade.intAttribute.equals(1).render(new DynamoDB.CompileContextImpl())).toEqual({
          ConditionExpression: '#0 = :0',
          ExpressionAttributeNames: {
            '#0': 'intAttribute'
          },
          ExpressionAttributeValues: {
            ':0': {
              N: '1'
            }
          }
        });
      });

      it('float', () => {
        expect(facade.floatAttribute.equals(1.2).render(new DynamoDB.CompileContextImpl())).toEqual({
          ConditionExpression: '#0 = :0',
          ExpressionAttributeNames: {
            '#0': 'floatAttribute'
          },
          ExpressionAttributeValues: {
            ':0': {
              N: '1.2'
            }
          }
        });
      });

      it('timestamp', () => {
        expect(facade.timestampAttribute.equals(new Date(1)).render(new DynamoDB.CompileContextImpl())).toEqual({
          ConditionExpression: '#0 = :0',
          ExpressionAttributeNames: {
            '#0': 'timestampAttribute'
          },
          ExpressionAttributeValues: {
            ':0': {
              N: '1'
            }
          }
        });
      });

      it('binary', () => {
        expect(facade.binaryAttribute.equals(new Buffer('string')).render(new DynamoDB.CompileContextImpl())).toEqual({
          ConditionExpression: '#0 = :0',
          ExpressionAttributeNames: {
            '#0': 'binaryAttribute'
          },
          ExpressionAttributeValues: {
            ':0': {
              B: new Buffer('string')
            }
          }
        });
      });

      it('struct', () => {
        const expression = facade.struct.equals({
          nested_id: 1
        });

        expect(expression.render(new DynamoDB.CompileContextImpl())).toEqual({
          ConditionExpression: '#0 = :0',
          ExpressionAttributeNames: {
            '#0': 'struct'
          },
          ExpressionAttributeValues: {
            ':0': {
              M: {
                nested_id: {
                  N: '1'
                }
              }
            }
          }
        });
      });

      it('struct attribute', () => {
        expect(facade.struct.fields.nested_id.equals(1).render(new DynamoDB.CompileContextImpl())).toEqual({
          ConditionExpression: '#0.#1 = :0',
          ExpressionAttributeNames: {
            '#0': 'struct',
            '#1': 'nested_id'
          },
          ExpressionAttributeValues: {
            ':0': {
              N: '1'
            }
          }
        });
      });

      it('struct as any', () => {
        expect(facade.anyAttribute.as(Shape.struct({
          nested_id: Shape.integer()
        })).fields.nested_id.equals(1).render(new DynamoDB.CompileContextImpl())).toEqual({
          ConditionExpression: '#0.#1 = :0',
          ExpressionAttributeNames: {
            '#0': 'anyAttribute',
            '#1': 'nested_id'
          },
          ExpressionAttributeValues: {
            ':0': {
              N: '1'
            }
          }
        });
      });

      it ('list', () => {
        expect(facade.list.equals([1]).render(new DynamoDB.CompileContextImpl())).toEqual({
          ConditionExpression: '#0 = :0',
          ExpressionAttributeNames: {
            '#0': 'list'
          },
          ExpressionAttributeValues: {
            ':0': {
              L: [ {
                N: '1'
              } ]
            }
          }
        });
      });

      it ('list item', () => {
        expect(facade.list.at(0).equals(1).render(new DynamoDB.CompileContextImpl())).toEqual({
          ConditionExpression: '#0[0] = :0',
          ExpressionAttributeNames: {
            '#0': 'list'
          },
          ExpressionAttributeValues: {
            ':0': {
              N: '1'
            }
          }
        });
      });

      it ('map', () => {
        expect(facade.map.equals({ key: 'value' }).render(new DynamoDB.CompileContextImpl())).toEqual({
          ConditionExpression: '#0 = :0',
          ExpressionAttributeNames: {
            '#0': 'map'
          },
          ExpressionAttributeValues: {
            ':0': {
              M: {
                key: { S: 'value' }
              }
            }
          }
        });
      });

      it ('map key', () => {
        expect(facade.map.get('key').equals('value').render(new DynamoDB.CompileContextImpl())).toEqual({
          ConditionExpression: '#0.#1 = :0',
          ExpressionAttributeNames: {
            '#0': 'map',
            '#1': 'key'
          },
          ExpressionAttributeValues: {
            ':0': {
              S: 'value'
            }
          }
        });
      });
    });

    describe('<>', () => {
      it('dynamic', () => {
        expect(facade.anyAttribute.as(Shape.boolean).notEquals(true).render(new DynamoDB.CompileContextImpl())).toEqual({
          ConditionExpression: '#0 <> :0',
          ExpressionAttributeNames: {
            '#0': 'anyAttribute'
          },
          ExpressionAttributeValues: {
            ':0': {
              BOOL: true
            }
          }
        });
      });

      it('boolean', () => {
        expect(facade.boolAttribute.ne(true).render(new DynamoDB.CompileContextImpl())).toEqual({
          ConditionExpression: '#0 <> :0',
          ExpressionAttributeNames: {
            '#0': 'boolAttribute'
          },
          ExpressionAttributeValues: {
            ':0': {
              BOOL: true
            }
          }
        });
      });

      it('string', () => {
        expect(facade.stringAttribute.ne('test').render(new DynamoDB.CompileContextImpl())).toEqual({
          ConditionExpression: '#0 <> :0',
          ExpressionAttributeNames: {
            '#0': 'stringAttribute'
          },
          ExpressionAttributeValues: {
            ':0': {
              S: 'test'
            }
          }
        });
      });

      it('int', () => {
        expect(facade.intAttribute.ne(1).render(new DynamoDB.CompileContextImpl())).toEqual({
          ConditionExpression: '#0 <> :0',
          ExpressionAttributeNames: {
            '#0': 'intAttribute'
          },
          ExpressionAttributeValues: {
            ':0': {
              N: '1'
            }
          }
        });
      });

      it('float', () => {
        expect(facade.floatAttribute.ne(1.2).render(new DynamoDB.CompileContextImpl())).toEqual({
          ConditionExpression: '#0 <> :0',
          ExpressionAttributeNames: {
            '#0': 'floatAttribute'
          },
          ExpressionAttributeValues: {
            ':0': {
              N: '1.2'
            }
          }
        });
      });

      it('timestamp', () => {
        expect(facade.timestampAttribute.ne(new Date(1)).render(new DynamoDB.CompileContextImpl())).toEqual({
          ConditionExpression: '#0 <> :0',
          ExpressionAttributeNames: {
            '#0': 'timestampAttribute'
          },
          ExpressionAttributeValues: {
            ':0': {
              N: '1'
            }
          }
        });
      });

      it('binary', () => {
        expect(facade.binaryAttribute.ne(new Buffer('string')).render(new DynamoDB.CompileContextImpl())).toEqual({
          ConditionExpression: '#0 <> :0',
          ExpressionAttributeNames: {
            '#0': 'binaryAttribute'
          },
          ExpressionAttributeValues: {
            ':0': {
              B: new Buffer('string')
            }
          }
        });
      });

      it('struct', () => {
        const expression = facade.struct.ne({
          nested_id: 1
        });

        expect(expression.render(new DynamoDB.CompileContextImpl())).toEqual({
          ConditionExpression: '#0 <> :0',
          ExpressionAttributeNames: {
            '#0': 'struct'
          },
          ExpressionAttributeValues: {
            ':0': {
              M: {
                nested_id: {
                  N: '1'
                }
              }
            }
          }
        });
      });

      it('struct attribute', () => {
        expect(facade.struct.fields.nested_id.ne(1).render(new DynamoDB.CompileContextImpl())).toEqual({
          ConditionExpression: '#0.#1 <> :0',
          ExpressionAttributeNames: {
            '#0': 'struct',
            '#1': 'nested_id'
          },
          ExpressionAttributeValues: {
            ':0': {
              N: '1'
            }
          }
        });
      });

      it('struct as any', () => {
        expect(facade.anyAttribute.as(Shape.struct({
          nested_id: Shape.integer()
        })).fields.nested_id.ne(1).render(new DynamoDB.CompileContextImpl())).toEqual({
          ConditionExpression: '#0.#1 <> :0',
          ExpressionAttributeNames: {
            '#0': 'anyAttribute',
            '#1': 'nested_id'
          },
          ExpressionAttributeValues: {
            ':0': {
              N: '1'
            }
          }
        });
      });

      it ('list', () => {
        expect(facade.list.ne([1]).render(new DynamoDB.CompileContextImpl())).toEqual({
          ConditionExpression: '#0 <> :0',
          ExpressionAttributeNames: {
            '#0': 'list'
          },
          ExpressionAttributeValues: {
            ':0': {
              L: [ {
                N: '1'
              } ]
            }
          }
        });
      });

      it ('list item', () => {
        expect(facade.list.at(0).ne(1).render(new DynamoDB.CompileContextImpl())).toEqual({
          ConditionExpression: '#0[0] <> :0',
          ExpressionAttributeNames: {
            '#0': 'list'
          },
          ExpressionAttributeValues: {
            ':0': {
              N: '1'
            }
          }
        });
      });

      it ('map', () => {
        expect(facade.map.ne({ key: 'value' }).render(new DynamoDB.CompileContextImpl())).toEqual({
          ConditionExpression: '#0 <> :0',
          ExpressionAttributeNames: {
            '#0': 'map'
          },
          ExpressionAttributeValues: {
            ':0': {
              M: {
                key: { S: 'value' }
              }
            }
          }
        });
      });

      it ('map key', () => {
        expect(facade.map.get('key').ne('value').render(new DynamoDB.CompileContextImpl())).toEqual({
          ConditionExpression: '#0.#1 <> :0',
          ExpressionAttributeNames: {
            '#0': 'map',
            '#1': 'key'
          },
          ExpressionAttributeValues: {
            ':0': {
              S: 'value'
            }
          }
        });
      });
    });

    describe('>', () => {
      it('dynamic', () => {
        expect(facade.anyAttribute.as(Shape.string()).greaterThan('test').render(new DynamoDB.CompileContextImpl())).toEqual({
          ConditionExpression: '#0 > :0',
          ExpressionAttributeNames: {
            '#0': 'anyAttribute'
          },
          ExpressionAttributeValues: {
            ':0': {
              S: 'test'
            }
          }
        });
      });

      it('string', () => {
        expect(facade.stringAttribute.gt('test').render(new DynamoDB.CompileContextImpl())).toEqual({
          ConditionExpression: '#0 > :0',
          ExpressionAttributeNames: {
            '#0': 'stringAttribute'
          },
          ExpressionAttributeValues: {
            ':0': {
              S: 'test'
            }
          }
        });
      });

      it('int', () => {
        expect(facade.intAttribute.gt(1).render(new DynamoDB.CompileContextImpl())).toEqual({
          ConditionExpression: '#0 > :0',
          ExpressionAttributeNames: {
            '#0': 'intAttribute'
          },
          ExpressionAttributeValues: {
            ':0': {
              N: '1'
            }
          }
        });
      });

      it('float', () => {
        expect(facade.floatAttribute.gt(1.2).render(new DynamoDB.CompileContextImpl())).toEqual({
          ConditionExpression: '#0 > :0',
          ExpressionAttributeNames: {
            '#0': 'floatAttribute'
          },
          ExpressionAttributeValues: {
            ':0': {
              N: '1.2'
            }
          }
        });
      });

      it('timestamp', () => {
        expect(facade.timestampAttribute.gt(new Date(1)).render(new DynamoDB.CompileContextImpl())).toEqual({
          ConditionExpression: '#0 > :0',
          ExpressionAttributeNames: {
            '#0': 'timestampAttribute'
          },
          ExpressionAttributeValues: {
            ':0': {
              N: '1'
            }
          }
        });
      });

      it('binary', () => {
        expect(facade.binaryAttribute.gt(new Buffer('string')).render(new DynamoDB.CompileContextImpl())).toEqual({
          ConditionExpression: '#0 > :0',
          ExpressionAttributeNames: {
            '#0': 'binaryAttribute'
          },
          ExpressionAttributeValues: {
            ':0': {
              B: new Buffer('string')
            }
          }
        });
      });

      it('struct attribute', () => {
        expect(facade.struct.fields.nested_id.gt(1).render(new DynamoDB.CompileContextImpl())).toEqual({
          ConditionExpression: '#0.#1 > :0',
          ExpressionAttributeNames: {
            '#0': 'struct',
            '#1': 'nested_id'
          },
          ExpressionAttributeValues: {
            ':0': {
              N: '1'
            }
          }
        });
      });

      it('struct as any', () => {
        expect(facade.anyAttribute.as(Shape.struct({
          nested_id: Shape.integer()
        })).fields.nested_id.gt(1).render(new DynamoDB.CompileContextImpl())).toEqual({
          ConditionExpression: '#0.#1 > :0',
          ExpressionAttributeNames: {
            '#0': 'anyAttribute',
            '#1': 'nested_id'
          },
          ExpressionAttributeValues: {
            ':0': {
              N: '1'
            }
          }
        });
      });

      it ('list item', () => {
        expect(facade.list.at(0).gt(1).render(new DynamoDB.CompileContextImpl())).toEqual({
          ConditionExpression: '#0[0] > :0',
          ExpressionAttributeNames: {
            '#0': 'list'
          },
          ExpressionAttributeValues: {
            ':0': {
              N: '1'
            }
          }
        });
      });

      it ('map key', () => {
        expect(facade.map.get('key').gt('value').render(new DynamoDB.CompileContextImpl())).toEqual({
          ConditionExpression: '#0.#1 > :0',
          ExpressionAttributeNames: {
            '#0': 'map',
            '#1': 'key'
          },
          ExpressionAttributeValues: {
            ':0': {
              S: 'value'
            }
          }
        });
      });
    });

    describe('>=', () => {
      it('dynamic', () => {
        expect(facade.anyAttribute.as(Shape.string()).greaterThanOrEqual('test').render(new DynamoDB.CompileContextImpl())).toEqual({
          ConditionExpression: '#0 >= :0',
          ExpressionAttributeNames: {
            '#0': 'anyAttribute'
          },
          ExpressionAttributeValues: {
            ':0': {
              S: 'test'
            }
          }
        });
      });

      it('string', () => {
        expect(facade.stringAttribute.gte('test').render(new DynamoDB.CompileContextImpl())).toEqual({
          ConditionExpression: '#0 >= :0',
          ExpressionAttributeNames: {
            '#0': 'stringAttribute'
          },
          ExpressionAttributeValues: {
            ':0': {
              S: 'test'
            }
          }
        });
      });

      it('int', () => {
        expect(facade.intAttribute.gte(1).render(new DynamoDB.CompileContextImpl())).toEqual({
          ConditionExpression: '#0 >= :0',
          ExpressionAttributeNames: {
            '#0': 'intAttribute'
          },
          ExpressionAttributeValues: {
            ':0': {
              N: '1'
            }
          }
        });
      });

      it('float', () => {
        expect(facade.floatAttribute.gte(1.2).render(new DynamoDB.CompileContextImpl())).toEqual({
          ConditionExpression: '#0 >= :0',
          ExpressionAttributeNames: {
            '#0': 'floatAttribute'
          },
          ExpressionAttributeValues: {
            ':0': {
              N: '1.2'
            }
          }
        });
      });

      it('timestamp', () => {
        expect(facade.timestampAttribute.gte(new Date(1)).render(new DynamoDB.CompileContextImpl())).toEqual({
          ConditionExpression: '#0 >= :0',
          ExpressionAttributeNames: {
            '#0': 'timestampAttribute'
          },
          ExpressionAttributeValues: {
            ':0': {
              N: '1'
            }
          }
        });
      });

      it('binary', () => {
        expect(facade.binaryAttribute.gte(new Buffer('string')).render(new DynamoDB.CompileContextImpl())).toEqual({
          ConditionExpression: '#0 >= :0',
          ExpressionAttributeNames: {
            '#0': 'binaryAttribute'
          },
          ExpressionAttributeValues: {
            ':0': {
              B: new Buffer('string')
            }
          }
        });
      });

      it('struct attribute', () => {
        expect(facade.struct.fields.nested_id.gte(1).render(new DynamoDB.CompileContextImpl())).toEqual({
          ConditionExpression: '#0.#1 >= :0',
          ExpressionAttributeNames: {
            '#0': 'struct',
            '#1': 'nested_id'
          },
          ExpressionAttributeValues: {
            ':0': {
              N: '1'
            }
          }
        });
      });

      it('struct as any', () => {
        expect(facade.anyAttribute.as(Shape.struct({
          nested_id: Shape.integer()
        })).fields.nested_id.gte(1).render(new DynamoDB.CompileContextImpl())).toEqual({
          ConditionExpression: '#0.#1 >= :0',
          ExpressionAttributeNames: {
            '#0': 'anyAttribute',
            '#1': 'nested_id'
          },
          ExpressionAttributeValues: {
            ':0': {
              N: '1'
            }
          }
        });
      });

      it ('list item', () => {
        expect(facade.list.at(0).gte(1).render(new DynamoDB.CompileContextImpl())).toEqual({
          ConditionExpression: '#0[0] >= :0',
          ExpressionAttributeNames: {
            '#0': 'list'
          },
          ExpressionAttributeValues: {
            ':0': {
              N: '1'
            }
          }
        });
      });

      it ('map key', () => {
        expect(facade.map.get('key').gte('value').render(new DynamoDB.CompileContextImpl())).toEqual({
          ConditionExpression: '#0.#1 >= :0',
          ExpressionAttributeNames: {
            '#0': 'map',
            '#1': 'key'
          },
          ExpressionAttributeValues: {
            ':0': {
              S: 'value'
            }
          }
        });
      });
    });

    describe('<', () => {
      it('dynamic', () => {
        expect(facade.anyAttribute.as(Shape.string()).lessThan('test').render(new DynamoDB.CompileContextImpl())).toEqual({
          ConditionExpression: '#0 < :0',
          ExpressionAttributeNames: {
            '#0': 'anyAttribute'
          },
          ExpressionAttributeValues: {
            ':0': {
              S: 'test'
            }
          }
        });
      });

      it('string', () => {
        expect(facade.stringAttribute.lt('test').render(new DynamoDB.CompileContextImpl())).toEqual({
          ConditionExpression: '#0 < :0',
          ExpressionAttributeNames: {
            '#0': 'stringAttribute'
          },
          ExpressionAttributeValues: {
            ':0': {
              S: 'test'
            }
          }
        });
      });

      it('int', () => {
        expect(facade.intAttribute.lt(1).render(new DynamoDB.CompileContextImpl())).toEqual({
          ConditionExpression: '#0 < :0',
          ExpressionAttributeNames: {
            '#0': 'intAttribute'
          },
          ExpressionAttributeValues: {
            ':0': {
              N: '1'
            }
          }
        });
      });

      it('float', () => {
        expect(facade.floatAttribute.lt(1.2).render(new DynamoDB.CompileContextImpl())).toEqual({
          ConditionExpression: '#0 < :0',
          ExpressionAttributeNames: {
            '#0': 'floatAttribute'
          },
          ExpressionAttributeValues: {
            ':0': {
              N: '1.2'
            }
          }
        });
      });

      it('timestamp', () => {
        expect(facade.timestampAttribute.lt(new Date(1)).render(new DynamoDB.CompileContextImpl())).toEqual({
          ConditionExpression: '#0 < :0',
          ExpressionAttributeNames: {
            '#0': 'timestampAttribute'
          },
          ExpressionAttributeValues: {
            ':0': {
              N: '1'
            }
          }
        });
      });

      it('binary', () => {
        expect(facade.binaryAttribute.lt(new Buffer('string')).render(new DynamoDB.CompileContextImpl())).toEqual({
          ConditionExpression: '#0 < :0',
          ExpressionAttributeNames: {
            '#0': 'binaryAttribute'
          },
          ExpressionAttributeValues: {
            ':0': {
              B: new Buffer('string')
            }
          }
        });
      });

      it('struct attribute', () => {
        expect(facade.struct.fields.nested_id.lt(1).render(new DynamoDB.CompileContextImpl())).toEqual({
          ConditionExpression: '#0.#1 < :0',
          ExpressionAttributeNames: {
            '#0': 'struct',
            '#1': 'nested_id'
          },
          ExpressionAttributeValues: {
            ':0': {
              N: '1'
            }
          }
        });
      });

      it('struct as any', () => {
        expect(facade.anyAttribute.as(Shape.struct({
          nested_id: Shape.integer()
        })).fields.nested_id.lt(1).render(new DynamoDB.CompileContextImpl())).toEqual({
          ConditionExpression: '#0.#1 < :0',
          ExpressionAttributeNames: {
            '#0': 'anyAttribute',
            '#1': 'nested_id'
          },
          ExpressionAttributeValues: {
            ':0': {
              N: '1'
            }
          }
        });
      });

      it ('list item', () => {
        expect(facade.list.at(0).lt(1).render(new DynamoDB.CompileContextImpl())).toEqual({
          ConditionExpression: '#0[0] < :0',
          ExpressionAttributeNames: {
            '#0': 'list'
          },
          ExpressionAttributeValues: {
            ':0': {
              N: '1'
            }
          }
        });
      });

      it ('map key', () => {
        expect(facade.map.get('key').lt('value').render(new DynamoDB.CompileContextImpl())).toEqual({
          ConditionExpression: '#0.#1 < :0',
          ExpressionAttributeNames: {
            '#0': 'map',
            '#1': 'key'
          },
          ExpressionAttributeValues: {
            ':0': {
              S: 'value'
            }
          }
        });
      });
    });

    describe('<=', () => {
      it('dynamic', () => {
        expect(facade.anyAttribute.as(Shape.string()).lessThanOrEqual('test').render(new DynamoDB.CompileContextImpl())).toEqual({
          ConditionExpression: '#0 <= :0',
          ExpressionAttributeNames: {
            '#0': 'anyAttribute'
          },
          ExpressionAttributeValues: {
            ':0': {
              S: 'test'
            }
          }
        });
      });

      it('string', () => {
        expect(facade.stringAttribute.lte('test').render(new DynamoDB.CompileContextImpl())).toEqual({
          ConditionExpression: '#0 <= :0',
          ExpressionAttributeNames: {
            '#0': 'stringAttribute'
          },
          ExpressionAttributeValues: {
            ':0': {
              S: 'test'
            }
          }
        });
      });

      it('int', () => {
        expect(facade.intAttribute.lte(1).render(new DynamoDB.CompileContextImpl())).toEqual({
          ConditionExpression: '#0 <= :0',
          ExpressionAttributeNames: {
            '#0': 'intAttribute'
          },
          ExpressionAttributeValues: {
            ':0': {
              N: '1'
            }
          }
        });
      });

      it('float', () => {
        expect(facade.floatAttribute.lte(1.2).render(new DynamoDB.CompileContextImpl())).toEqual({
          ConditionExpression: '#0 <= :0',
          ExpressionAttributeNames: {
            '#0': 'floatAttribute'
          },
          ExpressionAttributeValues: {
            ':0': {
              N: '1.2'
            }
          }
        });
      });

      it('timestamp', () => {
        expect(facade.timestampAttribute.lte(new Date(1)).render(new DynamoDB.CompileContextImpl())).toEqual({
          ConditionExpression: '#0 <= :0',
          ExpressionAttributeNames: {
            '#0': 'timestampAttribute'
          },
          ExpressionAttributeValues: {
            ':0': {
              N: '1'
            }
          }
        });
      });

      it('binary', () => {
        expect(facade.binaryAttribute.lte(new Buffer('string')).render(new DynamoDB.CompileContextImpl())).toEqual({
          ConditionExpression: '#0 <= :0',
          ExpressionAttributeNames: {
            '#0': 'binaryAttribute'
          },
          ExpressionAttributeValues: {
            ':0': {
              B: new Buffer('string')
            }
          }
        });
      });

      it('struct attribute', () => {
        expect(facade.struct.fields.nested_id.lte(1).render(new DynamoDB.CompileContextImpl())).toEqual({
          ConditionExpression: '#0.#1 <= :0',
          ExpressionAttributeNames: {
            '#0': 'struct',
            '#1': 'nested_id'
          },
          ExpressionAttributeValues: {
            ':0': {
              N: '1'
            }
          }
        });
      });

      it('struct as any', () => {
        expect(facade.anyAttribute.as(Shape.struct({
          nested_id: Shape.integer()
        })).fields.nested_id.lte(1).render(new DynamoDB.CompileContextImpl())).toEqual({
          ConditionExpression: '#0.#1 <= :0',
          ExpressionAttributeNames: {
            '#0': 'anyAttribute',
            '#1': 'nested_id'
          },
          ExpressionAttributeValues: {
            ':0': {
              N: '1'
            }
          }
        });
      });

      it ('list item', () => {
        expect(facade.list.at(0).lte(1).render(new DynamoDB.CompileContextImpl())).toEqual({
          ConditionExpression: '#0[0] <= :0',
          ExpressionAttributeNames: {
            '#0': 'list'
          },
          ExpressionAttributeValues: {
            ':0': {
              N: '1'
            }
          }
        });
      });

      it ('map key', () => {
        expect(facade.map.get('key').lte('value').render(new DynamoDB.CompileContextImpl())).toEqual({
          ConditionExpression: '#0.#1 <= :0',
          ExpressionAttributeNames: {
            '#0': 'map',
            '#1': 'key'
          },
          ExpressionAttributeValues: {
            ':0': {
              S: 'value'
            }
          }
        });
      });
    });
  });

  describe('operand BETWEEN operand AND operand', () => {
    it('dynamic', () => {
      expect(facade.anyAttribute.as(Shape.string()).between('a', 'b').render(new DynamoDB.CompileContextImpl())).toEqual({
        ConditionExpression: '#0 BETWEEN :0 AND :1',
        ExpressionAttributeNames: {
          '#0': 'anyAttribute'
        },
        ExpressionAttributeValues: {
          ':0': { S: 'a' },
          ':1': { S: 'b' }
        }
      });
    });

    it('string', () => {
      expect(facade.stringAttribute.between('a', 'b').render(new DynamoDB.CompileContextImpl())).toEqual({
        ConditionExpression: '#0 BETWEEN :0 AND :1',
        ExpressionAttributeNames: {
          '#0': 'stringAttribute'
        },
        ExpressionAttributeValues: {
          ':0': { S: 'a' },
          ':1': { S: 'b' }
        }
      });
    });

    it('int', () => {
      expect(facade.intAttribute.between(1, 2).render(new DynamoDB.CompileContextImpl())).toEqual({
        ConditionExpression: '#0 BETWEEN :0 AND :1',
        ExpressionAttributeNames: {
          '#0': 'intAttribute'
        },
        ExpressionAttributeValues: {
          ':0': { N: '1' },
          ':1': { N: '2' }
        }
      });
    });

    it('float', () => {
      expect(facade.floatAttribute.between(1.1, 2.2).render(new DynamoDB.CompileContextImpl())).toEqual({
        ConditionExpression: '#0 BETWEEN :0 AND :1',
        ExpressionAttributeNames: {
          '#0': 'floatAttribute'
        },
        ExpressionAttributeValues: {
          ':0': { N: '1.1' },
          ':1': { N: '2.2' }
        }
      });
    });

    it('timestamp', () => {
      expect(facade.timestampAttribute.between(new Date(1), new Date(2)).render(new DynamoDB.CompileContextImpl())).toEqual({
        ConditionExpression: '#0 BETWEEN :0 AND :1',
        ExpressionAttributeNames: {
          '#0': 'timestampAttribute'
        },
        ExpressionAttributeValues: {
          ':0': { N: '1' },
          ':1': { N: '2' }
        }
      });
    });

    it('binary', () => {
      expect(facade.binaryAttribute.between(new Buffer('a'), new Buffer('b')).render(new DynamoDB.CompileContextImpl())).toEqual({
        ConditionExpression: '#0 BETWEEN :0 AND :1',
        ExpressionAttributeNames: {
          '#0': 'binaryAttribute'
        },
        ExpressionAttributeValues: {
          ':0': { B: new Buffer('a') },
          ':1': { B: new Buffer('b') }
        }
      });
    });

    it('struct attribute', () => {
      expect(facade.struct.fields.nested_id.between(1, 2).render(new DynamoDB.CompileContextImpl())).toEqual({
        ConditionExpression: '#0.#1 BETWEEN :0 AND :1',
        ExpressionAttributeNames: {
          '#0': 'struct',
          '#1': 'nested_id'
        },
        ExpressionAttributeValues: {
          ':0': { N: '1' },
          ':1': { N: '2' }
        }
      });
    });

    it('list item', () => {
      expect(facade.list.at(0).between(1, 2).render(new DynamoDB.CompileContextImpl())).toEqual({
        ConditionExpression: '#0[0] BETWEEN :0 AND :1',
        ExpressionAttributeNames: {
          '#0': 'list'
        },
        ExpressionAttributeValues: {
          ':0': { N: '1' },
          ':1': { N: '2' }
        }
      });
    });

    it('map key', () => {
      expect(facade.map.get('key').between('a', 'b').render(new DynamoDB.CompileContextImpl())).toEqual({
        ConditionExpression: '#0.#1 BETWEEN :0 AND :1',
        ExpressionAttributeNames: {
          '#0': 'map',
          '#1': 'key'
        },
        ExpressionAttributeValues: {
          ':0': { S: 'a' },
          ':1': { S: 'b' }
        }
      });
    });
  });

  describe("operand IN operand (',' operand (, ...) ))", () => {
    it('string', () => {
      expect(facade.anyAttribute.as(Shape.string()).in('a', 'b', 'c').render(new DynamoDB.CompileContextImpl())).toEqual({
        ConditionExpression: '#0 IN (:0,:1,:2)',
        ExpressionAttributeNames: {
          '#0': 'anyAttribute'
        },
        ExpressionAttributeValues: {
          ':0': { S: 'a' },
          ':1': { S: 'b' },
          ':2': { S: 'c' }
        }
      });
    });

    it('string', () => {
      expect(facade.stringAttribute.in('a', 'b', 'c').render(new DynamoDB.CompileContextImpl())).toEqual({
        ConditionExpression: '#0 IN (:0,:1,:2)',
        ExpressionAttributeNames: {
          '#0': 'stringAttribute'
        },
        ExpressionAttributeValues: {
          ':0': { S: 'a' },
          ':1': { S: 'b' },
          ':2': { S: 'c' }
        }
      });
    });

    it('int', () => {
      expect(facade.intAttribute.in(1, 2, 3).render(new DynamoDB.CompileContextImpl())).toEqual({
        ConditionExpression: '#0 IN (:0,:1,:2)',
        ExpressionAttributeNames: {
          '#0': 'intAttribute'
        },
        ExpressionAttributeValues: {
          ':0': { N: '1' },
          ':1': { N: '2' },
          ':2': { N: '3' }
        }
      });
    });

    it('float', () => {
      expect(facade.floatAttribute.in(1.1, 2.2, 3.3).render(new DynamoDB.CompileContextImpl())).toEqual({
        ConditionExpression: '#0 IN (:0,:1,:2)',
        ExpressionAttributeNames: {
          '#0': 'floatAttribute'
        },
        ExpressionAttributeValues: {
          ':0': { N: '1.1' },
          ':1': { N: '2.2' },
          ':2': { N: '3.3' }
        }
      });
    });

    it('timestamp', () => {
      expect(facade.timestampAttribute.in(new Date(1), new Date(2), new Date(3)).render(new DynamoDB.CompileContextImpl())).toEqual({
        ConditionExpression: '#0 IN (:0,:1,:2)',
        ExpressionAttributeNames: {
          '#0': 'timestampAttribute'
        },
        ExpressionAttributeValues: {
          ':0': { N: '1' },
          ':1': { N: '2' },
          ':2': { N: '3' }
        }
      });
    });

    it('binary', () => {
      expect(facade.binaryAttribute.in(new Buffer('a'), new Buffer('b'), new Buffer('c')).render(new DynamoDB.CompileContextImpl())).toEqual({
        ConditionExpression: '#0 IN (:0,:1,:2)',
        ExpressionAttributeNames: {
          '#0': 'binaryAttribute'
        },
        ExpressionAttributeValues: {
          ':0': { B: new Buffer('a') },
          ':1': { B: new Buffer('b') },
          ':2': { B: new Buffer('c') }
        }
      });
    });

    it('struct attribute', () => {
      expect(facade.struct.fields.nested_id.in(1, 2, 3).render(new DynamoDB.CompileContextImpl())).toEqual({
        ConditionExpression: '#0.#1 IN (:0,:1,:2)',
        ExpressionAttributeNames: {
          '#0': 'struct',
          '#1': 'nested_id'
        },
        ExpressionAttributeValues: {
          ':0': { N: '1' },
          ':1': { N: '2' },
          ':2': { N: '3' },
        }
      });
    });

    it('list item', () => {
      expect(facade.list.at(0).in(1, 2, 3).render(new DynamoDB.CompileContextImpl())).toEqual({
        ConditionExpression: '#0[0] IN (:0,:1,:2)',
        ExpressionAttributeNames: {
          '#0': 'list'
        },
        ExpressionAttributeValues: {
          ':0': { N: '1' },
          ':1': { N: '2' },
          ':2': { N: '3' },
        }
      });
    });

    it('map key', () => {
      expect(facade.map.get('key').in('a', 'b', 'c').render(new DynamoDB.CompileContextImpl())).toEqual({
        ConditionExpression: '#0.#1 IN (:0,:1,:2)',
        ExpressionAttributeNames: {
          '#0': 'map',
          '#1': 'key'
        },
        ExpressionAttributeValues: {
          ':0': { S: 'a' },
          ':1': { S: 'b' },
          ':2': { S: 'c' },
        }
      });
    });
  });

  describe('function', () => {
    it('attribute_exists', () => {
      expect(attribute_exists(facade.stringAttribute).render(new DynamoDB.CompileContextImpl())).toEqual({
        ConditionExpression: 'attribute_exists(#0)',
        ExpressionAttributeNames: {
          '#0': 'stringAttribute'
        },
      });
    });

    it('attribute_not_exists', () => {
      expect(attribute_not_exists(facade.stringAttribute).render(new DynamoDB.CompileContextImpl())).toEqual({
        ConditionExpression: 'attribute_not_exists(#0)',
        ExpressionAttributeNames: {
          '#0': 'stringAttribute'
        },
      });
    });

    describe('begins_with', () => {
      it('string', () => {
        expect(facade.anyAttribute.as(Shape.string()).beginsWith('string').render(new DynamoDB.CompileContextImpl())).toEqual({
          ConditionExpression: 'begins_with(#0,:0)',
          ExpressionAttributeNames: {
            '#0': 'anyAttribute'
          },
          ExpressionAttributeValues: {
            ':0': { S: 'string' }
          }
        });
      });

      it('string', () => {
        expect(facade.stringAttribute.beginsWith('string').render(new DynamoDB.CompileContextImpl())).toEqual({
          ConditionExpression: 'begins_with(#0,:0)',
          ExpressionAttributeNames: {
            '#0': 'stringAttribute'
          },
          ExpressionAttributeValues: {
            ':0': { S: 'string' }
          }
        });
      });

      it('binary', () => {
        expect(facade.binaryAttribute.beginsWith(new Buffer('string')).render(new DynamoDB.CompileContextImpl())).toEqual({
          ConditionExpression: 'begins_with(#0,:0)',
          ExpressionAttributeNames: {
            '#0': 'binaryAttribute'
          },
          ExpressionAttributeValues: {
            ':0': { B: new Buffer('string') }
          }
        });
      });
    });

    describe('contains', () => {
      it('any attribute', () => {
        expect(facade.anyAttribute.as(Shape.string()).contains('string').render(new DynamoDB.CompileContextImpl())).toEqual({
          ConditionExpression: 'contains(#0,:0)',
          ExpressionAttributeNames: {
            '#0': 'anyAttribute'
          },
          ExpressionAttributeValues: {
            ':0': {
              S: 'string'
            }
          }
        });
      });

      it('string attribute', () => {
        expect(facade.stringAttribute.contains('string').render(new DynamoDB.CompileContextImpl())).toEqual({
          ConditionExpression: 'contains(#0,:0)',
          ExpressionAttributeNames: {
            '#0': 'stringAttribute'
          },
          ExpressionAttributeValues: {
            ':0': {
              S: 'string'
            }
          }
        });
      });

      it ('stringSet attribute', () => {
        expect(facade.stringSetAttribute.contains('string').render(new DynamoDB.CompileContextImpl())).toEqual({
          ConditionExpression: 'contains(#0,:0)',
          ExpressionAttributeNames: {
            '#0': 'stringSetAttribute'
          },
          ExpressionAttributeValues: {
            ':0': {
              S: 'string'
            }
          }
        });
      });

      it ('intSet attribute', () => {
        expect(facade.intSetAttribute.contains(1).render(new DynamoDB.CompileContextImpl())).toEqual({
          ConditionExpression: 'contains(#0,:0)',
          ExpressionAttributeNames: {
            '#0': 'intSetAttribute'
          },
          ExpressionAttributeValues: {
            ':0': {
              N: '1'
            }
          }
        });
      });

      it ('floatSet attribute', () => {
        expect(facade.floatSetAttribute.contains(1.1).render(new DynamoDB.CompileContextImpl())).toEqual({
          ConditionExpression: 'contains(#0,:0)',
          ExpressionAttributeNames: {
            '#0': 'floatSetAttribute'
          },
          ExpressionAttributeValues: {
            ':0': {
              N: '1.1'
            }
          }
        });
      });

      it ('binarySet attribute', () => {
        expect(facade.binarySetAttribute.contains(new Buffer('string')).render(new DynamoDB.CompileContextImpl())).toEqual({
          ConditionExpression: 'contains(#0,:0)',
          ExpressionAttributeNames: {
            '#0': 'binarySetAttribute'
          },
          ExpressionAttributeValues: {
            ':0': {
              B: new Buffer('string')
            }
          }
        });
      });

      it('path', () => {
        const expression = facade.intSetAttribute.contains(facade.intAttribute).render(new DynamoDB.CompileContextImpl());

        expect(expression).toEqual({
          ConditionExpression: 'contains(#0,#1)',
          ExpressionAttributeNames: {
            '#0': 'intSetAttribute',
            '#1': 'intAttribute',
          }
        });
      });
    });

    describe('size', () => {
      it('size(path) > 0', () => {
        expect(facade.stringAttribute.length.greaterThan(0).render(new DynamoDB.CompileContextImpl())).toEqual({
          ConditionExpression: 'size(#0) > :0',
          ExpressionAttributeNames: {
            '#0': 'stringAttribute'
          },
          ExpressionAttributeValues: {
            ':0': {
              N: '0'
            }
          }
        });
      });

      // Maybe later?
      // it('0 > size(path)')

      it('size(path) > path', () => {
        expect(facade.stringAttribute.length.greaterThan(facade.intAttribute).render(new DynamoDB.CompileContextImpl())).toEqual({
          ConditionExpression: 'size(#0) > #1',
          ExpressionAttributeNames: {
            '#0': 'stringAttribute',
            '#1': 'intAttribute',
          },
        });
      });

      it('path1 > size(path2)', () => {
        expect(facade.intAttribute.greaterThan(facade.stringAttribute.length).render(new DynamoDB.CompileContextImpl())).toEqual({
          ConditionExpression: '#0 > size(#1)',
          ExpressionAttributeNames: {
            '#0': 'intAttribute',
            '#1': 'stringAttribute',
          },
        });
      });
    });
  });

  describe('logic-expression', () => {
    it('condition AND condition', () => {
      const expected = {
        ConditionExpression: '#0 = :0 AND #1 = :1',
        ExpressionAttributeNames: {
          '#0': 'stringAttribute',
          '#1': 'intAttribute'
        },
        ExpressionAttributeValues: {
          ':0': {
            S: 'string'
          },
          ':1': {
            N: '1'
          }
        }
      };

      expect(and(facade.stringAttribute.equals('string'), facade.intAttribute.equals(1)).render(new DynamoDB.CompileContextImpl())).toEqual(expected);
      expect(facade.stringAttribute.equals('string').and(facade.intAttribute.equals(1)).render(new DynamoDB.CompileContextImpl())).toEqual(expected);
    });

    it('condition OR condition', () => {
      const expected = {
        ConditionExpression: '#0 = :0 OR #1 = :1',
        ExpressionAttributeNames: {
          '#0': 'stringAttribute',
          '#1': 'intAttribute'
        },
        ExpressionAttributeValues: {
          ':0': {
            S: 'string'
          },
          ':1': {
            N: '1'
          }
        }
      };

      expect(or(facade.stringAttribute.equals('string'), facade.intAttribute.equals(1)).render(new DynamoDB.CompileContextImpl())).toEqual(expected);
      expect(facade.stringAttribute.equals('string').or(facade.intAttribute.equals(1)).render(new DynamoDB.CompileContextImpl())).toEqual(expected);
    });

    it('NOT condition', () => {
      expect(not(facade.stringAttribute.equals('string')).render(new DynamoDB.CompileContextImpl()))
      .toEqual({
        ConditionExpression: 'NOT #0 = :0',
        ExpressionAttributeNames: {
          '#0': 'stringAttribute'
        },
        ExpressionAttributeValues: {
          ':0': {
            S: 'string'
          }
        }
      });
    });

    it('parenthesis', () => {
      const expression = _(facade.stringAttribute.eq('test').or(facade.intAttribute.between(1, 10))).and(facade.struct.fields.nested_id.eq(1));

      expect(expression.render(new DynamoDB.CompileContextImpl())).toEqual({
          ConditionExpression: '(#0 = :0 OR #1 BETWEEN :1 AND :2) AND #2.#3 = :3',
          ExpressionAttributeNames: {
            '#0': 'stringAttribute',
            '#1': 'intAttribute',
            '#2': 'struct',
            '#3': 'nested_id',
          },
          ExpressionAttributeValues: {
            ':0': { S: 'test' },
            ':1': { N: '1' },
            ':2': { N: '10' },
            ':3': { N: '1' },
          }
        });
    });
  });
});