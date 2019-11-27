import glue = require('@aws-cdk/aws-glue');
import cdk = require('@aws-cdk/core');
import { Core, SNS, Lambda, DynamoDB } from 'punchcard';

import { integer, string, struct, array, timestamp, } from 'punchcard/lib/shape';

import uuid = require('uuid');
import { Duration } from '@aws-cdk/core';
import { BillingMode } from '@aws-cdk/aws-dynamodb';
import { StreamEncryption } from '@aws-cdk/aws-kinesis';
import { Schedule } from '@aws-cdk/aws-events';
import { Build } from 'punchcard/lib/core/build';

export const app = new Core.App();

const stack = app.root.map(app => new cdk.Stack(app, 'stream-processing', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION
  }
}));

/**
 * Create a SNS Topic.
 */
const topic = new SNS.Topic(stack, 'Topic', {
  /**
   * Message is a JSON Object with properties: `key`, `count` and `timestamp`.
   */
  shape: struct({
    key: string(),
    count: integer(),
    timestamp,
  })
});

/**
 * Create a DynamoDB Table to store some data.
 */
const enrichments = new DynamoDB.Table(stack, 'Enrichments', {
  partitionKey: 'key',
  attributes: {
    // define the shape of data in the dynamodb table
    key: string(),
    tags: array(string())
  },
  tableProps: Build.lazy(() => ({
    billingMode: BillingMode.PAY_PER_REQUEST
  }))
});

/**
 * Schedule a Lambda Function to send a (dummy) message to the SNS topic:
 * 
 * CloudWatch Event --(minutely)--> Lambda --(send)-> SNS Topic
 *                                         --(put)--> Dynamo Table
 **/ 
Lambda.schedule(stack, 'DummyData', {
  /**
   * Trigger the function every minute.
   */
  schedule: Schedule.rate(Duration.minutes(1)),

  /**
   * Define our runtime dependencies:
   *
   * We want to *publish* to the SNS `topic` and *write* to the DynamoDB `table`.
   */
  depends: Core.Dependency.concat(
    topic.publishAccess(),
    enrichments.writeAccess()),

  /**
   * Impement the Lambda Function.
   * 
   * We will be passed clients for each of our dependencies: the `topic` and `table`.
   */
  handle: async (_, [topic, table]) => {
    const key = uuid();
    // write some data to the dynamodb table
    await table.put({
      item: {
        key,
        tags: ['some', 'tags']
      }
    });

    // send 3 SNS notifications
    await Promise.all([1, 2, 3].map(async (i) => {
      // message is structured and strongly typed (based on our Topic definition above)
      await topic.publish({
        key,
        count: i,
        timestamp: new Date(),
      });
    }));
  }
});

/**
 * Process each SNS notification in Lambda:
 *
 * SNS -> Lambda
 */
topic.notifications().forEach(stack, 'ForEachNotification', {
  async handle(message) {
    console.log(`received notification '${message.key}' with a delay of ${new Date().getTime() - message.timestamp.getTime()}ms`);
  }
});

/**
 * Subscribe SNS Topic to a SQS Queue:
 *
 * SNS --(subscription)--> SQS
 */
const queue = topic.toSQSQueue(stack, 'Queue');

/**
 * Process each message in SQS with Lambda, look up some data in DynamoDB, and persist results in a Kinesis Stream:
 *
 *              Dynamo
 *                | (get)
 *                v
 * SQS Queue -> Lambda -> Kinesis Stream
 */
const stream = queue.messages() // gives us a nice chainable API
  .map({
    depends: enrichments.readAccess(),
    handle: async(message, e) => {
      // here we transform messages received from SQS by looking up some data in DynamoDB
      const enrichment = await e.get({
        key: message.key
      });

      return {
        ...message,
        tags: enrichment ? enrichment.tags : [],
        timestamp: new Date()
      };
    }
  })
  .toKinesisStream(stack, 'Stream', {
    // encrypt values in the stream with a customer-managed KMS key.
    encryption: StreamEncryption.KMS,

    // partition values across shards by the 'key' field
    partitionBy: value => value.key,

    // type of the data in the stream
    shape: struct({
      key: string(),
      count: integer(),
      tags: array(string()),
      timestamp
    })
  });

/**
 * Persist Kinesis Stream data as a tome-series Glue Table.
 * 
 * Kinesis Stream -> Firehose Delivery Stream -> S3 (staging) -> Lambda -> S3 (partitioned by `year`, `month`, `day`, `hour` and `minute`)
 *                                                                      -> Glue Catalog
 */
const database = stack.map(stack => new glue.Database(stack, 'Database', {
  databaseName: 'my_database'
}));
stream
  .toFirehoseDeliveryStream(stack, 'ToS3').objects()
  .toGlueTable(stack, 'ToGlue', {
    database,
    tableName: 'my_table',
    columns: {
      key: string(),
      count: integer(),
      tags: array(string()),
      timestamp
    },
    partition: {
      // Glue Table partition keys: minutely using the timestamp field
      keys: {
        year: integer(),
        month: integer(),
        day: integer(),
        hour: integer(),
        minute: integer()
      },
      get: record => ({
        // define the mapping of a record to its Glue Table partition keys
        year: record.timestamp.getUTCFullYear(),
        month: record.timestamp.getUTCMonth(),
        day: record.timestamp.getUTCDate(),
        hour: record.timestamp.getUTCHours(),
        minute: record.timestamp.getUTCMinutes(),
      })
    }
  });
