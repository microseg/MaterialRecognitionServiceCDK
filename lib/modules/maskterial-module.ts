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
      // 添加更详细的S3模型存储桶权限
      this.serviceRole.addToPolicy(new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          's3:ListBucket',
          's3:GetObject',
          's3:GetObjectVersion',
          's3:GetObjectAcl',
          's3:GetObjectVersionAcl'
        ],
        resources: [
          props.modelsS3Bucket.bucketArn,
          `${props.modelsS3Bucket.bucketArn}/*`
        ]
      }));
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

    // 添加S3模型缓存相关权限
    this.serviceRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        's3:ListBucket',
        's3:GetObject',
        's3:GetObjectVersion',
        's3:GetObjectAcl',
        's3:GetObjectVersionAcl',
        's3:HeadObject'
      ],
      resources: [
        'arn:aws:s3:::matsight-maskterial-models-v2',
        'arn:aws:s3:::matsight-maskterial-models-v2/*'
      ]
    }));

    // 添加ALB访问权限
    this.serviceRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'elasticloadbalancing:DescribeLoadBalancers',
        'elasticloadbalancing:DescribeTargetGroups',
        'elasticloadbalancing:DescribeTargetHealth',
        'elasticloadbalancing:DescribeListeners'
      ],
      resources: ['*']
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
          volume: ec2.BlockDeviceVolume.ebs(50, {
            volumeType: ec2.EbsDeviceVolumeType.GP3,
            encrypted: true,
          }),
        },
      ],
    });

    // 启用EC2实例删除保护
    const cfnInstance = this.maskterialService.node.defaultChild as ec2.CfnInstance;
    cfnInstance.addPropertyOverride('DisableApiTermination', true);

    // Add tags for identification and protection
    cdk.Tags.of(this.maskterialService).add('Service', 'MaskTerial');
    cdk.Tags.of(this.maskterialService).add('Environment', 'Production');
    cdk.Tags.of(this.maskterialService).add('SSMTarget', 'MaterialRecognitionService');
    cdk.Tags.of(this.maskterialService).add('Protection', 'Critical-Infrastructure');
    cdk.Tags.of(this.maskterialService).add('DeletionProtection', 'Enabled');
    cdk.Tags.of(this.maskterialService).add('BackupRequired', 'Yes');

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
  
  # Install Python dependencies for S3 access
  pip3 install boto3 botocore
  
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
  
  # Set environment variables for S3 model access
  echo "export S3_BUCKET_NAME=matsight-maskterial-models-v2" >> /etc/environment
  echo "export S3_CLASSIFICATION_MODELS_PATH=s3://matsight-maskterial-models-v2/classification_models" >> /etc/environment
  echo "export S3_SEGMENTATION_MODELS_PATH=s3://matsight-maskterial-models-v2/segmentation_models" >> /etc/environment
  echo "export S3_POSTPROCESSING_MODELS_PATH=s3://matsight-maskterial-models-v2/postprocessing_models" >> /etc/environment
  echo "export AWS_DEFAULT_REGION=${cdk.Stack.of(this).region}" >> /etc/environment
  echo "export MODEL_CACHE_DIR=/tmp/maskterial_models_cache" >> /etc/environment
  
  # Create and set permissions for model cache directory
  mkdir -p /tmp/maskterial_models_cache
  chmod 755 /tmp/maskterial_models_cache
  chown ec2-user:ec2-user /tmp/maskterial_models_cache
  
  # Create swap space for memory-intensive operations
  if [ ! -f /swapfile ]; then
    fallocate -l 2G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
  fi
  
  # Test S3 access
  aws s3 ls s3://matsight-maskterial-models-v2/ || echo "S3 bucket not accessible yet"
  
  # Test Python S3 access
  python3 -c "
import boto3
import sys
try:
    s3 = boto3.client('s3')
    response = s3.list_objects_v2(Bucket='matsight-maskterial-models-v2', MaxKeys=1)
    print('✅ Python boto3 S3 access successful')
except Exception as e:
    print(f'❌ Python boto3 S3 access failed: {e}')
    sys.exit(1)
" || echo "Python S3 access test failed, but continuing..."
  
  # Initial deployment using production configuration
  docker compose -f docker-compose.prod.yml up -d
  
  # Validate service including S3 access
  echo "Validating MaskTerial service and S3 access..."
  ./scripts/validate_service.sh
  
  echo "MaskTerial full stack setup completed!"
  echo "S3 model access configured for bucket: matsight-maskterial-models-v2"
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
