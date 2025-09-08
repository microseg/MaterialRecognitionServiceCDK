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
  importExisting?: boolean; // If true, import existing table instead of creating new one
}

export class DynamoDBModule extends Construct {
  public readonly customerImagesTable: dynamodb.ITable;
  public readonly tableArn: string;
  public readonly tableName: string;
  public readonly isImported: boolean;

  constructor(scope: Construct, id: string, props: DynamoDBModuleProps = {}) {
    super(scope, id);

    const tableName = props.tableName || 'CustomerImages';

    if (props.importExisting) {
      console.log(`Importing existing DynamoDB table: ${tableName}`);
      this.customerImagesTable = dynamodb.Table.fromTableName(this, 'ImportedCustomerImagesTable', tableName);
      this.isImported = true;
    } else {
      // Create new table
      this.customerImagesTable = this.createNewTable(tableName, props);
      this.isImported = false;
      console.log(`Creating new DynamoDB table: ${tableName}`);
    }

    this.tableArn = this.customerImagesTable.tableArn;
    this.tableName = this.customerImagesTable.tableName;

    // Only configure additional features if table is newly created
    if (!this.isImported) {
      // Add Global Secondary Indexes for efficient querying
      (this.customerImagesTable as dynamodb.Table).addGlobalSecondaryIndex({
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

      (this.customerImagesTable as dynamodb.Table).addGlobalSecondaryIndex({
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

      (this.customerImagesTable as dynamodb.Table).addGlobalSecondaryIndex({
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
        const readScaling = (this.customerImagesTable as dynamodb.Table).autoScaleReadCapacity({
          minCapacity: props.minCapacity ?? 1,
          maxCapacity: props.maxCapacity ?? 100,
        });

        const writeScaling = (this.customerImagesTable as dynamodb.Table).autoScaleWriteCapacity({
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
    }

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

  /**
   * Create a new DynamoDB table with the specified configuration
   */
  private createNewTable(tableName: string, props: DynamoDBModuleProps): dynamodb.Table {
    return new dynamodb.Table(this, 'CustomerImagesTable', {
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
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      stream: props.enableStreaming ? dynamodb.StreamViewType.NEW_AND_OLD_IMAGES : undefined,
      timeToLiveAttribute: 'expiresAt',
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
