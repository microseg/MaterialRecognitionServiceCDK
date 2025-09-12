import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { PipelineModule } from './modules/pipeline-module';
import { VpcModule } from './modules/vpc-module';
import { ApiGatewayModule } from './modules/api-gateway-module';
import { EcrModule } from './modules/ecr-module';
import { AlbModule } from './modules/alb-module';
import { S3Module, DynamoDBModule, ModelsS3Module } from './modules/storage';
import { MaskTerialModule } from './modules/maskterial-module';

export interface MaterialRecognitionServiceStackProps extends cdk.StackProps {
  githubTokenSecretArn: string;
  githubOwner: string;
  githubRepo: string;
  githubBranch: string;
  // Storage configuration
  s3BucketName?: string;
  dynamoDBTableName?: string;
  enableStorageAutoScaling?: boolean;
  // Infrastructure configuration
  elasticIpAllocationId?: string; // Elastic IP allocation ID for stable IP
  // Import existing resources configuration
  importExistingResources?: boolean; // Import existing resources instead of creating new ones
  // Networking cost control
  enableNatGateway?: boolean; // default true; set false in testing to save cost
}

export class MaterialRecognitionServiceStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: MaterialRecognitionServiceStackProps) {
    super(scope, id, props);

    // Create VPC infrastructure (supports future API Gateway integration)
    const vpcModule = new VpcModule(this, 'VpcModule', {
      vpcCidr: '10.0.0.0/16',
      maxAzs: 2,
      enableNatGateway: props.enableNatGateway ?? true,
    });
    
    // Create ECR repository for Docker images
    const ecrModule = new EcrModule(this, 'EcrModule', {
      repositoryName: 'material-recognition-service',
      importExisting: props.importExistingResources ?? true, // Default to importing existing resources
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      imageScanOnPush: true,
    });

    // Create S3 storage for customer images
    const s3Module = new S3Module(this, 'S3Module', {
      bucketName: props.s3BucketName || 'matsight-customer-images',
      enableVersioning: true,
      enableLifecycleRules: true,
      retentionDays: 365,
      corsOrigins: ['*'],
      enableAccessLogging: true,
      importExisting: props.importExistingResources ?? true, // Default to importing existing resources
    });

    // Create DynamoDB table for image metadata
    const dynamoDBModule = new DynamoDBModule(this, 'DynamoDBModule', {
      tableName: props.dynamoDBTableName || 'CustomerImages',
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      enablePointInTimeRecovery: true,
      enableAutoScaling: props.enableStorageAutoScaling ?? true,
      minCapacity: 1,
      maxCapacity: 100,
      enableStreaming: false,
      importExisting: props.importExistingResources ?? true, // Default to importing existing resources
    });

    // Create S3 bucket for MaskTerial models
    const modelsS3Module = new ModelsS3Module(this, 'ModelsS3Module', {
      bucketName: 'matsight-maskterial-models-v2',
      versioned: true,
      lifecycleRules: [
        {
          id: 'DeleteOldVersions',
          noncurrentVersionExpiration: cdk.Duration.days(60),
          noncurrentVersionTransitions: [
            {
              storageClass: s3.StorageClass.INFREQUENT_ACCESS,
              transitionAfter: cdk.Duration.days(30),
            },
          ],
        },
      ],
      importExisting: props.importExistingResources ?? true, // Default to importing existing resources
    });

    // Create MaskTerial service (Production)
    const maskterialModule = new MaskTerialModule(this, 'MaskTerialModule', {
      vpc: vpcModule.vpc,
      s3Bucket: s3Module.customerImagesBucket,
      dynamoDBTable: dynamoDBModule.customerImagesTable,
      modelsS3Bucket: modelsS3Module.bucket,
      enableGPU: false, // CPU-only by default; set true if GPU needed
      modelPath: '/opt/maskterial/models',
      ecrRepositoryUri: ecrModule.repository.repositoryUri,
      environmentName: 'Production',
    });

    // Create Application Load Balancer for stable endpoint (Production)
    const albModule = new AlbModule(this, 'AlbModule', {
      vpc: vpcModule.vpc,
      ec2Instance: maskterialModule.maskterialService,
      environmentName: 'Production',
    });

    maskterialModule.maskterialService.connections.allowFrom(
      albModule.loadBalancer,
      ec2.Port.tcp(5000),
      'Allow ALB to reach app on 5000'
    );

    // Create API Gateway pointing to ALB for stable endpoint (Production)
    const apiGatewayModule = new ApiGatewayModule(this, 'ApiGatewayModule', {
      vpc: vpcModule.vpc,
      ec2Instance: maskterialModule.maskterialService,
      targetHost: albModule.loadBalancer.loadBalancerDnsName, // Use ALB DNS name
      environmentName: 'Production',
    });

