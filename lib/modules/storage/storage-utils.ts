/**
 * Storage utilities for managing customer images and metadata
 */

export interface ImageMetadata {
  customerID: string;           // Partition Key - Customer identifier
  imageID: string;              // Sort Key - Unique image identifier
  createdAt: number;            // Creation timestamp
  type: 'UPLOADED' | 'SAVED_RESULT';
  s3Key: string;                // Full S3 path
  thumbnailKey: string;         // Thumbnail S3 path
  status: 'active' | 'deleted';
  materialType?: string;        // Primary material type
  imageSize?: number;           // Image size in bytes
  imageFormat?: string;         // Image format (jpg, png, etc.)
  processingStatus?: 'pending' | 'processing' | 'completed' | 'failed';
  metadata: {
    width?: number;
    height?: number;
    uploadSource?: 'web' | 'mobile' | 'api';
    originalFilename?: string;
    material?: string;
    [key: string]: any;
  };
  expiresAt?: number;           // TTL timestamp
}

export class StorageUtils {
  private static readonly BUCKET_NAME = 'matsight-customer-images';

  /**
   * Generate S3 key for original uploaded image
   */
  static getOriginalImageKey(customerID: string, imageID: string): string {
    return `${customerID}/uploaded/${imageID}_original.jpg`;
  }

  /**
   * Generate S3 key for uploaded image thumbnail
   */
  static getUploadedThumbnailKey(customerID: string, imageID: string): string {
    return `${customerID}/uploaded/${imageID}_thumbnail.jpg`;
  }

  /**
   * Generate S3 key for saved result image
   */
  static getSavedImageKey(customerID: string, imageID: string): string {
    return `${customerID}/saved-result/${imageID}_saved.jpg`;
  }

  /**
   * Generate S3 key for saved result thumbnail
   */
  static getSavedThumbnailKey(customerID: string, imageID: string): string {
    return `${customerID}/saved-result/${imageID}_thumbnail.jpg`;
  }

  /**
   * Generate full S3 URL for an object
   */
  static getS3Url(s3Key: string): string {
    return `s3://${this.BUCKET_NAME}/${s3Key}`;
  }

  /**
   * Generate presigned URL for secure access
   * Note: This method requires AWS SDK v3 to be imported in the calling code
   */
  static generatePresignedUrlSignature(
    operation: 'getObject' | 'putObject',
    s3Key: string,
    expiresIn: number = 3600
  ): { bucket: string; key: string; operation: string; expiresIn: number } {
    return {
      bucket: this.BUCKET_NAME,
      key: s3Key,
      operation,
      expiresIn,
    };
  }

  /**
   * Create enhanced image metadata object for DynamoDB
   */
  static createImageMetadata(
    customerID: string,
    imageID: string,
    type: 'UPLOADED' | 'SAVED_RESULT',
    options: {
      materialType?: string;
      imageSize?: number;
      imageFormat?: string;
      processingStatus?: 'pending' | 'processing' | 'completed' | 'failed';
      width?: number;
      height?: number;
      uploadSource?: 'web' | 'mobile' | 'api';
      originalFilename?: string;
      material?: string;
      ttlDays?: number;
    } = {}
  ): ImageMetadata {
    const now = Date.now();
    const ttlDays = options.ttlDays || 365;
    const expiresAt = now + (ttlDays * 24 * 60 * 60 * 1000);

    const s3Key = type === 'UPLOADED' 
      ? this.getOriginalImageKey(customerID, imageID)
      : this.getSavedImageKey(customerID, imageID);

    const thumbnailKey = type === 'UPLOADED'
      ? this.getUploadedThumbnailKey(customerID, imageID)
      : this.getSavedThumbnailKey(customerID, imageID);

    return {
      customerID,
      imageID,
      createdAt: now,
      type,
      s3Key,
      thumbnailKey,
      status: 'active',
      materialType: options.materialType,
      imageSize: options.imageSize,
      imageFormat: options.imageFormat || 'jpg',
      processingStatus: options.processingStatus || 'pending',
      metadata: {
        width: options.width,
        height: options.height,
        uploadSource: options.uploadSource || 'api',
        originalFilename: options.originalFilename,
        material: options.material || options.materialType,
      },
      expiresAt,
    };
  }

