import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface S3ModuleProps {
  bucketName?: string;
  enableVersioning?: boolean;
  enableLifecycleRules?: boolean;
  retentionDays?: number;
  corsOrigins?: string[];
  enableAccessLogging?: boolean;
  removalPolicy?: cdk.RemovalPolicy;
  importExisting?: boolean; // If true, import existing bucket instead of creating new one
}

export class S3Module extends Construct {
  public readonly customerImagesBucket: s3.IBucket;
  public readonly bucketArn: string;
  public readonly bucketName: string;
  public readonly isImported: boolean;

  constructor(scope: Construct, id: string, props: S3ModuleProps = {}) {
    super(scope, id);

    const bucketName = props.bucketName || 'matsight-customer-images';

    if (props.importExisting) {
      // Import existing bucket
      this.customerImagesBucket = s3.Bucket.fromBucketName(this, 'ImportedBucket', bucketName);
      this.isImported = true;
      console.log(`Importing existing S3 bucket: ${bucketName}`);
    } else {
      // Create new bucket
      this.customerImagesBucket = this.createNewBucket(bucketName, props);
      this.isImported = false;
      console.log(`Creating new S3 bucket: ${bucketName}`);
    }

    this.bucketArn = this.customerImagesBucket.bucketArn;
    this.bucketName = this.customerImagesBucket.bucketName;

    // Only configure additional features if bucket is newly created
    if (!this.isImported) {
      // Enable access logging if requested
      if (props.enableAccessLogging) {
        const accessLogBucket = new s3.Bucket(this, 'AccessLogBucket', {
          bucketName: `${bucketName}-access-logs`,
          removalPolicy: cdk.RemovalPolicy.RETAIN,
          encryption: s3.BucketEncryption.S3_MANAGED,
          blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
          enforceSSL: true,
          lifecycleRules: [
            {
              id: 'LogRetention',
              enabled: true,
              expiration: cdk.Duration.days(90),
              noncurrentVersionExpiration: cdk.Duration.days(30),
            },
          ],
        });

        (this.customerImagesBucket as s3.Bucket).addLifecycleRule({
          id: 'AccessLogging',
          enabled: true,
          transitions: [
            {
              storageClass: s3.StorageClass.INFREQUENT_ACCESS,
              transitionAfter: cdk.Duration.days(30),
            },
            {
              storageClass: s3.StorageClass.GLACIER,
              transitionAfter: cdk.Duration.days(90),
            },
          ],
        });
      }
    }

    // Create IAM managed policy for EC2 instances to access S3
    const s3AccessPolicy = new iam.ManagedPolicy(this, 'S3AccessPolicy', {
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            's3:GetObject',
            's3:PutObject',
            's3:DeleteObject',
            's3:ListBucket',
            's3:GetBucketLocation',
          ],
          resources: [
            this.customerImagesBucket.bucketArn,
            `${this.customerImagesBucket.bucketArn}/*`,
          ],
        }),
      ],
    });

    // Output the policy ARN for attachment to EC2 instances
    new cdk.CfnOutput(this, 'S3AccessPolicyArn', {
      value: s3AccessPolicy.managedPolicyArn,
      description: 'ARN of the S3 access policy for EC2 instances',
    });
  }

  /**
   * Create a new S3 bucket with the specified configuration
   */
  private createNewBucket(bucketName: string, props: S3ModuleProps): s3.Bucket {
    return new s3.Bucket(this, 'CustomerImagesBucket', {
      bucketName,
      versioned: props.enableVersioning ?? true,
      removalPolicy: props.removalPolicy ?? cdk.RemovalPolicy.RETAIN,
      autoDeleteObjects: false,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      cors: props.corsOrigins ? [
        {
          allowedMethods: [
            s3.HttpMethods.GET,
            s3.HttpMethods.PUT,
            s3.HttpMethods.POST,
            s3.HttpMethods.DELETE,
            s3.HttpMethods.HEAD,
          ],
          allowedOrigins: props.corsOrigins,
          allowedHeaders: ['*'],
          exposedHeaders: ['ETag'],
          maxAge: 3000,
        },
      ] : undefined,
      lifecycleRules: props.enableLifecycleRules ? [
        {
          id: 'ImageRetention',
          enabled: true,
          expiration: cdk.Duration.days(props.retentionDays || 365),
          noncurrentVersionExpiration: cdk.Duration.days(30),
          abortIncompleteMultipartUploadAfter: cdk.Duration.days(7),
        },
      ] : undefined,
      accessControl: s3.BucketAccessControl.PRIVATE,
    });
  }

  public grantReadWrite(identity: iam.IGrantable): iam.Grant {
    return this.customerImagesBucket.grantReadWrite(identity);
  }

  public grantRead(identity: iam.IGrantable): iam.Grant {
    return this.customerImagesBucket.grantRead(identity);
  }

  public grantWrite(identity: iam.IGrantable): iam.Grant {
    return this.customerImagesBucket.grantWrite(identity);
  }
}
