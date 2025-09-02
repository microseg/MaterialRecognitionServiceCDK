# MaterialRecognitionService Storage Solution

## Overview

This storage solution provides complete image storage and management infrastructure for MaterialRecognitionService, including S3 buckets for storing image files and DynamoDB tables for storing image metadata.

## Architecture Design

### Storage Structure

```
s3://matsight-customer-images/
├── {customerID}/
│   ├── uploaded/
│   │   ├── {imageID}_original.jpg      # Original images uploaded by users
│   │   └── {imageID}_thumbnail.jpg     # Thumbnails of original images
│   └── saved-result/
│       ├── {imageID}_saved.jpg         # Recognition result images
│       └── {imageID}_thumbnail.jpg     # Thumbnails of result images
```

### Data Model

**DynamoDB Table: CustomerImages**

| Field | Type | Description |
|-------|------|-------------|
| customerID | String | Partition Key - Customer identifier |
| imageID | String | Sort Key - Unique image identifier |
| createdAt | Number | Creation timestamp |
| type | String | Image type: "UPLOADED" or "SAVED_RESULT" |
| s3Key | String | Full S3 path |
| thumbnailKey | String | Thumbnail S3 path |
| status | String | Status: "active" or "deleted" |
| materialType | String | Primary material type |
| imageSize | Number | Image size in bytes |
| imageFormat | String | Image format (jpg, png, etc.) |
| processingStatus | String | "pending", "processing", "completed", "failed" |
| metadata | Object | Extended metadata object |
| expiresAt | Number | TTL expiration timestamp |

**Metadata Object Structure:**
```json
{
  "width": "number",
  "height": "number", 
  "uploadSource": "string",       // "web", "mobile", "api"
  "originalFilename": "string",
  "material": "string"
}
```

## Module Components

### 1. S3 Module (`s3-module.ts`)
- Create and manage S3 buckets
- Configure lifecycle rules
- Set access control and encryption
- Provide permission management methods

### 2. DynamoDB Module (`dynamodb-module.ts`)
- Create and manage DynamoDB tables
- Configure Global Secondary Indexes (GSI)
- Set up auto-scaling
- Provide data access methods

### 3. Storage Utilities (`storage-utils.ts`)
- S3 path generation tools
- Metadata creation and validation
- Presigned URL generation
- Image ID generation and parsing

## Deployment Guide

### 1. Basic Deployment

```bash
# Deploy with default configuration
cdk deploy

# View deployment outputs
cdk deploy --outputs-file outputs.json
```

### 2. Custom Configuration Deployment

```bash
# Specify custom configuration
cdk deploy \
  --context s3BucketName=matsight-customer-images-prod \
  --context dynamoDBTableName=CustomerImagesProd \
  --context enableStorageAutoScaling=true
```

### 3. Environment Variable Configuration

Create `.env` file:

```env
# Storage configuration
S3_BUCKET_NAME=matsight-customer-images
DYNAMODB_TABLE_NAME=CustomerImages
ENABLE_STORAGE_AUTO_SCALING=true
```

## Usage Examples

### 1. Upload Images

```typescript
import { StorageUtils } from './storage-utils';

// Generate image ID and S3 keys
const imageID = StorageUtils.generateImageID('UPLOADED');
const originalKey = StorageUtils.getOriginalImageKey(customerID, imageID);
```

### 2. Create Enhanced Metadata

```typescript
// Create image metadata with enhanced fields
const metadata = StorageUtils.createImageMetadata(
  customerID,
  imageID,
  'UPLOADED',
  {
    materialType: 'graphene',
    imageSize: 1024000,
    imageFormat: 'jpg',
    processingStatus: 'pending',
    width: 1920,
    height: 1080,
    uploadSource: 'web',
    originalFilename: 'sample_image.jpg',
    ttlDays: 365
  }
);
```

### 3. Generate Presigned URLs

```typescript
// Generate presigned URL for secure access
const presignedUrl = await StorageUtils.generatePresignedUrl(
  'getObject',
  s3Key,
  3600 // Expires in 1 hour
);
```

## Configuration Options

### S3 Module Configuration

