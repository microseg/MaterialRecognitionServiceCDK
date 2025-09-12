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
  environmentName?: string;
}

export class MaskTerialModule extends Construct {
  public readonly maskterialService: ec2.Instance;
  public readonly serviceSecurityGroup: ec2.SecurityGroup;
  public readonly serviceRole: iam.Role;

  constructor(scope: Construct, id: string, props: MaskTerialModuleProps) {
    super(scope, id);

    const envTag = props.environmentName || 'Production';
    const envSuffix = props.environmentName ? `-${props.environmentName}` : '';

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

    this.maskterialService = new ec2.Instance(this, `MaskTerialInstance${envSuffix}`, {
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
    cdk.Tags.of(this.maskterialService).add('Environment', envTag);
    cdk.Tags.of(this.maskterialService).add('SSMTarget', 'MaterialRecognitionService');

    // Output important information
    new cdk.CfnOutput(this, `MaskTerialInstanceId${envSuffix}`, {
      value: this.maskterialService.instanceId,
      description: 'ID of the MaskTerial EC2 instance',
    });

    // Note: We avoid outputting instance PublicIp directly to keep stack updates resilient
    // when networking configuration changes (e.g., NAT removal). Use ALB DNS instead.
  }

  private generateUserData(props: MaskTerialModuleProps): string {
    const modelPath = props.modelPath || '/opt/maskterial/models';
    const useEcr = !!props.ecrRepositoryUri;
  
    return `#!/bin/bash
  set -euxo pipefail
  
  yum update -y
  yum install -y git python3 python3-pip docker aws-cli
  
  systemctl enable --now docker
  
  # docker compose plugin (preferred) or standalone binary
  if ! docker compose version >/dev/null 2>&1; then
    curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
  fi
  
  mkdir -p /opt/maskterial
  cd /opt/maskterial
  
  # .env provides runtime configuration (compose will read it)
  cat > .env << 'EOF'
  S3_BUCKET_NAME=${props.s3Bucket.bucketName}
  DYNAMODB_TABLE_NAME=${props.dynamoDBTable.tableName}
  AWS_DEFAULT_REGION=${cdk.Stack.of(this).region}
  MODEL_PATH=${modelPath}
  ENABLE_GPU=${props.enableGPU ? 'true' : 'false'}
  MODELS_S3_BUCKET=${props.modelsS3Bucket?.bucketName || 'matsight-maskterial-models'}
  EOF
  
  # Data directory
  mkdir -p ./data
  
  ${useEcr ? `
  # ==== Method A: Pull image from ECR ====
  ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
  REGION=${cdk.Stack.of(this).region}
  aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin ${props.ecrRepositoryUri!.split('/')[0]}
  
  cat > docker-compose.yml <<EOF
  version: '3.8'
  services:
    maskterial:
      image: ${props.ecrRepositoryUri}:latest
      ports:
        - "5000:5000"
      restart: unless-stopped
      env_file:
        - .env
      volumes:
        - ./data:/opt/maskterial/data
  EOF
  
  docker compose -f docker-compose.yml up -d
  ` : `
  # ==== Method B: Local build (only when no ECR image available) ====
  # Pull source code (change to specific tag if fixed version needed)
  git clone https://github.com/Jaluus/MaskTerial.git .
  DOCKERFILE_NAME="Dockerfile.cpu"
  if [ "$(grep -i '^ENABLE_GPU=true' .env || true)" != "" ]; then
    DOCKERFILE_NAME="Dockerfile"
  fi
  
  # Note: Must use unquoted EOF here to expand DOCKERFILE_NAME;
  # But to avoid .env variables being expanded by shell here, environment variables are passed to container via env_file.
  cat > docker-compose.yml <<EOF
  version: '3.8'
  services:
    maskterial:
      build:
        context: .
        dockerfile: ${'${DOCKERFILE_NAME}'}
      ports:
        - "5000:5000"
      restart: unless-stopped
      env_file:
        - .env
      volumes:
        - ./data:/opt/maskterial/data
  EOF
  
  docker compose -f docker-compose.yml up -d --build
  `}
  
  # Health check script
  cat > /opt/maskterial/health_check.sh << 'EOF'
  #!/bin/bash
  curl -sf http://127.0.0.1:5000/health >/dev/null
  EOF
  chmod +x /opt/maskterial/health_check.sh
  echo "*/5 * * * * /opt/maskterial/health_check.sh" | crontab -
  
  echo "MaskTerial service setup completed!"
  `;
  }

  public grantS3Access(bucket: s3.IBucket): void {
    bucket.grantReadWrite(this.serviceRole);
  }

  public grantDynamoDBAccess(table: dynamodb.ITable): void {
    table.grantReadWriteData(this.serviceRole);
  }
}
