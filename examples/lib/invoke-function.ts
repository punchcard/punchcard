import { BillingMode } from '@aws-cdk/aws-dynamodb';
import cdk = require('@aws-cdk/core');
import { Duration } from '@aws-cdk/core';
import { Schedule } from '@aws-cdk/aws-events';

import { DynamoDB, integer, Lambda, string, struct, dynamic, unsafeDynamic } from 'punchcard';

const app = new cdk.App();
export default app;

const stack = new cdk.Stack(app, 'invoke-function');

const executorService = new Lambda.ExecutorService({
  timeout: cdk.Duration.seconds(10)
});

const table = new DynamoDB.Table(stack, 'my-table', {
  partitionKey: 'id',
  shape: {
    id: string(),
    count: integer({
      minimum: 0
    }),
    anyProperty: dynamic 
  },
  billingMode: BillingMode.PAY_PER_REQUEST
});

// create a function that increments counts in a dynamodb table
// Function<request, response>
const incrementer = executorService.spawn(stack, 'Callable', {
  // request is a structure with a single property, 'id'
  request: struct({
    id: string()
  }),
  // response is just an integer
  response: integer(),
  depends: table,
  handle: async (request, table) => {
    console.log(request);
    const item = await table.get({
      id: request.id
    });

    let newCount: number;
    if (item) {
      await table.update({
        key: {
          id: request.id
        },
        actions: item => [
          item.count.increment(1),
        ],
      });
      newCount = item.count + 1;
    } else {
      await table.put({
        item: {
          id: request.id,
          count: 1,
          anyProperty: {
            this: 'property can be any type supported by the AWS.DynamoDB.DocumentClient',
          }
        },
        if: item => DynamoDB.attribute_not_exists(item.id)
      });
      newCount = 1;
    }
    return newCount;
  }
});

// call the incrementer function from another Lambda Function
executorService.schedule(stack, 'Caller', {
  depends: incrementer,
  schedule: Schedule.rate(Duration.minutes(1)),
  handle: async (_, incrementer) => {
    const newCount = await incrementer.invoke({
      id: 'id'
    });
    console.log(`new count of 'id' is ${newCount}`);
  }
});