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

    // Add custom policy for S3 access (if needed for deployment artifacts)
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

    // Allow application port (assuming Flask app runs on 5000)
    deploymentSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(5000),
      'Allow application access'
    );

    // Create user data script for instance initialization
    const userData = ec2.UserData.forLinux();
    userData.addCommands(
      '#!/bin/bash',
      'yum update -y',
      'yum install -y git python3 python3-pip nginx',
      'systemctl enable nginx',
      'systemctl start nginx',
      '',
      '# Create application directory',
      'mkdir -p /opt/material-recognition-service',
      'chown ec2-user:ec2-user /opt/material-recognition-service',
      '',
      '# Install Python dependencies',
      'pip3 install flask gunicorn',
      '',
      '# Configure nginx as reverse proxy',
      'cat > /etc/nginx/conf.d/material-recognition.conf << EOF',
      'server {',
      '    listen 80;',
      '    server_name _;',
      '    location / {',
      '        proxy_pass http://127.0.0.1:5000;',
      '        proxy_set_header Host $host;',
      '        proxy_set_header X-Real-IP $remote_addr;',
      '        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;',
      '        proxy_set_header X-Forwarded-Proto $scheme;',
      '    }',
      '}',
      'EOF',
      '',
      '# Reload nginx configuration',
      'nginx -t && systemctl reload nginx',
      '',
      '# Create systemd service for the application',
      'cat > /etc/systemd/system/material-recognition.service << EOF',
      '[Unit]',
      'Description=Material Recognition Service',
      'After=network.target',
      '',
      '[Service]',
      'Type=simple',
      'User=ec2-user',
      'WorkingDirectory=/opt/material-recognition-service',
             'ExecStart=/usr/local/bin/gunicorn -w 4 -b 0.0.0.0:5000 app:app',
      'Restart=always',
      '',
      '[Install]',
      'WantedBy=multi-user.target',
      'EOF',
      '',
      '# Enable and start the service',
      'systemctl enable material-recognition.service',
      'systemctl start material-recognition.service'
    );

    // Create the EC2 instance
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
            deleteOnTermination: true,
          }),
        },
      ],
    });

    // Tag the instance
    cdk.Tags.of(this.deploymentInstance).add('Project', 'MaterialRecognitionService');
    cdk.Tags.of(this.deploymentInstance).add('Environment', 'Development');
    cdk.Tags.of(this.deploymentInstance).add('Purpose', 'Deployment');
  }
}