    // =====================
    // Beta Environment
    // =====================
    const maskterialModuleBeta = new MaskTerialModule(this, 'MaskTerialModuleBeta', {
      vpc: vpcModule.vpc,
      s3Bucket: s3Module.customerImagesBucket,
      dynamoDBTable: dynamoDBModule.customerImagesTable,
      modelsS3Bucket: modelsS3Module.bucket,
      enableGPU: false,
      modelPath: '/opt/maskterial/models',
      ecrRepositoryUri: ecrModule.repository.repositoryUri,
      environmentName: 'Beta',
    });

    const albModuleBeta = new AlbModule(this, 'AlbModuleBeta', {
      vpc: vpcModule.vpc,
      ec2Instance: maskterialModuleBeta.maskterialService,
      environmentName: 'Beta',
    });

    maskterialModuleBeta.maskterialService.connections.allowFrom(
      albModuleBeta.loadBalancer,
      ec2.Port.tcp(5000),
      'Allow ALB to reach app on 5000 (Beta)'
    );

    const apiGatewayModuleBeta = new ApiGatewayModule(this, 'ApiGatewayModuleBeta', {
      vpc: vpcModule.vpc,
      ec2Instance: maskterialModuleBeta.maskterialService,
      targetHost: albModuleBeta.loadBalancer.loadBalancerDnsName,
      environmentName: 'Beta',
    });

    // Create CI/CD pipeline
    const pipelineModule = new PipelineModule(this, 'PipelineModule', {
      githubTokenSecretArn: props.githubTokenSecretArn,
      githubOwner: props.githubOwner,
      githubRepo: props.githubRepo,
      githubBranch: props.githubBranch,
      deploymentInstance: maskterialModule.maskterialService,
      vpc: vpcModule.vpc,
      ecrRepository: ecrModule.repository,
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
      value: maskterialModule.maskterialService.instanceId,
      description: 'ID of the deployment EC2 instance',
    });

    // Add ECR repository output
    new cdk.CfnOutput(this, 'EcrRepositoryUri', {
      value: ecrModule.repository.repositoryUri,
      description: 'URI of the ECR repository for Docker images',
    });

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

    // Beta outputs
    new cdk.CfnOutput(this, 'BetaApiGatewayUrl', {
      value: apiGatewayModuleBeta.api.url,
      description: 'URL of the Beta API Gateway endpoint',
    });

    new cdk.CfnOutput(this, 'BetaApiGatewayHealthUrl', {
      value: `${apiGatewayModuleBeta.api.url}health`,
      description: 'Health check endpoint URL (Beta)',
    });

    new cdk.CfnOutput(this, 'BetaAlbDnsName', {
      value: albModuleBeta.loadBalancer.loadBalancerDnsName,
      description: 'DNS name of Beta ALB',
    });

    new cdk.CfnOutput(this, 'BetaDeploymentInstanceId', {
      value: maskterialModuleBeta.maskterialService.instanceId,
      description: 'ID of the Beta deployment EC2 instance',
    });

    // Storage outputs
    new cdk.CfnOutput(this, 'S3BucketName', {
      value: s3Module.customerImagesBucket.bucketName,
      description: 'Name of the S3 bucket for customer images',
    });

    new cdk.CfnOutput(this, 'S3BucketArn', {
      value: s3Module.customerImagesBucket.bucketArn,
      description: 'ARN of the S3 bucket for customer images',
    });

    new cdk.CfnOutput(this, 'DynamoDBTableName', {
      value: dynamoDBModule.customerImagesTable.tableName,
      description: 'Name of the DynamoDB table for customer image metadata',
    });

    new cdk.CfnOutput(this, 'DynamoDBTableArn', {
      value: dynamoDBModule.customerImagesTable.tableArn,
      description: 'ARN of the DynamoDB table for customer image metadata',
    });

    // MaskTerial outputs
    new cdk.CfnOutput(this, 'MaskTerialInstanceId', {
      value: maskterialModule.maskterialService.instanceId,
      description: 'ID of the MaskTerial EC2 instance',
    });

    // Add deployment summary
    new cdk.CfnOutput(this, 'DeploymentSummary', {
      value: JSON.stringify({
        s3Bucket: s3Module.isImported ? 'imported' : 'created',
        dynamoDBTable: dynamoDBModule.isImported ? 'imported' : 'created',
        ecrRepository: ecrModule.isImported ? 'imported' : 'created',
        modelsS3Bucket: modelsS3Module.isImported ? 'imported' : 'created',
        importExistingResources: props.importExistingResources ?? true,
      }, null, 2),
      description: 'Summary of created vs imported resources',
    });
  }
}
