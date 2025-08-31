import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';
import { PipelineModule } from './modules/pipeline-module';
import { EC2Module } from './modules/ec2-module';
import { VpcModule } from './modules/vpc-module';

export interface MaterialRecognitionServiceStackProps extends cdk.StackProps {
  githubTokenSecretArn: string;
  githubOwner: string;
  githubRepo: string;
  githubBranch: string;
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

    // Create CI/CD pipeline
    const pipelineModule = new PipelineModule(this, 'PipelineModule', {
      githubTokenSecretArn: props.githubTokenSecretArn,
      githubOwner: props.githubOwner,
      githubRepo: props.githubRepo,
      githubBranch: props.githubBranch,
      deploymentInstance: ec2Module.deploymentInstance,
      vpc: vpcModule.vpc,
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

    new cdk.CfnOutput(this, 'PipelineUrl', {
      value: `https://${this.region}.console.aws.amazon.com/codesuite/codepipeline/pipelines/${pipelineModule.pipeline.pipelineName}/view`,
      description: 'URL to view the CI/CD pipeline',
    });
  }
}
