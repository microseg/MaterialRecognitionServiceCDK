import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface EC2ModuleProps {
  vpc: ec2.IVpc;
  instanceType?: string;
  keyName?: string; // Made optional
}

export class EC2Module extends Construct {
  public readonly deploymentInstance: ec2.Instance;
  public readonly instanceRole: iam.Role;

  constructor(scope: Construct, id: string, props: EC2ModuleProps) {
    super(scope, id);

    // Create IAM role for the EC2 instance
    this.instanceRole = new iam.Role(this, 'DeploymentInstanceRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchAgentServerPolicy'),
      ],
    });

    // Allow EC2 to pull ECR images
    this.instanceRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'ecr:GetAuthorizationToken',
          'ecr:BatchCheckLayerAvailability',
          'ecr:GetDownloadUrlForLayer',
          'ecr:BatchGetImage',
        ],
        resources: ['*'],
      })
    );

    // Add custom policy for S3 access (deployment artifacts)
    this.instanceRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          's3:GetObject',
          's3:GetObjectVersion',
          's3:ListBucket',
        ],
        resources: [
          'arn:aws:s3:::aws-codepipeline-*',
          'arn:aws:s3:::aws-codepipeline-*/*',
          'arn:aws:s3:::materialrecognitionservic-*',
          'arn:aws:s3:::materialrecognitionservic-*/*',
        ],
      })
    );

    // Allow application S3 bucket access (read/write) for business logic
    this.instanceRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          's3:PutObject',
          's3:PutObjectAcl',
          's3:AbortMultipartUpload',
          's3:ListBucket',
          's3:GetObject',
          's3:GetObjectVersion'
        ],
        resources: [
          'arn:aws:s3:::matsight-customer-images-dev',
          'arn:aws:s3:::matsight-customer-images-dev/*'
        ],
      })
    );

    // Allow DynamoDB access for the application
    this.instanceRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'dynamodb:GetItem',
          'dynamodb:PutItem',
          'dynamodb:UpdateItem',
          'dynamodb:DeleteItem',
          'dynamodb:Query',
          'dynamodb:Scan',
          'dynamodb:DescribeTable'
        ],
        resources: [
          'arn:aws:dynamodb:us-east-1:043309364810:table/CustomerImages-Dev',
          'arn:aws:dynamodb:us-east-1:043309364810:table/CustomerImages-Dev/index/*'
        ],
      })
    );

    // Add CodeDeploy permissions for the EC2 instance
    this.instanceRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'codedeploy:*',
        ],
        resources: ['*'],
      })
    );

    // Create security group for the deployment instance
    const deploymentSecurityGroup = new ec2.SecurityGroup(this, 'DeploymentInstanceSecurityGroup', {
      vpc: props.vpc,
      description: 'Security group for Material Recognition Service deployment instance',
      allowAllOutbound: true,
    });

    // Allow SSH access from anywhere (for testing purposes)
    deploymentSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(22),
      'Allow SSH access'
    );

    // Allow HTTP access for the application
    deploymentSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      'Allow HTTP access'
    );

    // Allow HTTPS access for the application
    deploymentSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      'Allow HTTPS access'
    );

    // Allow container exposed 5000 port
    deploymentSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(5000),
      'Allow application access'
    );

    // Create user data script for instance initialization (not generate script file, only basic environment preparation)
    const userData = ec2.UserData.forLinux();
    userData.addCommands(
      '#!/bin/bash',
      'yum update -y',
      'yum install -y docker',
      'systemctl enable --now docker'
    );

    // Create the EC2 instance with stable configuration
    this.deploymentInstance = new ec2.Instance(this, 'DeploymentInstance', {
      vpc: props.vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC,
      },
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.MICRO
      ),
      machineImage: new ec2.AmazonLinuxImage({
        generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
      }),
      // keyName: props.keyName, // Removed to avoid key pair dependency
      role: this.instanceRole,
      securityGroup: deploymentSecurityGroup,
      userData: userData,
      blockDevices: [
        {
          deviceName: '/dev/xvda',
          volume: ec2.BlockDeviceVolume.ebs(20, {
            volumeType: ec2.EbsDeviceVolumeType.GP3,
            deleteOnTermination: false, // Prevent instance deletion from deleting EBS volume
          }),
        },
      ],
    });

    // Enable instance termination protection
    const cfnInstance = this.deploymentInstance.node.defaultChild as ec2.CfnInstance;
    cfnInstance.addPropertyOverride('DisableApiTermination', true);
    
    // Tag instance with a stable Name for identification
    cdk.Tags.of(this.deploymentInstance).add('Name', 'MaterialRecognitionServiceInstance');

    // Elastic IP is pre-provisioned outside CDK

    // Tag the instance
    cdk.Tags.of(this.deploymentInstance).add('Project', 'MaterialRecognitionService');
    cdk.Tags.of(this.deploymentInstance).add('Environment', 'Development');
    cdk.Tags.of(this.deploymentInstance).add('Purpose', 'Deployment');
  }
}
