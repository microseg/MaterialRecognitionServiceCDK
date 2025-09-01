#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { MaterialRecognitionServiceStack } from '../lib/stack';

const app = new cdk.App();

// Get context values or use defaults
const githubTokenSecretArn = app.node.tryGetContext('githubTokenSecretArn') || 'arn:aws:secretsmanager:us-east-1:043309364810:secret:github-token-6PK7Gc';
const githubOwner = app.node.tryGetContext('githubOwner') || 'microseg';
const githubRepo = app.node.tryGetContext('githubRepo') || 'MaterialRecognitionService';
const githubBranch = app.node.tryGetContext('githubBranch') || 'mainline';

new MaterialRecognitionServiceStack(app, 'MaterialRecognitionServiceStack', {
  githubTokenSecretArn,
  githubOwner,
  githubRepo,
  githubBranch,
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
});
