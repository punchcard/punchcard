import iam = require('@aws-cdk/aws-iam');
import kinesis = require('@aws-cdk/aws-kinesis');
import lambda = require('@aws-cdk/aws-lambda');
import events = require('@aws-cdk/aws-lambda-event-sources');
import core = require('@aws-cdk/core');
import AWS = require('aws-sdk');
import uuid = require('uuid');

import { Lambda } from '../compute';
import { Clients, Dependency } from '../compute';
import { Cache, Namespace } from '../compute/assembly';
import { Cons } from '../compute/hlist';
import { BufferMapper, Json, Mapper, RuntimeType, Type } from '../shape';
import { Codec } from '../storage';
import { Compression } from '../storage/compression';
import { Collector } from './collector';
import { Firehose } from './firehose';
import { Resource } from './resource';
import { sink, Sink, SinkProps } from './sink';
import { DependencyType, EventType, Stream as SStream } from './stream';

/**
 * Add a utility method `toStream` for `Stream` which uses the `StreamCollector` to produce Kinesis `Streams`.
 */
declare module './stream' {
  interface Stream<E, T, D extends any[], C extends Stream.Config> {
    /**
     * Collect data to a Kinesis Stream.
     *
     * @param scope
     * @param id
     * @param streamProps properties of the created stream
     * @param runtimeProps optional runtime properties to configure the function processing the stream's data.
     * @typeparam T concrete type of data flowing to stream
     */
    toKinesisStream<DataType extends Type<T>>(scope: core.Construct, id: string, streamProps: Kinesis.StreamProps<DataType>, runtimeProps?: C): Kinesis.CollectedStream<DataType, this>;
  }
}
SStream.prototype.toKinesisStream = function(scope: core.Construct, id: string, props: Kinesis.StreamProps<any>): any {
  return this.collect(scope, id, new Kinesis.StreamCollector(props));
};

export namespace Kinesis {
  export type Config = SStream.Config & events.KinesisEventSourceProps;

  export interface StreamProps<T extends Type<any>> extends kinesis.StreamProps {
    /**
     * Type of data in the stream.
     */
    type: T;

    /**
     * @default - uuid
     */
    partitionBy?: (record: RuntimeType<T>) => string;
  }

  /**
   * A Kinesis stream.
   */
  export class Stream<T extends Type<any>> implements Resource<kinesis.Stream>, Dependency<Stream.Client<T>> {
    public readonly type: T;
    public readonly mapper: Mapper<RuntimeType<T>, Buffer>;
    public readonly partitionBy: (record: RuntimeType<T>) => string;
    public readonly resource: kinesis.Stream;

    constructor(scope: core.Construct, id: string, props: StreamProps<T>) {
      this.type = props.type;
      this.resource = new kinesis.Stream(scope, id, props);
      this.mapper = BufferMapper.wrap(Json.forType(props.type));
      this.partitionBy = props.partitionBy || (_ => uuid());
    }

