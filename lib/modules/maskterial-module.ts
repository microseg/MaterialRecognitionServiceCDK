import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export interface MaskTerialModuleProps {
  vpc: ec2.IVpc;
  s3Bucket: s3.IBucket;
  dynamoDBTable: dynamodb.ITable;
  modelsS3Bucket?: s3.IBucket;
  modelPath?: string;
  enableGPU?: boolean;
  instanceType?: string;
  enableAutoScaling?: boolean;
  minCapacity?: number;
  maxCapacity?: number;
  ecrRepositoryUri?: string;
}

export class MaskTerialModule extends Construct {
  public readonly maskterialService: ec2.Instance;
  public readonly serviceSecurityGroup: ec2.SecurityGroup;
  public readonly serviceRole: iam.Role;

  constructor(scope: Construct, id: string, props: MaskTerialModuleProps) {
    super(scope, id);

    // Create security group for MaskTerial service
    this.serviceSecurityGroup = new ec2.SecurityGroup(this, 'MaskTerialSecurityGroup', {
      vpc: props.vpc,
      description: 'Security group for MaskTerial service',
      allowAllOutbound: true,
    });

    // Allow inbound traffic on port 22 (SSH)
    this.serviceSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(22),
      'Allow SSH access'
    );

    // Allow inbound traffic on port 80 (HTTP for frontend)
    this.serviceSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(8080),
      'Allow HTTP access to Nginx on 8080'
    );

    // Allow inbound traffic on port 8000 (Backend API)
    this.serviceSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(8000),
      'Allow API access for backend'
    );

    // Create IAM role for MaskTerial service
    this.serviceRole = new iam.Role(this, 'MaskTerialServiceRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchAgentServerPolicy'),
      ],
    });

    // Grant S3 access
    props.s3Bucket.grantReadWrite(this.serviceRole);

    // Grant DynamoDB access
    props.dynamoDBTable.grantReadWriteData(this.serviceRole);

    // Grant models S3 bucket access if provided
    if (props.modelsS3Bucket) {
      props.modelsS3Bucket.grantRead(this.serviceRole);
    }
    
    // Grant ECR permissions for pulling Docker images
    this.serviceRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEC2ContainerRegistryReadOnly')
    );

    // Add additional permissions for MaskTerial
    this.serviceRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'ec2:DescribeInstances',
        'ec2:DescribeTags',
        'logs:CreateLogGroup',
        'logs:CreateLogStream',
        'logs:PutLogEvents',
        'logs:DescribeLogStreams',
        "s3:ListBucket",
        "s3:GetObject",
        "s3:GetObjectVersion",
        "s3:PutObject",
        "s3:DeleteObject",
        "dynamodb:PutItem",
        "dynamodb:GetItem",
        "dynamodb:UpdateItem",
        "dynamodb:DeleteItem",
        "dynamodb:Query",
        "dynamodb:Scan",
        "dynamodb:DescribeTable"
      ],
      resources: ['*'],
    }));

    const defaultCpuType = new ec2.InstanceType('t3.medium')
    const defaultGpuType = new ec2.InstanceType('g4dn.xlarge')
    // Create EC2 instance for MaskTerial service
    const instanceType = props.enableGPU 
      ? (props.instanceType ? new ec2.InstanceType(props.instanceType) : defaultGpuType)
      : (props.instanceType ? new ec2.InstanceType(props.instanceType) : defaultCpuType);

    this.maskterialService = new ec2.Instance(this, 'MaskTerialInstance', {
      vpc: props.vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC,
      },
      instanceType,
      machineImage: new ec2.AmazonLinuxImage({
        generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
        cpuType: ec2.AmazonLinuxCpuType.X86_64,
      }),
      securityGroup: this.serviceSecurityGroup,
      role: this.serviceRole,
      userData: ec2.UserData.custom(this.generateUserData(props)),
      blockDevices: [
        {
          deviceName: '/dev/xvda',
          volume: ec2.BlockDeviceVolume.ebs(200, {
            volumeType: ec2.EbsDeviceVolumeType.GP3,
            encrypted: true,
          }),
        },
      ],
    });

    // Add tags for identification
    cdk.Tags.of(this.maskterialService).add('Service', 'MaskTerial');
    cdk.Tags.of(this.maskterialService).add('Environment', 'Production');
    cdk.Tags.of(this.maskterialService).add('SSMTarget', 'MaterialRecognitionService');

    // Output important information
    new cdk.CfnOutput(this, 'MaskTerialInstanceId', {
      value: this.maskterialService.instanceId,
      description: 'ID of the MaskTerial EC2 instance',
    });

    new cdk.CfnOutput(this, 'MaskTerialPublicIP', {
      value: this.maskterialService.instancePublicIp,
      description: 'Public IP of the MaskTerial EC2 instance',
    });

    new cdk.CfnOutput(this, 'MaskTerialServiceURL', {
      value: `http://${this.maskterialService.instancePublicIp}`,
      description: 'URL of the MaskTerial full stack (frontend + backend)',
    });
  }

  private generateUserData(props: MaskTerialModuleProps): string {
    const modelPath = props.modelPath || '/opt/maskterial/models';
    const useEcr = !!props.ecrRepositoryUri;
  
    return `#!/bin/bash
  set -euxo pipefail
  
  yum update -y
  yum install -y git python3 python3-pip docker aws-cli nodejs npm ruby wget
  
  systemctl enable --now docker
  
  # Install CodeDeploy Agent
  cd /tmp
  wget https://aws-codedeploy-${cdk.Stack.of(this).region}.s3.${cdk.Stack.of(this).region}.amazonaws.com/latest/install
  chmod +x ./install
  ./install auto
  systemctl enable codedeploy-agent
  systemctl start codedeploy-agent
  
  # docker compose plugin (preferred) or standalone binary
  if ! docker compose version >/dev/null 2>&1; then
    curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
  fi
  
  # Clone MaskTerial repository with full frontend and backend
  git clone https://github.com/microseg/MaskTerial.git /opt/MaskTerial
  cd /opt/MaskTerial
  
  # Initial deployment using production configuration
  docker compose -f docker-compose.prod.yml up -d
  
  echo "MaskTerial full stack setup completed!"
  echo "CodeDeploy agent is installed and ready for deployments"
  `;
  }

  public grantS3Access(bucket: s3.IBucket): void {
    bucket.grantReadWrite(this.serviceRole);
  }

  public grantDynamoDBAccess(table: dynamodb.ITable): void {
    table.grantReadWriteData(this.serviceRole);
  }
}
