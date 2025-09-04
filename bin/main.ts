#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { MaterialRecognitionServiceStack } from '../lib/stack';

const app = new cdk.App();

// Get context values or use defaults
const githubTokenSecretArn = app.node.tryGetContext('githubTokenSecretArn') || 'arn:aws:secretsmanager:us-east-1:043309364810:secret:github-token-6PK7Gc';
const githubOwner = app.node.tryGetContext('githubOwner') || 'microseg';
const githubRepo = app.node.tryGetContext('githubRepo') || 'MaterialRecognitionService';
const githubBranch = app.node.tryGetContext('githubBranch') || 'preview';

// Storage configuration
const s3BucketName = app.node.tryGetContext('s3BucketName') || 'matsight-customer-images';
const dynamoDBTableName = app.node.tryGetContext('dynamoDBTableName') || 'CustomerImages';
const enableStorageAutoScaling = app.node.tryGetContext('enableStorageAutoScaling') !== false;

// Infrastructure configuration
const elasticIpAllocationId = app.node.tryGetContext('elasticIpAllocationId') || 'eipalloc-00be8bd306afb1cf7';

new MaterialRecognitionServiceStack(app, 'MaterialRecognitionServiceStack', {
  githubTokenSecretArn,
  githubOwner,
  githubRepo,
  githubBranch,
  // Storage configuration
  s3BucketName,
  dynamoDBTableName,
  enableStorageAutoScaling,
  // Infrastructure configuration
  elasticIpAllocationId,
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
});
