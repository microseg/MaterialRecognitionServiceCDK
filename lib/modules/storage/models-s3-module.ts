import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface ModelsS3ModuleProps {
  bucketName?: string;
  versioned?: boolean;
  lifecycleRules?: s3.LifecycleRule[];
  corsRules?: s3.CorsRule[];
  accessLogging?: boolean;
  encryption?: s3.BucketEncryption;
  publicReadAccess?: boolean;
  blockPublicAccess?: s3.BlockPublicAccess;
  importExisting?: boolean; // If true, import existing bucket instead of creating new one
}

export class ModelsS3Module extends Construct {
  public readonly bucket: s3.IBucket;
  public readonly accessPolicy: iam.ManagedPolicy;
  public readonly isImported: boolean;

  constructor(scope: Construct, id: string, props: ModelsS3ModuleProps = {}) {
    super(scope, id);

    const bucketName = props.bucketName || 'matsight-maskterial-models';

    if (props.importExisting) {
      // Import existing bucket
      this.bucket = s3.Bucket.fromBucketName(this, 'ImportedModelsBucket', bucketName);
      this.isImported = true;
      console.log(`Importing existing Models S3 bucket: ${bucketName}`);
    } else {
      // Create new bucket
      this.bucket = new s3.Bucket(this, 'ModelsBucket', {
        bucketName,
        versioned: props.versioned ?? true,
        encryption: props.encryption ?? s3.BucketEncryption.S3_MANAGED,
        blockPublicAccess: props.blockPublicAccess ?? s3.BlockPublicAccess.BLOCK_ALL,
        publicReadAccess: props.publicReadAccess ?? false,
        cors: props.corsRules ?? [
          {
            allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.HEAD],
            allowedOrigins: ['*'],
            allowedHeaders: ['*'],
            maxAge: 3000,
          },
        ],
        lifecycleRules: props.lifecycleRules ?? [
          {
            id: 'DeleteOldVersions',
            noncurrentVersionExpiration: cdk.Duration.days(30),
            noncurrentVersionTransitions: [
              {
                storageClass: s3.StorageClass.INFREQUENT_ACCESS,
                transitionAfter: cdk.Duration.days(7),
              },
            ],
          },
        ],
        removalPolicy: cdk.RemovalPolicy.RETAIN,
        autoDeleteObjects: false,
      });
      this.isImported = false;
      console.log(`Creating new Models S3 bucket: ${bucketName}`);
    }

    // Create IAM policy for EC2 instances to access the models bucket
    this.accessPolicy = new iam.ManagedPolicy(this, 'ModelsBucketAccessPolicy', {
      managedPolicyName: `${bucketName}-access-policy`,
      description: 'Policy for EC2 instances to access MaskTerial models S3 bucket',
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            's3:GetObject',
            's3:GetObjectVersion',
            's3:ListBucket',
            's3:GetBucketLocation',
          ],
          resources: [
            this.bucket.bucketArn,
            `${this.bucket.bucketArn}/*`,
          ],
        }),
      ],
    });

    // Output the bucket name
    new cdk.CfnOutput(this, 'ModelsBucketName', {
      value: this.bucket.bucketName,
      description: 'Name of the S3 bucket containing MaskTerial models',
      exportName: `${cdk.Stack.of(this).stackName}-ModelsBucketName`,
    });

    // Output the bucket ARN
    new cdk.CfnOutput(this, 'ModelsBucketArn', {
      value: this.bucket.bucketArn,
      description: 'ARN of the S3 bucket containing MaskTerial models',
      exportName: `${cdk.Stack.of(this).stackName}-ModelsBucketArn`,
    });
  }

  /**
   * Grant read access to the models bucket
   */
  public grantReadAccess(grantee: iam.IGrantable): iam.Grant {
    return this.bucket.grantRead(grantee);
  }

  /**
   * Grant read-write access to the models bucket
   */
  public grantReadWriteAccess(grantee: iam.IGrantable): iam.Grant {
    return this.bucket.grantReadWrite(grantee);
  }

  /**
   * Grant write access to the models bucket
   */
  public grantWriteAccess(grantee: iam.IGrantable): iam.Grant {
    return this.bucket.grantWrite(grantee);
  }
}
