import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface DynamoDBModuleProps {
  tableName: string;
  billingMode?: 'PAY_PER_REQUEST' | 'PROVISIONED';
  readCapacity?: number;
  writeCapacity?: number;
  enablePointInTimeRecovery?: boolean;
  enableAutoScaling?: boolean;
  minCapacity?: number;
  maxCapacity?: number;
  enableStreaming?: boolean;
  streamViewType?: dynamodb.StreamViewType;
}

export class DynamoDBModule extends Construct {
  public readonly customerImagesTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props: DynamoDBModuleProps) {
    super(scope, id);

    const {
      tableName,
      billingMode = 'PAY_PER_REQUEST',
      readCapacity = 5,
      writeCapacity = 5,
      enablePointInTimeRecovery = true,
      enableAutoScaling = true,
      minCapacity = 1,
      maxCapacity = 100,
      enableStreaming = false,
      streamViewType = dynamodb.StreamViewType.NEW_AND_OLD_IMAGES
    } = props;

    // Create DynamoDB Table for tracking customer images with enhanced schema
    const tableProps: dynamodb.TableProps = {
      tableName: tableName,
      partitionKey: {
        name: 'customerID',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'imageID',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: billingMode === 'PROVISIONED'
        ? dynamodb.BillingMode.PROVISIONED
        : dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      pointInTimeRecovery: enablePointInTimeRecovery,
      timeToLiveAttribute: 'expiresAt',
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
    };

    // Add provisioned capacity for production
    if (billingMode === 'PROVISIONED') {
      (tableProps as any).readCapacity = readCapacity;
      (tableProps as any).writeCapacity = writeCapacity;
    }

    // Add streaming if enabled
    if (enableStreaming) {
      (tableProps as any).stream = streamViewType;
    }

    this.customerImagesTable = new dynamodb.Table(this, 'CustomerImagesTable', tableProps);

    // Add GSI for querying by type and status
    this.customerImagesTable.addGlobalSecondaryIndex({
      indexName: 'TypeStatusIndex',
      partitionKey: {
        name: 'type',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'status',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Add GSI for querying by creation time
    this.customerImagesTable.addGlobalSecondaryIndex({
      indexName: 'CreatedAtIndex',
      partitionKey: {
        name: 'customerID',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'createdAt',
        type: dynamodb.AttributeType.NUMBER,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Add GSI for querying by material type
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

    // Add GSI for querying by processing status
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

    // Add GSI for querying by image format
    this.customerImagesTable.addGlobalSecondaryIndex({
      indexName: 'ImageFormatIndex',
      partitionKey: {
        name: 'imageFormat',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'createdAt',
        type: dynamodb.AttributeType.NUMBER,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Configure auto-scaling for GSIs
    if (enableAutoScaling) {
      // Auto-scaling for main table
      const readScaling = this.customerImagesTable.autoScaleReadCapacity({
        minCapacity: minCapacity,
        maxCapacity: maxCapacity,
      });

      const writeScaling = this.customerImagesTable.autoScaleWriteCapacity({
        minCapacity: minCapacity,
        maxCapacity: maxCapacity,
      });

      readScaling.scaleOnUtilization({
        targetUtilizationPercent: 70,
      });

      writeScaling.scaleOnUtilization({
        targetUtilizationPercent: 70,
      });

      // Auto-scaling for GSIs
      const gsiNames = ['TypeStatusIndex', 'CreatedAtIndex', 'MaterialTypeIndex', 'ProcessingStatusIndex', 'ImageFormatIndex'];
      
      gsiNames.forEach(gsiName => {
        const gsiReadScaling = this.customerImagesTable.autoScaleGlobalSecondaryIndexReadCapacity(gsiName, {
          minCapacity: minCapacity,
          maxCapacity: maxCapacity,
        });

        const gsiWriteScaling = this.customerImagesTable.autoScaleGlobalSecondaryIndexWriteCapacity(gsiName, {
          minCapacity: minCapacity,
          maxCapacity: maxCapacity,
        });

        gsiReadScaling.scaleOnUtilization({
          targetUtilizationPercent: 70,
        });

        gsiWriteScaling.scaleOnUtilization({
          targetUtilizationPercent: 70,
        });
      });
    }
  }

  /**
   * Grant read permissions to the specified grantee
   */
  public grantReadData(grantee: iam.IGrantable): iam.Grant {
    return this.customerImagesTable.grantReadData(grantee);
  }

  /**
   * Grant write permissions to the specified grantee
   */
  public grantWriteData(grantee: iam.IGrantable): iam.Grant {
    return this.customerImagesTable.grantWriteData(grantee);
  }

  /**
   * Grant read/write permissions to the specified grantee
   */
  public grantReadWriteData(grantee: iam.IGrantable): iam.Grant {
    return this.customerImagesTable.grantReadWriteData(grantee);
  }

  /**
   * Grant full access permissions to the specified grantee
   */
  public grantFullAccess(grantee: iam.IGrantable): iam.Grant {
    return this.customerImagesTable.grantFullAccess(grantee);
  }
}
