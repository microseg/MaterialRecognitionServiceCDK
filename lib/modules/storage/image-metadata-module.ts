import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export interface ImageMetadataModuleProps {
  tableName: string;
  billingMode?: 'PAY_PER_REQUEST' | 'PROVISIONED';
  readCapacity?: number;
  writeCapacity?: number;
  enablePointInTimeRecovery?: boolean;
}

export class ImageMetadataModule extends Construct {
  public readonly customerImagesTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props: ImageMetadataModuleProps) {
    super(scope, id);

    const {
      tableName,
      billingMode = 'PAY_PER_REQUEST',
      readCapacity = 5,
      writeCapacity = 5,
      enablePointInTimeRecovery = true
    } = props;

    // Create DynamoDB Table for tracking customer images
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
    };

    // Add provisioned capacity for production
    if (billingMode === 'PROVISIONED') {
      (tableProps as any).readCapacity = readCapacity;
      (tableProps as any).writeCapacity = writeCapacity;
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

    // Add tags for better resource management
    cdk.Tags.of(this.customerImagesTable).add('Project', 'MaterialRecognitionService');
    cdk.Tags.of(this.customerImagesTable).add('Purpose', 'ImageMetadata');
    cdk.Tags.of(this.customerImagesTable).add('Module', 'ImageMetadata');
  }
}
