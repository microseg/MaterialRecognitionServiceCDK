import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';
import { PipelineModule } from './modules/pipeline-module';
import { EC2Module } from './modules/ec2-module';
import { VpcModule } from './modules/vpc-module';
import { ApiGatewayModule } from './modules/api-gateway-module'; // Enable API Gateway module
import { EcrModule } from './modules/ecr-module'; // Add ECR module import
// import { S3Module, DynamoDBModule } from './modules/storage'; // Add storage modules

export interface MaterialRecognitionServiceStackProps extends cdk.StackProps {
  githubTokenSecretArn: string;
  githubOwner: string;
  githubRepo: string;
  githubBranch: string;
  // Storage configuration
  s3BucketName?: string;
  dynamoDBTableName?: string;
  enableStorageAutoScaling?: boolean;
}

export class MaterialRecognitionServiceStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: MaterialRecognitionServiceStackProps) {
    super(scope, id, props);

    // Create VPC infrastructure (supports future API Gateway integration)
    const vpcModule = new VpcModule(this, 'VpcModule', {
      vpcCidr: '10.0.0.0/16',
      maxAzs: 2,
    });

    // Create EC2 infrastructure using the VPC
    const ec2Module = new EC2Module(this, 'EC2Module', {
      vpc: vpcModule.vpc,
      instanceType: 't3.micro', // Cheapest instance for testing
    });

    // Create ECR repository for Docker images
    const ecrModule = new EcrModule(this, 'EcrModule', {
      repositoryName: 'material-recognition-service',
      importExisting: false,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      imageScanOnPush: true,
    });

    // Create API Gateway pointing to fixed Elastic IP
    const apiGatewayModule = new ApiGatewayModule(this, 'ApiGatewayModule', {
      vpc: vpcModule.vpc,
      ec2Instance: ec2Module.deploymentInstance,
      targetHost: '18.208.10.108', // Use fixed Elastic IP, not dependent on instance reference
    });

    // Create S3 storage for customer images
    // const s3Module = new S3Module(this, 'S3Module', {
    //   bucketName: props.s3BucketName || 'matsight-customer-images',
    //   enableVersioning: true,
    //   enableLifecycleRules: true,
    //   retentionDays: 365,
    //   corsOrigins: ['*'],
    //   enableAccessLogging: true,
    // });

    // Create DynamoDB table for image metadata
    // const dynamoDBModule = new DynamoDBModule(this, 'DynamoDBModule', {
    //   tableName: props.dynamoDBTableName || 'CustomerImages',
    //   billingMode: 'PAY_PER_REQUEST', // Start with pay-per-request for cost optimization
    //   enablePointInTimeRecovery: true,
    //   enableAutoScaling: props.enableStorageAutoScaling ?? true,
    //   minCapacity: 1,
    //   maxCapacity: 100,
    //   enableStreaming: false, // Enable if you need change tracking
    // });

    // Create CI/CD pipeline
    const pipelineModule = new PipelineModule(this, 'PipelineModule', {
      githubTokenSecretArn: props.githubTokenSecretArn,
      githubOwner: props.githubOwner,
      githubRepo: props.githubRepo,
      githubBranch: props.githubBranch,
      deploymentInstance: ec2Module.deploymentInstance,
      vpc: vpcModule.vpc,
      ecrRepository: ecrModule.repository, // Pass ECR repository to pipeline
    });

    // Output important information
    new cdk.CfnOutput(this, 'VpcId', {
      value: vpcModule.vpc.vpcId,
      description: 'ID of the VPC created for the infrastructure',
    });

    new cdk.CfnOutput(this, 'PublicSubnets', {
      value: vpcModule.vpc.publicSubnets.map(subnet => subnet.subnetId).join(','),
      description: 'IDs of the public subnets',
    });

    new cdk.CfnOutput(this, 'PrivateSubnets', {
      value: vpcModule.vpc.privateSubnets.map(subnet => subnet.subnetId).join(','),
      description: 'IDs of the private subnets (for future API Gateway VPC Link)',
    });

    new cdk.CfnOutput(this, 'DeploymentInstanceId', {
      value: ec2Module.deploymentInstance.instanceId,
      description: 'ID of the deployment EC2 instance',
    });

    // Add ECR repository output
    new cdk.CfnOutput(this, 'EcrRepositoryUri', {
      value: ecrModule.repository.repositoryUri,
      description: 'URI of the ECR repository for Docker images',
    });

    // Elastic IP output removed, now using externally allocated fixed EIP for access

    new cdk.CfnOutput(this, 'PipelineUrl', {
      value: `https://${this.region}.console.aws.amazon.com/codesuite/codepipeline/pipelines/${pipelineModule.pipeline.pipelineName}/view`,
      description: 'URL to view the CI/CD pipeline',
    });

    new cdk.CfnOutput(this, 'ApiGatewayUrl', {
      value: apiGatewayModule.api.url,
      description: 'URL of the API Gateway endpoint',
    });

    new cdk.CfnOutput(this, 'ApiGatewayHealthUrl', {
      value: `${apiGatewayModule.api.url}health`,
      description: 'Health check endpoint URL',
    });

    // Storage outputs
    // new cdk.CfnOutput(this, 'S3BucketName', {
    //   value: s3Module.customerImagesBucket.bucketName,
    //   description: 'Name of the S3 bucket for customer images',
    // });

    // new cdk.CfnOutput(this, 'S3BucketArn', {
    //   value: s3Module.customerImagesBucket.bucketArn,
    //   description: 'ARN of the S3 bucket for customer images',
    // });

    // new cdk.CfnOutput(this, 'DynamoDBTableName', {
    //   value: dynamoDBModule.customerImagesTable.tableName,
    //   description: 'Name of the DynamoDB table for customer image metadata',
    // });

    // new cdk.CfnOutput(this, 'DynamoDBTableArn', {
    //   value: dynamoDBModule.customerImagesTable.tableArn,
    //   description: 'ARN of the DynamoDB table for customer image metadata',
    // });
  }
}
