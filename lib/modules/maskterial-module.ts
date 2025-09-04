import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export interface MaskTerialModuleProps {
  vpc: ec2.IVpc;
  ec2Instance: ec2.Instance;
  s3Bucket: s3.IBucket;
  dynamoDBTable: dynamodb.ITable;
  modelsS3Bucket?: s3.IBucket;
  modelPath?: string;
  enableGPU?: boolean;
  instanceType?: string;
  enableAutoScaling?: boolean;
  minCapacity?: number;
  maxCapacity?: number;
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

    // Allow inbound traffic on port 5000 (Flask app)
    this.serviceSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(5000),
      'Allow Flask app access'
    );

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
      ],
      resources: ['*'],
    }));

    // Create EC2 instance for MaskTerial service
    const instanceType = props.enableGPU 
      ? ec2.InstanceType.of(ec2.InstanceClass.G4DN, ec2.InstanceSize.XLARGE)
      : ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.LARGE);

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
      value: `http://${this.maskterialService.instancePublicIp}:5000`,
      description: 'URL of the MaskTerial service',
    });
  }

  private generateUserData(props: MaskTerialModuleProps): string {
    const modelPath = props.modelPath || '/opt/maskterial/models';
    
    return `#!/bin/bash
# Update system
yum update -y
yum install -y git python3 python3-pip docker

# Start and enable Docker
systemctl start docker
systemctl enable docker

# Install Docker Compose
curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose

# Create application directory
mkdir -p /opt/maskterial
cd /opt/maskterial

# Clone MaskTerial repository
git clone https://github.com/Jaluus/MaskTerial.git .

# Create environment file
cat > .env << EOF
S3_BUCKET_NAME=${props.s3Bucket.bucketName}
DYNAMODB_TABLE_NAME=${props.dynamoDBTable.tableName}
AWS_DEFAULT_REGION=${cdk.Stack.of(this).region}
MODEL_PATH=${modelPath}
ENABLE_GPU=${props.enableGPU ? 'true' : 'false'}
MODELS_S3_BUCKET=${props.modelsS3Bucket?.bucketName || 'matsight-maskterial-models'}
EOF

# Create Docker Compose file for MaskTerial
cat > docker-compose.yml << 'EOF'
version: '3.8'
services:
  maskterial:
    build:
      context: .
      dockerfile: \${ENABLE_GPU == 'true' ? 'Dockerfile' : 'Dockerfile.cpu'}
    ports:
      - "5000:5000"
    environment:
      - S3_BUCKET_NAME=\${S3_BUCKET_NAME}
      - DYNAMODB_TABLE_NAME=\${DYNAMODB_TABLE_NAME}
      - AWS_DEFAULT_REGION=\${AWS_DEFAULT_REGION}
      - MODEL_PATH=\${MODEL_PATH}
      - ENABLE_GPU=\${ENABLE_GPU}
      - MODELS_S3_BUCKET=\${MODELS_S3_BUCKET}
    volumes:
      - ./data:/opt/maskterial/data
      - /var/run/docker.sock:/var/run/docker.sock
    restart: unless-stopped
EOF

# Add GPU support only if enabled
if [ "\${ENABLE_GPU}" = "true" ]; then
cat >> docker-compose.yml << 'EOF'
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]
EOF
fi

# Create data directory
mkdir -p ./data

# Build and start the service
docker-compose up -d --build

# Create health check script
cat > /opt/maskterial/health_check.sh << 'EOF'
#!/bin/bash
curl -f http://localhost:5000/health || exit 1
EOF

chmod +x /opt/maskterial/health_check.sh

# Add to crontab for periodic health checks
echo "*/5 * * * * /opt/maskterial/health_check.sh" | crontab -

# Install CloudWatch agent
yum install -y amazon-cloudwatch-agent

# Configure CloudWatch agent
cat > /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json << 'EOF'
{
  "logs": {
    "logs_collected": {
      "files": {
        "collect_list": [
          {
            "file_path": "/var/log/docker",
            "log_group_name": "/aws/ec2/maskterial/docker",
            "log_stream_name": "{instance_id}"
          },
          {
            "file_path": "/opt/maskterial/logs/*.log",
            "log_group_name": "/aws/ec2/maskterial/app",
            "log_stream_name": "{instance_id}"
          }
        ]
      }
    }
  }
}
EOF

# Start CloudWatch agent
/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -a fetch-config -m ec2 -s -c file:/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json
systemctl start amazon-cloudwatch-agent
systemctl enable amazon-cloudwatch-agent

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
