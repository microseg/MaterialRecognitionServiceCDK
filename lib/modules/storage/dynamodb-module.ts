import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface DynamoDBModuleProps {
  tableName?: string;
  billingMode?: dynamodb.BillingMode;
  enablePointInTimeRecovery?: boolean;
  enableAutoScaling?: boolean;
  minCapacity?: number;
  maxCapacity?: number;
  enableStreaming?: boolean;
  removalPolicy?: cdk.RemovalPolicy;
}

export class DynamoDBModule extends Construct {
  public readonly customerImagesTable: dynamodb.Table;
  public readonly tableArn: string;
  public readonly tableName: string;

  constructor(scope: Construct, id: string, props: DynamoDBModuleProps = {}) {
    super(scope, id);

    const tableName = props.tableName || 'CustomerImages';

    // Create DynamoDB table for customer image metadata
    this.customerImagesTable = new dynamodb.Table(this, 'CustomerImagesTable', {
      tableName,
      partitionKey: {
        name: 'customerID',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'imageID',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: props.billingMode ?? dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: props.enablePointInTimeRecovery ?? true,
      removalPolicy: props.removalPolicy ?? cdk.RemovalPolicy.RETAIN,
      stream: props.enableStreaming ? dynamodb.StreamViewType.NEW_AND_OLD_IMAGES : undefined,
      timeToLiveAttribute: 'expiresAt',
    });

    // Add Global Secondary Indexes for efficient querying
    this.customerImagesTable.addGlobalSecondaryIndex({
      indexName: 'ProcessingStatusIndex',
      partitionKey: {
        name: 'processingStatus',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'createdAt',
        type: dynamodb.AttributeType.NUMBER,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    this.customerImagesTable.addGlobalSecondaryIndex({
      indexName: 'MaterialTypeIndex',
      partitionKey: {
        name: 'materialType',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'createdAt',
        type: dynamodb.AttributeType.NUMBER,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    this.customerImagesTable.addGlobalSecondaryIndex({
      indexName: 'TypeIndex',
      partitionKey: {
        name: 'type',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'createdAt',
        type: dynamodb.AttributeType.NUMBER,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Configure auto-scaling if enabled and using provisioned billing
    if (props.enableAutoScaling && props.billingMode === dynamodb.BillingMode.PROVISIONED) {
      const readScaling = this.customerImagesTable.autoScaleReadCapacity({
        minCapacity: props.minCapacity ?? 1,
        maxCapacity: props.maxCapacity ?? 100,
      });

      const writeScaling = this.customerImagesTable.autoScaleWriteCapacity({
        minCapacity: props.minCapacity ?? 1,
        maxCapacity: props.maxCapacity ?? 100,
      });

      // Add scaling policies
      readScaling.scaleOnUtilization({
        targetUtilizationPercent: 70,
      });

      writeScaling.scaleOnUtilization({
        targetUtilizationPercent: 70,
      });
    }

    this.tableArn = this.customerImagesTable.tableArn;
    this.tableName = this.customerImagesTable.tableName;

    // Create IAM managed policy for EC2 instances to access DynamoDB
    const dynamoDBAccessPolicy = new iam.ManagedPolicy(this, 'DynamoDBAccessPolicy', {
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            'dynamodb:GetItem',
            'dynamodb:PutItem',
            'dynamodb:UpdateItem',
            'dynamodb:DeleteItem',
            'dynamodb:Query',
            'dynamodb:Scan',
            'dynamodb:BatchGetItem',
            'dynamodb:BatchWriteItem',
            'dynamodb:DescribeTable',
          ],
          resources: [
            this.customerImagesTable.tableArn,
            `${this.customerImagesTable.tableArn}/index/*`,
          ],
        }),
      ],
    });

    // Output the policy ARN for attachment to EC2 instances
    new cdk.CfnOutput(this, 'DynamoDBAccessPolicyArn', {
      value: dynamoDBAccessPolicy.managedPolicyArn,
      description: 'ARN of the DynamoDB access policy for EC2 instances',
    });
  }

  public grantReadWriteData(identity: iam.IGrantable): iam.Grant {
    return this.customerImagesTable.grantReadWriteData(identity);
  }

  public grantReadData(identity: iam.IGrantable): iam.Grant {
    return this.customerImagesTable.grantReadData(identity);
  }

  public grantWriteData(identity: iam.IGrantable): iam.Grant {
    return this.customerImagesTable.grantWriteData(identity);
  }

  public grantFullAccess(identity: iam.IGrantable): iam.Grant {
    return this.customerImagesTable.grantFullAccess(identity);
  }
}
