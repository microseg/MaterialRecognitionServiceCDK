/**
 * Enhanced Storage Format Example
 * Demonstrates usage of the new enhanced CustomerImages storage format
 */

import { StorageUtils } from '../lib/modules/storage/storage-utils';

// Example customer data
const customerID = 'customer-12345';
const imageID = StorageUtils.generateImageID('UPLOADED');

console.log('=== Enhanced Storage Format Example ===\n');

// 1. Generate S3 keys
console.log('1. Generating S3 Keys:');
const originalKey = StorageUtils.getOriginalImageKey(customerID, imageID);
const thumbnailKey = StorageUtils.getUploadedThumbnailKey(customerID, imageID);
console.log(`   Original Image: ${originalKey}`);
console.log(`   Thumbnail: ${thumbnailKey}\n`);

// 2. Create enhanced metadata
console.log('2. Creating Enhanced Metadata:');
const enhancedMetadata = StorageUtils.createImageMetadata(
  customerID,
  imageID,
  'UPLOADED',
  {
    materialType: 'graphene',
    imageSize: 2048576, // 2MB
    imageFormat: 'jpg',
    processingStatus: 'pending',
    width: 1920,
    height: 1080,
    uploadSource: 'web',
    originalFilename: 'graphene_sample.jpg',
    ttlDays: 365
  }
);

console.log('Enhanced Metadata Structure:');
console.log(JSON.stringify(enhancedMetadata, null, 2));
console.log('\n');

// 3. Validate data
console.log('3. Data Validation:');
console.log(`   Customer ID valid: ${StorageUtils.validateCustomerID(customerID)}`);
console.log(`   Image ID valid: ${StorageUtils.validateImageID(imageID)}`);
console.log(`   Image format valid: ${StorageUtils.validateImageFormat('jpg')}`);
console.log('\n');

// 4. Parse image ID
console.log('4. Parsing Image ID:');
try {
  const parsed = StorageUtils.parseImageID(imageID);
  console.log(`   Type: ${parsed.type}`);
  console.log(`   Timestamp: ${parsed.timestamp}`);
  console.log(`   Random: ${parsed.random}`);
} catch (error) {
  console.log(`   Error parsing image ID: ${error}`);
}
console.log('\n');

// 5. Extract information from S3 key
console.log('5. Extracting Information from S3 Key:');
const extractedCustomerID = StorageUtils.extractCustomerIDFromS3Key(originalKey);
const extractedImageID = StorageUtils.extractImageIDFromS3Key(originalKey);
const imageType = StorageUtils.getImageTypeFromS3Key(originalKey);
const isThumbnail = StorageUtils.isThumbnail(thumbnailKey);

console.log(`   Customer ID: ${extractedCustomerID}`);
console.log(`   Image ID: ${extractedImageID}`);
console.log(`   Image Type: ${imageType}`);
console.log(`   Is Thumbnail: ${isThumbnail}`);
console.log('\n');

// 6. File utilities
console.log('6. File Utilities:');
const filename = 'sample_image.jpg';
const extension = StorageUtils.getFileExtension(filename);
const thumbnailFilename = StorageUtils.generateThumbnailFilename(filename);
const fileSize = StorageUtils.formatFileSize(2048576);

console.log(`   Original filename: ${filename}`);
console.log(`   File extension: ${extension}`);
console.log(`   Thumbnail filename: ${thumbnailFilename}`);
console.log(`   File size: ${fileSize}`);
console.log('\n');

// 7. Processing metadata
console.log('7. Processing Metadata:');
const processingMetadata = StorageUtils.createProcessingMetadata(
  1920,
  1080,
  'web',
  'graphene_sample.jpg'
);
console.log('Processing Metadata:');
console.log(JSON.stringify(processingMetadata, null, 2));
console.log('\n');

// 8. Folder structure
console.log('8. Folder Structure:');
const folderStructure = StorageUtils.getCustomerFolderStructure(customerID);
console.log('Customer Folder Structure:');
console.log(JSON.stringify(folderStructure, null, 2));
console.log('\n');

console.log('=== Example Complete ===');

// Example DynamoDB item structure
const dynamoDBItem = {
  ...enhancedMetadata,
  // Additional fields that would be added by the application
  processingHistory: [
    {
      timestamp: Date.now(),
      status: 'uploaded',
      message: 'Image uploaded successfully'
    }
  ],
  tags: ['graphene', '2d-materials', 'research'],
  annotations: {
    quality: 'high',
    resolution: '1920x1080',
    compression: 'jpeg'
  }
};

console.log('Complete DynamoDB Item Structure:');
console.log(JSON.stringify(dynamoDBItem, null, 2));
