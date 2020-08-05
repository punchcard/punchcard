import iam = require("@aws-cdk/aws-iam");
import kinesis = require("@aws-cdk/aws-kinesis");
import firehose = require("@aws-cdk/aws-kinesisfirehose");
import kms = require("@aws-cdk/aws-kms");
import lambda = require("@aws-cdk/aws-lambda");
import logs = require("@aws-cdk/aws-logs");
import s3 = require("@aws-cdk/aws-s3");
import core = require("@aws-cdk/core");

export enum CompressionType {
  UNCOMPRESSED = "UNCOMPRESSED",
  GZIP = "GZIP",
  ZIP = "ZIP",
  Snappy = "Snappy"
}

export interface IDeliveryStream extends core.IConstruct {
  readonly deliveryStreamArn: string;
  readonly deliveryStreamName: string;
}

export abstract class BaseDeliveryStream extends core.Resource implements logs.ILogSubscriptionDestination {
  /**
   * The ARN of the delivery stream.
   */
  public abstract readonly deliveryStreamArn: string;

  /**
   * The name of the delivery stream
   */
  public abstract readonly deliveryStreamName: string;

  /**
   * Optional KMS encryption key associated with this delivery stream.
   */
  public abstract readonly encryptionKey?: kms.Key;

  /**
   * The role that can be used by CloudWatch logs to write to this delivery stream
   */
  protected cloudWatchLogsRole?: iam.Role;

  /**
   * The destination s3 bucket if type is S3
   */
  public s3Bucket?: s3.Bucket;

  public grantWrite(grantable: iam.IGrantable) {
    grantable.grantPrincipal.addToPolicy(new iam.PolicyStatement({
      actions: ['firehose:PutRecord', 'firehose:PutRecordBatch'],
      resources: [this.deliveryStreamArn]
    }));
  }
  public bind(scope: core.Construct, sourceLogGroup: logs.ILogGroup): logs.LogSubscriptionDestinationConfig {
    // Following example from https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/SubscriptionFilters.html#DestinationKinesisExample
    if (!this.cloudWatchLogsRole) {
      // Create a role to be assumed by CWL that can write to this stream and pass itself.
      this.cloudWatchLogsRole = new iam.Role(this, 'CloudWatchLogsCanPutRecords', {
        assumedBy: new iam.ServicePrincipal(core.Fn.join('', ['logs.', this.stack.region, '.amazonaws.com']).toString()),
      });
      this.cloudWatchLogsRole.addToPolicy(new iam.PolicyStatement({
        actions: ['firehose:Put*'],
        resources: [this.deliveryStreamArn]
      }));
      this.cloudWatchLogsRole.addToPolicy(new iam.PolicyStatement({
        actions: ['iam:PassRole'],
        resources: [this.cloudWatchLogsRole.roleArn]
      }));
    }

    // We've now made it possible for CloudWatch events to write to us. In case the LogGroup is in a
    // different account, we must add a Destination in between as well.
    const sourceStack = sourceLogGroup.stack;
    const thisStack = this.stack;

    // Case considered: if both accounts are undefined, we can't make any assumptions. Better
    // to assume we don't need to do anything special.
    const sameAccount = sourceStack.account === thisStack.account;

    if (!sameAccount) {
      throw new Error('cross account not supported yet');
      // return this.crossAccountLogSubscriptionDestination(sourceLogGroup);
    }

    return { arn: this.deliveryStreamArn, role: this.cloudWatchLogsRole };
  }
}

export interface DeliveryStreamProps {
  type: DeliveryStreamType,
  kinesisStream?: kinesis.Stream;
  destination: DeliveryStreamDestination
  s3Bucket?: s3.Bucket;
  s3Prefix?: string;
  compression?: CompressionType;
  transformFunction?: lambda.Function;
}

export class DeliveryStream extends BaseDeliveryStream {
  public readonly deliveryStreamArn: string;
  public readonly deliveryStreamName: string;
  public readonly encryptionKey: kms.Key;
  private readonly role: iam.Role;
  private readonly deliveryStreamResource: firehose.CfnDeliveryStream;