  /**
   * Generate unique image ID with type prefix
   */
  static generateImageID(type: 'UPLOADED' | 'SAVED_RESULT'): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    return `${type.toLowerCase()}-${timestamp}-${random}`;
  }

  /**
   * Extract information from image ID
   */
  static parseImageID(imageID: string): {
    type: 'UPLOADED' | 'SAVED_RESULT';
    timestamp: number;
    random: string;
  } {
    const parts = imageID.split('-');
    if (parts.length < 3) {
      throw new Error('Invalid image ID format');
    }

    const type = parts[0].toUpperCase() as 'UPLOADED' | 'SAVED_RESULT';
    const timestamp = parseInt(parts[1]);
    const random = parts.slice(2).join('-');

    return { type, timestamp, random };
  }

  /**
   * Validate customer ID format
   */
  static validateCustomerID(customerID: string): boolean {
    // Basic validation: alphanumeric and hyphens, 3-50 characters
    const pattern = /^[a-zA-Z0-9-]{3,50}$/;
    return pattern.test(customerID);
  }

  /**
   * Validate image ID format
   */
  static validateImageID(imageID: string): boolean {
    // Basic validation: alphanumeric, hyphens, and underscores, 10-100 characters
    const pattern = /^[a-zA-Z0-9-_]{10,100}$/;
    return pattern.test(imageID);
  }

  /**
   * Get folder structure for a customer
   */
  static getCustomerFolderStructure(customerID: string): {
    uploaded: string;
    savedResult: string;
  } {
    return {
      uploaded: `${customerID}/uploaded/`,
      savedResult: `${customerID}/saved-result/`,
    };
  }

  /**
   * Extract customer ID from S3 key
   */
  static extractCustomerIDFromS3Key(s3Key: string): string | null {
    const parts = s3Key.split('/');
    if (parts.length >= 2) {
      return parts[0];
    }
    return null;
  }

  /**
   * Extract image ID from S3 key
   */
  static extractImageIDFromS3Key(s3Key: string): string | null {
    const parts = s3Key.split('/');
    if (parts.length >= 3) {
      const filename = parts[parts.length - 1];
      // Remove file extension and suffix (_original, _saved, _thumbnail)
      return filename.replace(/\.(jpg|jpeg|png|gif)$/, '').replace(/_(original|saved|thumbnail)$/, '');
    }
    return null;
  }

  /**
   * Get image type from S3 key
   */
  static getImageTypeFromS3Key(s3Key: string): 'UPLOADED' | 'SAVED_RESULT' | null {
    if (s3Key.includes('/uploaded/')) {
      return 'UPLOADED';
    } else if (s3Key.includes('/saved-result/')) {
      return 'SAVED_RESULT';
    }
    return null;
  }

  /**
   * Check if S3 key is a thumbnail
   */
  static isThumbnail(s3Key: string): boolean {
    return s3Key.includes('_thumbnail');
  }

  /**
   * Get file extension from filename
   */
  static getFileExtension(filename: string): string {
    const parts = filename.split('.');
    return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
  }

  /**
   * Validate image format
   */
  static validateImageFormat(format: string): boolean {
    const validFormats = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'];
    return validFormats.includes(format.toLowerCase());
  }

  /**
   * Calculate file size in human readable format
   */
  static formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Generate thumbnail filename
   */
  static generateThumbnailFilename(originalFilename: string): string {
    const parts = originalFilename.split('.');
    const extension = parts.length > 1 ? parts.pop() : 'jpg';
    const name = parts.join('.');
    return `${name}_thumbnail.${extension}`;
  }

  /**
   * Create metadata for image processing
   */
  static createProcessingMetadata(
    width: number,
    height: number,
    uploadSource: 'web' | 'mobile' | 'api' = 'api',
    originalFilename?: string
  ) {
    return {
      width,
      height,
      uploadSource,
      originalFilename,
      processingTimestamp: Date.now(),
    };
  }
}
