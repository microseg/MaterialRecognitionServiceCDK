# Deployment Guide

## Quick Start

1. **Prerequisites**
   - AWS CLI configured with appropriate credentials
   - Node.js and npm installed
   - AWS CDK CLI installed: `npm install -g aws-cdk`

2. **Deploy Infrastructure**
   ```powershell
   # Using the provided PowerShell script
   .\deploy.ps1 -GitHubOwner "your-github-username" -GitHubRepo "your-repo-name"
   
   # Or manually
   npm install
   npm run build
   cdk bootstrap
   cdk deploy --context githubOwner=your-github-username --context githubRepo=your-repo-name
   ```

## What Gets Created

### Network Infrastructure
- VPC with public and private subnets
- Security groups for EC2 instance
- Internet Gateway and NAT Gateway

### EC2 Instance
- t3.micro instance (cheapest for testing)
- Amazon Linux 2 with Python 3, nginx, and gunicorn
- Configured to run your Flask application
- Public IP for easy access

### CI/CD Pipeline
- **Source Stage**: Connects to your GitHub repository
- **Build Stage**: CodeBuild project that installs dependencies and runs tests
- **Deploy Stage**: CodeDeploy to deploy to EC2 instance

## Required Repository Files

Your GitHub repository must contain:

1. **`requirements.txt`** - Python dependencies
2. **`app.py`** - Flask application entry point
3. **`appspec.yml`** - CodeDeploy configuration (see `appspec-example.yml`)
4. **`scripts/`** directory with deployment scripts (see `scripts-example/`)

## After Deployment

1. **Get EC2 Instance ID** from CDK outputs
2. **Access your application** at the EC2 public IP on port 80
3. **Monitor pipeline** using the provided URL in CDK outputs
4. **Push to main branch** to trigger automatic deployment

## Cost Estimation

- **EC2 t3.micro**: ~$8-10/month
- **CodePipeline**: ~$1/month (first 30 days free)
- **CodeBuild**: ~$1-5/month (depending on usage)
- **S3**: ~$0.50/month
- **Total**: ~$10-15/month for testing

## Security Notes

⚠️ **For Production Use:**
- Restrict SSH access to specific IP ranges
- Move EC2 to private subnet
- Add Application Load Balancer
- Implement SSL/TLS certificates
- Add monitoring and logging

## Troubleshooting

### Common Issues

1. **Pipeline fails at Source stage**
   - Verify GitHub token has correct permissions
   - Check repository name and branch

2. **Build fails**
   - Ensure `requirements.txt` exists
   - Check Python dependencies

3. **Deploy fails**
   - Verify EC2 instance is running
   - Check `appspec.yml` configuration

4. **Application not accessible**
   - Check security groups allow port 80/5000
   - Verify nginx is running on EC2

### Useful Commands

```bash
# Check EC2 instance status
aws ec2 describe-instances --instance-ids <instance-id>

# View pipeline status
aws codepipeline get-pipeline-state --name MaterialRecognitionServicePipeline

# SSH to EC2 (if key pair configured)
ssh -i your-key.pem ec2-user@<public-ip>

# Check application logs
sudo journalctl -u material-recognition.service -f
```

## Next Steps

Once the basic infrastructure is working:

1. **Add monitoring** with CloudWatch
2. **Implement auto-scaling** for production loads
3. **Add load balancer** for high availability
4. **Set up SSL certificates** for HTTPS
5. **Configure backup and disaster recovery**
6. **Add database** (RDS) if needed
7. **Implement blue-green deployments**

## Support

For issues with the CDK infrastructure:
1. Check CloudFormation events in AWS Console
2. Review CDK synthesis output
3. Verify all required files are in your repository
4. Check IAM permissions and roles