  constructor(parent: core.Construct, name: string, props: DeliveryStreamProps) {
    super(parent, name);
    this.role = new iam.Role(this, "KinesisRole", {
      assumedBy: new iam.ServicePrincipal("firehose.amazonaws.com")
    });

    if (props.destination !== DeliveryStreamDestination.S3) {
      throw new Error("currently only supports S3 destination");
    }

    this.deliveryStreamResource = new firehose.CfnDeliveryStream(this, "DeliveryStream", {
      deliveryStreamType: props.type,

      kinesisStreamSourceConfiguration: this.makeKinesisSourceConfig(props),

      elasticsearchDestinationConfiguration: this.makeElasticSearchConfig(props),
      extendedS3DestinationConfiguration: this.makeS3Config(props),
      redshiftDestinationConfiguration: this.makeRedshiftConfig(props),
      splunkDestinationConfiguration: this.makeSplunkSearchConfig(props)

    });
    this.deliveryStreamResource.node.addDependency(this.role);

    this.deliveryStreamName = this.deliveryStreamResource.ref;
    this.deliveryStreamArn = this.deliveryStreamResource.getAtt('Arn').toString();
  }

  private makeKinesisSourceConfig(props: DeliveryStreamProps): firehose.CfnDeliveryStream.KinesisStreamSourceConfigurationProperty {
    if (props.type === DeliveryStreamType.KinesisStreamAsSource) {
      if (props.kinesisStream) {
        props.kinesisStream.grantRead(this.role);
        props.kinesisStream.grant(this.role, 'kinesis:DescribeStream');

        return {
          kinesisStreamArn: props.kinesisStream.streamArn,
          roleArn: this.role.roleArn
        };
      } else {
        throw new Error("must provide a Kinesis stream if type is 'KinesisStreamAsSource'");
      }
    } else {
      return undefined as any;
    }
  }

  private makeS3Config(props: DeliveryStreamProps): firehose.CfnDeliveryStream.ExtendedS3DestinationConfigurationProperty {
    if (props.destination === DeliveryStreamDestination.S3) {
      if (props.s3Bucket) {
        this.s3Bucket = props.s3Bucket;
      } else {
        this.s3Bucket = new s3.Bucket(this, "Bucket");
      }
      this.s3Bucket.grantReadWrite(this.role);
      if (props.kinesisStream) {
        props.kinesisStream.grantRead(this.role); // TODO: why do we need this
      }

      return {
        bucketArn: this.s3Bucket.bucketArn,
        bufferingHints: {
          intervalInSeconds: 60,
          sizeInMBs: 64
        },
        compressionFormat: props.compression || CompressionType.UNCOMPRESSED,
        prefix: props.s3Prefix || "",
        roleArn: this.role.roleArn,
        processingConfiguration: this.makeProcessorConfig(props)
      };
    } else {
      return undefined as any;
    }
  }

  private makeProcessorConfig(props: DeliveryStreamProps): firehose.CfnDeliveryStream.ProcessingConfigurationProperty {
    if (props.transformFunction) {
      this.role.addToPolicy(new iam.PolicyStatement({
        actions: ['lambda:InvokeFunction'],
        resources: [props.transformFunction.functionArn]
      }));

      return {
        enabled: true,
        processors: [{
          type: ProcessorType.Lambda,
          parameters: [{
            parameterName: "LambdaArn",
            parameterValue: props.transformFunction.functionArn
          }, {
            parameterName: "NumberOfRetries",
            parameterValue: "3"
          }]
        }]
      };
    } else {
      return undefined as any;
    }
  }

  private makeElasticSearchConfig(props: DeliveryStreamProps): firehose.CfnDeliveryStream.ElasticsearchDestinationConfigurationProperty {
    if (props.destination === DeliveryStreamDestination.ElasticSearch) {
      // TODO:
      throw new Error("ElasticSearch is not yet supported");
    } else {
      return undefined as any;
    }
  }

  private makeRedshiftConfig(props: DeliveryStreamProps): firehose.CfnDeliveryStream.RedshiftDestinationConfigurationProperty {
    if (props.destination === DeliveryStreamDestination.Redshift) {
      // TODO:
      throw new Error("Redshift is not yet supported");
    } else {
      return undefined as any;
    }
  }

  private makeSplunkSearchConfig(props: DeliveryStreamProps): firehose.CfnDeliveryStream.SplunkDestinationConfigurationProperty {
    if (props.destination === DeliveryStreamDestination.Splunk) {
      // TODO:
      throw new Error("Splunk is not yet supported");
    } else {
      return undefined as any;
    }
  }
}

export enum DeliveryStreamType {
  DirectPut = "DirectPut",
  KinesisStreamAsSource = "KinesisStreamAsSource"
}

export enum DeliveryStreamDestination {
  ElasticSearch,
  Redshift,
  Splunk,
  S3
}

export enum ProcessorType {
  Lambda = "Lambda"
}
