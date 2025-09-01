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
      'yum install -y git python3 python3-pip nginx wget',
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
      '# Install CodeDeploy agent',
      'yum install -y ruby wget',
      'cd /home/ec2-user',
      'wget https://aws-codedeploy-${AWS::Region}.s3.${AWS::Region}.amazonaws.com/latest/install',
      'chmod +x ./install',
      './install auto',
      'systemctl enable codedeploy-agent',
      'systemctl start codedeploy-agent',
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
      '        proxy_connect_timeout 300s;',
      '        proxy_send_timeout 300s;',
      '        proxy_read_timeout 300s;',
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
      'Environment=PATH=/usr/local/bin:/usr/bin:/bin',
      'ExecStart=/usr/local/bin/gunicorn -w 4 -b 0.0.0.0:5000 --timeout 300 app:app',
      'Restart=always',
      'RestartSec=10',
      '',
      '[Install]',
      'WantedBy=multi-user.target',
      'EOF',
      '',
      '# Create a simple test application to verify the setup',
      'cat > /opt/material-recognition-service/app.py << EOF',
      'from flask import Flask',
      'app = Flask(__name__)',
      '',
      '@app.route("/")',
      'def hello():',
      '    return "Material Recognition Service is running!"',
      '',
      '@app.route("/health")',
      'def health():',
      '    return {"status": "healthy"}, 200',
      '',
      '@app.route("/add/<int:a>/<int:b>")',
      'def add(a, b):',
      '    return {"result": a + b}, 200',
      '',
      'if __name__ == "__main__":',
      '    app.run(host="0.0.0.0", port=5000, debug=True)',
      'EOF',
      '',
      '# Set proper permissions',
      'chown -R ec2-user:ec2-user /opt/material-recognition-service/',
      'chmod +x /opt/material-recognition-service/app.py',
      '',
      '# Create requirements.txt',
      'cat > /opt/material-recognition-service/requirements.txt << EOF',
      'Flask==2.3.3',
      'gunicorn==21.2.0',
      'EOF',
      '',
      '# Install Python dependencies',
      'cd /opt/material-recognition-service/',
      'pip3 install -r requirements.txt',
      '',
      '# Enable and start the service',
      'systemctl enable material-recognition.service',
      'systemctl start material-recognition.service',
      '',
      '# Wait for service to start',
      'sleep 10',
      '',
      '# Test the application',
      'curl -f http://localhost:5000/health || echo "Application not ready yet"'
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
            deleteOnTermination: false, // 防止实例删除时删除EBS卷
          }),
        },
      ],
    });

    // 设置实例保护，防止意外删除或替换
    const cfnInstance = this.deploymentInstance.node.defaultChild as ec2.CfnInstance;
    cfnInstance.addPropertyOverride('DisableApiTermination', true);
    
    // 为实例添加固定的Name标签，确保在重新部署时可以识别
    cdk.Tags.of(this.deploymentInstance).add('Name', 'MaterialRecognitionServiceInstance');

    // Elastic IP 由外部预置与手动关联，CDK 不再创建或管理

    // Tag the instance
    cdk.Tags.of(this.deploymentInstance).add('Project', 'MaterialRecognitionService');
    cdk.Tags.of(this.deploymentInstance).add('Environment', 'Development');
    cdk.Tags.of(this.deploymentInstance).add('Purpose', 'Deployment');
  }
}
