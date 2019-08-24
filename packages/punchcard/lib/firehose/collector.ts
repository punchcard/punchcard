import core = require('@aws-cdk/core');

import { Collector } from '../core/collector';
import { Dependency } from '../core/dependency';
import { DependencyType, EventType, Stream } from '../core/stream';
import { Function } from '../lambda/function';
import { RuntimeType } from '../shape/shape';
import { Type } from '../shape/types/type';
import { Cons } from '../util/hlist';
import { DeliveryStream, DeliveryStreamDirectPut } from './delivery-stream';

/**
 * Add a utility method `toFirehoseDeliveryStream` for `Stream` which uses the `DeliveryStreamCollector` to collect
 * data to S3 via a Kinesis Firehose Delivery Stream.
 */
declare module '../core/stream' {
  interface Stream<E, T, D extends any[], C extends Stream.Config> {
    /**
     * Collect data to S3 via a Firehose Delivery Stream.
     *
     * @param scope
     * @param id
     * @param s3DeliveryStreamProps properties of the created s3 delivery stream
     * @param runtimeProps optional runtime properties to configure the function processing the stream's data.
     * @typeparam T concrete type of data flowing to s3
     */
    toFirehoseDeliveryStream<T extends Type<T>>(scope: core.Construct, id: string, s3DeliveryStreamProps: DeliveryStreamDirectPut<T>, runtimeProps?: C): CollectedDeliveryStream<T, this>;
  }
}
Stream.prototype.toFirehoseDeliveryStream = function(scope: core.Construct, id: string, props: DeliveryStreamDirectPut<any>): any {
  return this.collect(scope, id, new DeliveryStreamCollector(props));
};

/**
 * Creates a new `DeliveryStream` and publishes data from an stream to it.
 *
 * @typeparam T type of notififcations sent to (and emitted from) the DeliveryStream.
 */
export class DeliveryStreamCollector<T extends Type<any>, S extends Stream<any, RuntimeType<T>, any, any>> implements Collector<CollectedDeliveryStream<T, S>, S> {
  constructor(private readonly props: DeliveryStreamDirectPut<T>) { }

  public collect(scope: core.Construct, id: string, stream: S): CollectedDeliveryStream<T, S> {
    return new CollectedDeliveryStream(scope, id, {
      ...this.props,
      stream
    });
  }
}

/**
 * Properties for creating a collected `DeliveryStream`.
 */
export interface CollectedDeliveryStreamProps<T extends Type<any>, S extends Stream<any, RuntimeType<T>, any, any>> extends DeliveryStreamDirectPut<T> {
  /**
   * Source of the data; an stream.
   */
  readonly stream: S;
}

/**
 * A `DeliveryStream` produced by collecting data from an `Stream`.
 * @typeparam T type of notififcations sent to, and emitted from, the DeliveryStream.
 */
export class CollectedDeliveryStream<T extends Type<any>, S extends Stream<any, any, any, any>> extends DeliveryStream<T> {
  public readonly sender: Function<EventType<S>, void, Dependency.List<Cons<DependencyType<S>, Dependency<DeliveryStream.Client<T>>>>>;

  constructor(scope: core.Construct, id: string, props: CollectedDeliveryStreamProps<T, S>) {
    super(scope, id, props);
    this.sender = props.stream.forBatch(this.resource, 'ToDeliveryStream', {
      depends: this,
      handle: async (events, self) => {
        self.sink(events);
      }
    }) as any;
  }
}
