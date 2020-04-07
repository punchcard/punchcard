/**
 * Core packages.
 */
import * as Core from './core';
import * as Util from './util';

export {
  Core,
  Util
};

/**
 * Export namespaces for each AWS service
 */
import * as CloudWatch from './cloudwatch';
import * as DynamoDB from './dynamodb';
import * as Firehose from './firehose';
import * as Glue from './glue';
import * as Kinesis from './kinesis';
import * as Lambda from './lambda';
import * as S3 from './s3';
import * as SNS from './sns';
import * as SQS from './sqs';

export {
  CloudWatch,
  DynamoDB,
  Firehose,
  Glue,
  Kinesis,
  Lambda,
  S3,
  SNS,
  SQS,
};
