import cdk = require('@aws-cdk/core');
import { Schedule } from '@aws-cdk/aws-events';
import { Core, Lambda } from 'punchcard';

const app = new Core.App();
const stack = app.root.map(app => new cdk.Stack(app, 'MyStack', {
  env: {
    account: '785049305830',
    region: 'us-west-2'
  }
}));

Lambda.schedule(stack, 'MyFunction', {
  schedule: Schedule.rate(cdk.Duration.minutes(1)),
  handle: async() => console.log('Hello, World!')
});
