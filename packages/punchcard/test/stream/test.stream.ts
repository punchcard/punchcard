import core = require('@aws-cdk/core');
import 'jest';
import sinon = require('sinon');

import { Kinesis, Shape } from '../../lib';

// tslint:disable-next-line: variable-name
const { string } = Shape;

describe('client', () => {
  describe('sink', () => {
    it('should sink all messages', async () => {
      const stream = new Kinesis.Stream(new core.Stack(new core.App(), 'stack'), 'stream', {
        shape: string(),
        partitionBy: () => 'p'
      });
      const mockClient = {
        putRecords: sinon.fake.returns({
          promise: () => Promise.resolve({
            FailedRecordCount: 0
          })
        })
      };
      const client = new Kinesis.Client(stream, 'streamName', mockClient as any);

      await client.sink(['1']);

      expect(mockClient.putRecords.calledOnce).toBe(true);
      expect(mockClient.putRecords.args[0]).toEqual([{
        Records: [{
          Data: Buffer.from('"1"', 'utf8'),
          PartitionKey: 'p'
        }],
        StreamName: 'streamName'
      }]);
    });
    it('should divide and conquer evenly', async () => {
      const stream = new Kinesis.Stream(new core.Stack(new core.App(), 'stack'), 'stream', {
        shape: string(),
        partitionBy: () => 'p'
      });
      const mockClient = {
        putRecords: sinon.fake.returns({
          promise: () => Promise.resolve({
            FailedRecordCount: 0
          })
        })
      };
      const client = new Kinesis.Client(stream, 'streamName', mockClient as any);

      await client.sink(Array(600).fill('1'));

      expect(mockClient.putRecords.calledTwice).toBe(true);
      expect(mockClient.putRecords.args[0]).toEqual([{
        Records: Array(300).fill({
          Data: Buffer.from('"1"', 'utf8'),
          PartitionKey: 'p'
        }),
        StreamName: 'streamName'
      }]);
      expect(mockClient.putRecords.args[1]).toEqual([{
        Records: Array(300).fill({
          Data: Buffer.from('"1"', 'utf8'),
          PartitionKey: 'p'
        }),
        StreamName: 'streamName'
      }]);
    });
    it('should divide and conquer oddly', async () => {
      const stream = new Kinesis.Stream(new core.Stack(new core.App(), 'stack'), 'stream', {
        shape: string(),
        partitionBy: () => 'p'
      });
      const mockClient = {
        putRecords: sinon.fake.returns({
          promise: () => Promise.resolve({
            FailedRecordCount: 0
          })
        })
      };
      const client = new Kinesis.Client(stream, 'streamName', mockClient as any);

      await client.sink(Array(599).fill('1'));

      expect(mockClient.putRecords.calledTwice).toBe(true);
      expect(mockClient.putRecords.args[0]).toEqual([{
        Records: Array(299).fill({
          Data: Buffer.from('"1"', 'utf8'),
          PartitionKey: 'p'
        }),
        StreamName: 'streamName'
      }]);
      expect(mockClient.putRecords.args[1]).toEqual([{
        Records: Array(300).fill({
          Data: Buffer.from('"1"', 'utf8'),
          PartitionKey: 'p'
        }),
        StreamName: 'streamName'
      }]);
    });
  });
});