    /**
     * Create an stream for this stream to perform chainable computations (map, flatMap, filter, etc.)
     */
    public stream(): StreamStream<RuntimeType<T>, []> {
      const mapper = this.mapper;
      class Root extends StreamStream<RuntimeType<T>, []> {
        /**
         * Return an iterator of records parsed from the raw data in the event.
         * @param event kinesis event sent to lambda
         */
        public async *run(event: Event) {
          for (const record of event.Records.map(record => mapper.read(Buffer.from(record.kinesis.data, 'base64')))) {
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
     * Forward data in this stream to S3 via a Firehose Delivery Stream.
     *
     * Stream -> Firehose -> S3 (minutely).
     */
    public toS3DeliveryStream(scope: core.Construct, id: string, props: {
      codec: Codec;
      compression: Compression;
    } = {
      codec: Codec.Json,
      compression: Compression.Gzip
    }): Firehose.DeliveryStream<T> {
      return new Firehose.DeliveryStream(scope, id, {
        stream: this,
        codec: props.codec,
        compression: props.compression
      });
    }

    /**
     * Create a client for this `Stream` from within a `Runtime` environment (e.g. a Lambda Function.).
     * @param namespace runtime properties local to this `stream`.
     * @param cache global `Cache` shared by all clients.
     */
    public async bootstrap(namespace: Namespace, cache: Cache): Promise<Stream.Client<T>> {
      return new Stream.Client(this,
        namespace.get('streamName'),
        cache.getOrCreate('aws:kinesis', () => new AWS.Kinesis()));
    }

    /**
     * Set `streamName` and grant permissions to a `Runtime` so it may `bootstrap` a client for this `Stream`.
     */
    public install(namespace: Namespace, grantable: iam.IGrantable): void {
      this.readWriteAccess().install(namespace, grantable);
    }

    /**
     * Read and Write access to this stream.
     */
    public readWriteAccess(): Dependency<Stream.Client<T>> {
      return this._client(g => this.resource.grantReadWrite(g));
    }

    /**
     * Read-only access to this stream.
     */
    public readAccess(): Dependency<Stream.Client<T>> {
      return this._client(g => this.resource.grantRead(g));
    }

    /**
     * Write-only access to this stream.
     */
    public writeAccess(): Dependency<Stream.Client<T>> {
      return this._client(g => this.resource.grantWrite(g));
    }

    private _client(grant: (grantable: iam.IGrantable) => void): Dependency<Stream.Client<T>> {
      return {
        install: (namespace, grantable) => {
          namespace.set('streamName', this.resource.streamName);
          grant(grantable);
        },
        bootstrap: this.bootstrap.bind(this),
      };
    }
  }

  /**
   * An stream Kinesis Stream.
   */
  export class StreamStream<T, D extends any[]> extends SStream<Event, T, D, Config>  {
    constructor(public readonly stream: Stream<any>, previous: StreamStream<any, any>, input: {
      depends: D;
      handle: (value: AsyncIterableIterator<any>, deps: Clients<D>) => AsyncIterableIterator<T>;
    }) {
      super(previous, input.handle, input.depends);
    }

    /**
     * Create a `KinesisEventSource` which attaches a Lambda Function to this Stream.
     * @param props optional tuning properties for the event source.
     */
    public eventSource(props?: Config) {
      return new events.KinesisEventSource(this.stream.resource, props || {
        batchSize: 100,
        startingPosition: lambda.StartingPosition.TRIM_HORIZON
      });
    }

    /**
     * Chain a computation and dependency pair with this computation.
     * @param input the next computation along with its dependencies.
     */
    public chain<U, D2 extends any[]>(input: {
      depends: D2;
      handle: (value: AsyncIterableIterator<T>, deps: Clients<D2>) => AsyncIterableIterator<U>;
    }): StreamStream<U, D2> {
      return new StreamStream<U, D2>(this.stream, this, input);
    }
  }

  export namespace Stream {
    export type PutRecordInput<T> = {Data: T} & Pick<AWS.Kinesis.PutRecordInput, 'ExplicitHashKey' | 'SequenceNumberForOrdering'>;
    export type PutRecordOutput = AWS.Kinesis.PutRecordOutput;
    export type PutRecordsInput<T> = Array<{Data: T} & Pick<AWS.Kinesis.PutRecordsRequestEntry, 'ExplicitHashKey'>>;
    export type PutRecordsOutput = AWS.Kinesis.PutRecordsOutput;

    /**
     * A client to a specific Kinesis Stream of some type, `T`.
     *
     * @typeparam T type of data in the stream.
     * @see https://docs.aws.amazon.com/streams/latest/dev/service-sizes-and-limits.html
     */
    export class Client<T extends Type<any>> implements Sink<RuntimeType<T>> {
      constructor(
        public readonly stream: Stream<T>,
        public readonly streamName: string,
        public readonly client: AWS.Kinesis
      ) {}

      /**
       * Put a single record to the Stream.
       *
       * @param input Data and optional ExplicitHashKey and SequenceNumberForOrdering
       */
      public putRecord(input: PutRecordInput<RuntimeType<T>>): Promise<PutRecordOutput> {
        return this.client.putRecord({
          ...input,
          StreamName: this.streamName,
          Data: this.stream.mapper.write(input.Data),
          PartitionKey: this.stream.partitionBy(input.Data),
        }).promise();
      }

      /**
       * Put a batch of records to the stream.
       *
       * Note: a successful response (no exception) does not ensure that all records were successfully put to the
       * stream; you must check the error code of each record in the response and re-drive those which failed.
       *
       * Maxiumum number of records: 500.
       * Maximum payload size: 1MB (base64-encoded).
       *
       * @param request array of records containing Data and optional `ExplicitHashKey` and `SequenceNumberForOrdering`.
       * @returns output containing sequence numbers of successful records and error codes of failed records.
       * @see https://docs.aws.amazon.com/streams/latest/dev/service-sizes-and-limits.html
       */
      public putRecords(request: PutRecordsInput<RuntimeType<T>>): Promise<PutRecordsOutput> {
        return this.client.putRecords({
          StreamName: this.streamName,
          Records: request.map(record => ({
            ...record,
            Data: this.stream.mapper.write(record.Data),
            PartitionKey: this.stream.partitionBy(record.Data)
          }))
        }).promise();
      }

      /**
       * Put all records (accounting for request limits of Kinesis) by batching all records into
       * optimal `putRecords` calls; failed records will be redriven, and intermittent failures
       * will be handled with back-offs and retry attempts.
       *
       * TODO: account for total payload size of 1MB base64-encoded.
       *
       * @param records array of records to 'sink' to the stream.
       * @param props configure retry and ordering behavior
       */
      public async sink(records: Array<RuntimeType<T>>, props?: SinkProps): Promise<void> {
        await sink(records, async values => {
          const result = await this.putRecords(values.map(value => ({
            Data: value
          })));

          if (result.FailedRecordCount) {
            return result.Records.map((r, i) => {
              if (r.SequenceNumber) {
                return [i];
              } else {
                return [];
              }
            }).reduce((a, b) => a.concat(b)).map(i => values[i]);
          }
          return [];
        }, props, 500);
      }
    }
  }

  /**
   * Payload sent to Lambda Function subscribed to a Kinesis Stream.
   *
   * @see https://docs.aws.amazon.com/lambda/latest/dg/with-kinesis.html
   */
  export interface Event {
    Records: Array<{
      kinesis: {
        kinesisSchemaVersion: string;
        partitionKey: string;
        sequenceNumber: string;
        data: string;
        approximateArrivalTimestamp: number;
      };
      eventSource: string;
      eventVersion: string;
      eventID: string;
      eventName: string;
      invokeIdentityArn: string;
      awsRegion: string;
      eventSourceARN: string;
    }>;
  }

  /**
   * Creates a new Kineis stream and sends data from an stream to it.
   */
  export class StreamCollector<T extends Type<any>, S extends SStream<any, RuntimeType<T>, any, any>> implements Collector<CollectedStream<T, S>, S> {
    constructor(private readonly props: StreamProps<T>) { }

    public collect(scope: core.Construct, id: string, stream: S): CollectedStream<T, S> {
      return new CollectedStream(scope, id, {
        ...this.props,
        stream
      });
    }
  }

  /**
   * Properties for creating a collected stream.
   */
  export interface CollectedStreamProps<T extends Type<any>, S extends SStream<any, RuntimeType<T>, any, any>> extends StreamProps<T> {
    /**
     * Source of the data; an stream.
     */
    readonly stream: S;
  }
  /**
   * A Kinesis `Stream` produced by collecting data from an `Stream`.
   */
  export class CollectedStream<T extends Type<any>, S extends SStream<any, any, any, any>> extends Stream<T> {
    public readonly sender: Lambda.Function<EventType<S>, void, Dependency.List<Cons<DependencyType<S>, Dependency<Stream.Client<T>>>>>;

    constructor(scope: core.Construct, id: string, props: CollectedStreamProps<T, S>) {
      super(scope, id, props);
      this.sender = props.stream.forBatch(this.resource, 'ToStream', {
        depends: this.writeAccess(),
        handle: async (events, self) => {
          self.sink(events);
        }
      }) as any;
    }
  }
}
