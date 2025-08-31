# Material Recognition Service CDK Infrastructure

This CDK project creates the infrastructure for the Material Recognition Service, including a CI/CD pipeline that automatically deploys code to an EC2 instance when changes are merged to the main branch.

## Architecture

The infrastructure consists of the following modules:

- **VpcModule**: Creates a VPC with public and private subnets (supports future API Gateway integration)
- **EC2Module**: Creates the deployment EC2 instance with necessary configurations
- **PipelineModule**: Creates the CI/CD pipeline using AWS CodePipeline, CodeBuild, and CodeDeploy

## VPC Configuration

The VPC is designed to support both current EC2 deployment and future API Gateway integration:

- **Public Subnets**: For EC2 instances that need direct internet access
- **Private Subnets**: For future services that will be accessed via API Gateway VPC Link
- **NAT Gateway**: Single NAT Gateway for cost optimization (enables private subnet internet access)
- **Internet Gateway**: For public subnet internet access

## Prerequisites

1. AWS CLI configured with appropriate credentials
2. Node.js and npm installed
3. AWS CDK CLI installed globally: `npm install -g aws-cdk`
4. GitHub repository with your Material Recognition Service code
5. GitHub token stored in AWS Secrets Manager (already configured: `arn:aws:secretsmanager:us-east-1:043309364810:secret:github-token-6PK7Gc`)

## Setup

### Quick Deployment

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Bootstrap CDK (first time only)
cdk bootstrap

# Deploy the infrastructure
cdk deploy --context githubOwner=your-github-username --context githubRepo=your-repo-name
```

## Required Files in Your Repository

Your GitHub repository should contain the following files for the pipeline to work correctly:

### `requirements.txt`
```
flask
gunicorn
# Add other Python dependencies your application needs
```

### `app.py`
```python
from flask import Flask

app = Flask(__name__)

@app.route('/')
def hello():
    return 'Material Recognition Service is running!'

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
```

### `appspec.yml`
```yaml
version: 0.0
os: linux
files:
  - source: /
    destination: /opt/material-recognition-service
hooks:
  BeforeInstall:
    - location: scripts/before_install.sh
      timeout: 300
      runas: root
  AfterInstall:
    - location: scripts/after_install.sh
      timeout: 300
      runas: root
  ApplicationStart:
    - location: scripts/start_application.sh
      timeout: 300
      runas: root
  ApplicationStop:
    - location: scripts/stop_application.sh
      timeout: 300
      runas: root
```

### `scripts/before_install.sh`
```bash
#!/bin/bash
# Stop the application if it's running
systemctl stop material-recognition.service || true
```

### `scripts/after_install.sh`
```bash
#!/bin/bash
# Set proper permissions
chown -R ec2-user:ec2-user /opt/material-recognition-service
chmod +x /opt/material-recognition-service/scripts/*.sh

# Install Python dependencies
cd /opt/material-recognition-service
pip3 install -r requirements.txt
```

### `scripts/start_application.sh`
```bash
#!/bin/bash
# Start the application
systemctl start material-recognition.service
```

### `scripts/stop_application.sh`
```bash
#!/bin/bash
# Stop the application
systemctl stop material-recognition.service
```

## Infrastructure Details

### VPC
- **CIDR**: 10.0.0.0/16
- **Public Subnets**: 2 subnets across different AZs
- **Private Subnets**: 2 subnets across different AZs
- **NAT Gateway**: Single NAT Gateway for cost optimization
- **Internet Gateway**: For public subnet access

### EC2 Instance
- **Instance Type**: t3.micro (cheapest for testing)
- **OS**: Amazon Linux 2
- **Location**: Public subnet for easy access
- **Security Groups**: Configured to allow SSH (22), HTTP (80), HTTPS (443), and application port (5000)

### CI/CD Pipeline
1. **Source Stage**: Connects to GitHub repository using the provided token
2. **Build Stage**: Uses CodeBuild to install dependencies and run tests
3. **Deploy Stage**: Uses CodeDeploy to deploy the application to the EC2 instance

## Commands

- `npm run build`: Build the TypeScript code
- `npm run synth`: Synthesize CloudFormation templates
- `npm run deploy`: Deploy the infrastructure
- `npm run destroy`: Destroy the infrastructure
- `npm run diff`: Show differences between deployed and local stack

## Outputs

After deployment, the stack will output:
- **VpcId**: The ID of the created VPC
- **PublicSubnets**: IDs of the public subnets
- **PrivateSubnets**: IDs of the private subnets (for future API Gateway VPC Link)
- **DeploymentInstanceId**: The ID of the EC2 instance
- **PipelineUrl**: URL to view the CI/CD pipeline in AWS Console

## Future API Gateway Integration

The VPC is designed to support API Gateway integration:

1. **Private Subnets**: Ready for backend services that will be accessed via API Gateway VPC Link
2. **NAT Gateway**: Enables private subnet services to access external resources
3. **Security Groups**: Can be easily extended for API Gateway VPC Link requirements

## Security Notes

- The EC2 instance is placed in a public subnet for testing purposes
- SSH access is open to all IPs (0.0.0.0/0) - consider restricting this for production
- The GitHub token is stored in AWS Secrets Manager for secure access
- VPC default security group rules are restricted for better security

## Cost Optimization

- Uses t3.micro instance (cheapest available)
- Single NAT Gateway to minimize costs
- GP3 EBS volumes for better performance/cost ratio
- S3 bucket with lifecycle policies to clean up old artifacts

## Troubleshooting

1. **Pipeline fails at Source stage**: Check that the GitHub token has the correct permissions
2. **Build fails**: Ensure your repository has the required files (requirements.txt, appspec.yml, etc.)
3. **Deploy fails**: Check that the EC2 instance is running and accessible
4. **Application not accessible**: Verify security groups allow traffic on port 80/5000

## Next Steps

For production deployment, consider:
- Moving EC2 instance to private subnet
- Adding Application Load Balancer
- Implementing auto-scaling
- Adding monitoring and logging
- Restricting SSH access to specific IP ranges
- Adding SSL/TLS certificates
- Integrating API Gateway with VPC Link