```typescript
const s3Module = new S3Module(this, 'S3Module', {
  bucketName: 'matsight-customer-images',
  enableVersioning: true,
  enableLifecycleRules: true,
  retentionDays: 365,
  corsOrigins: ['*'],
  enableAccessLogging: true,
});
```

### DynamoDB Module Configuration

```typescript
const dynamoDBModule = new DynamoDBModule(this, 'DynamoDBModule', {
  tableName: 'CustomerImages',
  billingMode: 'PAY_PER_REQUEST',
  enablePointInTimeRecovery: true,
  enableAutoScaling: true,
  minCapacity: 1,
  maxCapacity: 100,
  enableStreaming: false,
});
```

## Security Features

### S3 Security
- Server-side encryption (SSE-S3)
- Block public access
- CORS configuration
- Lifecycle policies for cost optimization
- Access logging

### DynamoDB Security
- Encryption at rest
- Point-in-time recovery
- TTL for automatic data cleanup
- IAM-based access control
- Global Secondary Indexes for efficient queries

## Cost Optimization

### S3 Cost Optimization
- Lifecycle rules for automatic storage class transitions
- Intelligent Tiering for automatic cost optimization
- Multipart upload cleanup
- Version management

### DynamoDB Cost Optimization
- Pay-per-request billing for development
- Auto-scaling for production workloads
- TTL for automatic data deletion
- Efficient query patterns using GSIs

## Monitoring and Logging

### S3 Monitoring
- Access logs for audit trails
- CloudTrail integration
- S3 Storage Lens for cost analysis
- Event notifications

### DynamoDB Monitoring
- CloudWatch metrics
- DynamoDB Streams for change tracking
- Backup and restore capabilities
- Performance insights

## Best Practices

### 1. Naming Conventions
- Use consistent naming for S3 keys
- Include customer ID in paths for isolation
- Use descriptive image IDs with timestamps

### 2. Error Handling
- Implement retry logic for AWS API calls
- Use exponential backoff for transient failures
- Log errors with sufficient context

### 3. Performance Optimization
- Use batch operations for multiple items
- Implement caching for frequently accessed data
- Use appropriate DynamoDB capacity modes

### 4. Security Best Practices
- Use least privilege access policies
- Encrypt data in transit and at rest
- Regularly rotate access keys
- Monitor access patterns

## Troubleshooting

### Common Issues

1. **Permission Denied Errors**
   - Check IAM policies
   - Verify resource ARNs
   - Ensure proper role assignments

2. **Storage Class Transition Issues**
   - Verify lifecycle rule configurations
   - Check object age requirements
   - Monitor transition status

3. **DynamoDB Capacity Issues**
   - Monitor read/write capacity utilization
   - Adjust auto-scaling parameters
   - Consider switching billing modes

### Debug Commands

```bash
# Check S3 bucket status
aws s3 ls s3://matsight-customer-images/

# Verify DynamoDB table
aws dynamodb describe-table --table-name CustomerImages

# Check CloudFormation outputs
cdk deploy --outputs-file outputs.json
```

## Integration with Application

### Environment Variables

Set these environment variables in your application:

```bash
export S3_BUCKET_NAME=matsight-customer-images
export DYNAMODB_TABLE_NAME=CustomerImages
export AWS_REGION=us-east-1
```

### AWS SDK Usage

```python
import boto3
import os

# Initialize clients
s3_client = boto3.client('s3')
dynamodb = boto3.resource('dynamodb')

# Use environment variables
bucket_name = os.environ['S3_BUCKET_NAME']
table_name = os.environ['DYNAMODB_TABLE_NAME']
```

## Future Enhancements

### Planned Features
- Image processing pipeline integration
- CDN integration for global access
- Advanced analytics and reporting
- Multi-region deployment support

### Scalability Considerations
- Horizontal scaling for high throughput
- Geographic distribution for global users
- Advanced caching strategies
- Real-time data processing

## Support and Maintenance

### Regular Maintenance Tasks
- Monitor storage costs and usage
- Review and update security policies
- Backup verification and testing
- Performance optimization

### Contact Information
For technical support and questions, please refer to the main project documentation or contact the development team.
