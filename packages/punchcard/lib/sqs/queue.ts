import iam = require('@aws-cdk/aws-iam');
import sqs = require('@aws-cdk/aws-sqs');
import core = require('@aws-cdk/core');
import AWS = require('aws-sdk');

import { Build } from '../core/build';
import { Dependency } from '../core/dependency';
import { Resource } from '../core/resource';
import { Run } from '../core/run';
import { Json, Mapper, RuntimeShape, Shape } from '../shape';
import { sink, Sink, SinkProps } from '../util/sink';
import { Event } from './event';
import { Messages } from './messages';

/**
 * Props for constructing a Queue.
 *
 * It extends the standard `sqs.QueueProps` with a `mapper` instance.
 */
export interface QueueProps<S extends Shape<any>> extends sqs.QueueProps {
  /**
   * Shape of data in the SQS Queue.
   */
  shape: S;
}
/**
 * Represents a SQS Queue containtining messages of type, `T`, serialized with some `Codec`.
 */
export class Queue<S extends Shape<any>> implements Resource<sqs.Queue> {
  public readonly context = {};
  public readonly mapper: Mapper<RuntimeShape<S>, string>;
  public readonly resource: Build<sqs.Queue>;
  public readonly shape: S;

  constructor(scope: Build<core.Construct>, id: string, props: QueueProps<S>) {
    this.shape = props.shape;
    this.resource = scope.map(scope => new sqs.Queue(scope, id, props));
    this.mapper = Json.forShape(props.shape);
  }

  /**
   * Get a Lazy `Stream` of notifications Queue's messages.
   *
   * Warning: do not consume from the Queue twice - it does not have fan-out.
   */
  public messages(): Messages<RuntimeShape<S>, []> {
    const mapper = this.mapper;
    class Root extends Messages<RuntimeShape<S>, []> {
      /**
       * Bottom of the recursive async generator - returns the records
       * parsed and validated out of the SQSEvent.
       *
       * @param event payload of SQS event
       */
      public async *run(event: Event) {
        for (const record of event.Records.map(record => mapper.read(record.body))) {
          yield record;
        }
      }
    }
    return new Root(this, undefined as any, {
      depends: [],
      handle: i => i
    });
  }

  /**
   * A client with permission to consume and send messages.
   */
  public consumeAndSendAccess(): Dependency<Queue.ConsumeAndSendClient<S>> {
    return this.dependency((queue, g) => {
      queue.grantConsumeMessages(g);
      queue.grantSendMessages(g);
    });
  }

  /**
   * A client with only permission to consume messages from this Queue.
   */
  public consumeAccess(): Dependency<Queue.ConsumeClient<S>> {
    return this.dependency((queue, g) => queue.grantConsumeMessages(g));
  }

  /**
   * A client with only permission to send messages to this Queue.
   */
  public sendAccess(): Dependency<Queue.SendClient<S>> {
    return this.dependency((queue, g) => queue.grantSendMessages(g));
  }

  private dependency<C>(grant: (queue: sqs.Queue, grantable: iam.IGrantable) => void): Dependency<C> {
    return {
      install: this.resource.map(queue => (ns, grantable) => {
        grant(queue, grantable);
        ns.set('queueUrl', queue.queueUrl);
      }),
      bootstrap: Run.of(async (ns, cache) =>
        new Queue.Client(
          ns.get('queueUrl'),
          cache.getOrCreate('aws:sqs', () => new AWS.SQS()),
          this.mapper) as any)
    };
  }
}

/**
 * Namespace for `Queue` type aliases and its `Client` implementation.
 */
export namespace Queue {
  export interface ConsumeAndSendClient<T extends Shape<any>> extends Client<T> {}
  export interface ConsumeClient<T extends Shape<any>> extends Omit<Client<T>, 'sendMessage' | 'sendMessageBatch'> {}
  export interface SendClient<T extends Shape<any>> extends Omit<Client<T>, 'receiveMessage'> {}

  export interface ReceiveMessageRequest extends Omit<AWS.SQS.ReceiveMessageRequest, 'QueueUrl'> {}
  export type ReceiveMessageResult<T extends Shape<any>> = Array<{Body: RuntimeShape<T>} & Omit<AWS.SQS.Message, 'Body'>>;
  export type SendMessageRequest<T extends Shape<any>> = {MessageBody: RuntimeShape<T>} & Omit<AWS.SQS.SendMessageRequest, 'QueueUrl' | 'MessageBody'>;
  export interface SendMessageResult extends AWS.SQS.SendMessageResult {}

  export interface SendMessageBatchRequestEntry<T extends Shape<any>> extends _SendMessageBatchRequestEntry<T> {}
  type _SendMessageBatchRequestEntry<T extends Shape<any>> = {MessageBody: RuntimeShape<T>} & Omit<AWS.SQS.SendMessageBatchRequestEntry, 'MessageBody'>;

  export interface SendMessageBatchRequest<T extends Shape<any>> extends Array<SendMessageBatchRequestEntry<T>> {}
  export interface SendMessageBatchResult extends AWS.SQS.SendMessageBatchResult {}

  /**
   * Runtime representation of a SQS Queue.
   */
  export class Client<T extends Shape<any>> implements Sink<RuntimeShape<T>> {
    constructor(
      public readonly queueUrl: string,
      public readonly client: AWS.SQS,
      public readonly mapper: Mapper<RuntimeShape<T>, string>
    ) {}

    /**
     * Retrieves one or more messages (up to 10), from the specified queue.
     */
    public async receiveMessage(request?: ReceiveMessageRequest): Promise<ReceiveMessageResult<T>> {
      const response = await this.client.receiveMessage({
        ...(request || {}),
        QueueUrl: this.queueUrl
      }).promise();
      return (response.Messages || []).map(message => ({
        ...message,
        Body: this.mapper.read(message.Body!)
      }));
    }

    /**
     * Delivers a message to the specified queue.
     */
    public sendMessage(request: SendMessageRequest<T>): Promise<SendMessageResult> {
      return this.client.sendMessage({
        QueueUrl: this.queueUrl,
        ...request,
        MessageBody: this.mapper.write(request.MessageBody)
      }).promise();
    }

    /**
     * Delivers a batch of messages to the specified queue.
     */
    public sendMessageBatch(request: SendMessageBatchRequest<T>): Promise<SendMessageBatchResult> {
      return this.client.sendMessageBatch({
        QueueUrl: this.queueUrl,
        Entries: request.map(record => ({
          ...record,
          MessageBody: this.mapper.write(record.MessageBody)
        }))
      }).promise();
    }

    public async sink(records: Array<RuntimeShape<T>>, props?: SinkProps): Promise<void> {
      return sink(records, async values => {
        const batch = values.map((value, i) => ({
          Id: i.toString(10),
          MessageBody: value,
        }));
        const result = await this.sendMessageBatch(batch);

        if (result.Failed) {
          return result.Failed.map(r => values[parseInt(r.Id, 10)]);
        }
        return [];
      }, props, 10);
    }
  }
}
