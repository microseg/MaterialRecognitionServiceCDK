"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EC2Module = void 0;
const cdk = require("aws-cdk-lib");
const ec2 = require("aws-cdk-lib/aws-ec2");
const iam = require("aws-cdk-lib/aws-iam");
const constructs_1 = require("constructs");
class EC2Module extends constructs_1.Construct {
    constructor(scope, id, props) {
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
        this.instanceRole.addToPolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
                'ecr:GetAuthorizationToken',
                'ecr:BatchCheckLayerAvailability',
                'ecr:GetDownloadUrlForLayer',
                'ecr:BatchGetImage',
            ],
            resources: ['*'],
        }));
        // Add custom policy for S3 access (deployment artifacts)
        this.instanceRole.addToPolicy(new iam.PolicyStatement({
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
        }));
        // Allow application S3 bucket access (read/write) for business logic
        this.instanceRole.addToPolicy(new iam.PolicyStatement({
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
        }));
        // Add CodeDeploy permissions for the EC2 instance
        this.instanceRole.addToPolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
                'codedeploy:*',
            ],
            resources: ['*'],
        }));
        // Create security group for the deployment instance
        const deploymentSecurityGroup = new ec2.SecurityGroup(this, 'DeploymentInstanceSecurityGroup', {
            vpc: props.vpc,
            description: 'Security group for Material Recognition Service deployment instance',
            allowAllOutbound: true,
        });
        // Allow SSH access from anywhere (for testing purposes)
        deploymentSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(22), 'Allow SSH access');
        // Allow HTTP access for the application
        deploymentSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), 'Allow HTTP access');
        // Allow HTTPS access for the application
        deploymentSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), 'Allow HTTPS access');
        // Allow container exposed 5000 port
        deploymentSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(5000), 'Allow application access');
        // Create user data script for instance initialization (not generate script file, only basic environment preparation)
        const userData = ec2.UserData.forLinux();
        userData.addCommands('#!/bin/bash', 'yum update -y', 'yum install -y docker', 'systemctl enable --now docker');
        // Create the EC2 instance with stable configuration
        this.deploymentInstance = new ec2.Instance(this, 'DeploymentInstance', {
            vpc: props.vpc,
            vpcSubnets: {
                subnetType: ec2.SubnetType.PUBLIC,
            },
            instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
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
        const cfnInstance = this.deploymentInstance.node.defaultChild;
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
exports.EC2Module = EC2Module;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWMyLW1vZHVsZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImVjMi1tb2R1bGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEsbUNBQW1DO0FBQ25DLDJDQUEyQztBQUMzQywyQ0FBMkM7QUFDM0MsMkNBQXVDO0FBUXZDLE1BQWEsU0FBVSxTQUFRLHNCQUFTO0lBSXRDLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBcUI7UUFDN0QsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztRQUVqQix1Q0FBdUM7UUFDdkMsSUFBSSxDQUFDLFlBQVksR0FBRyxJQUFJLEdBQUcsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLHdCQUF3QixFQUFFO1lBQy9ELFNBQVMsRUFBRSxJQUFJLEdBQUcsQ0FBQyxnQkFBZ0IsQ0FBQyxtQkFBbUIsQ0FBQztZQUN4RCxlQUFlLEVBQUU7Z0JBQ2YsR0FBRyxDQUFDLGFBQWEsQ0FBQyx3QkFBd0IsQ0FBQyw4QkFBOEIsQ0FBQztnQkFDMUUsR0FBRyxDQUFDLGFBQWEsQ0FBQyx3QkFBd0IsQ0FBQyw2QkFBNkIsQ0FBQzthQUMxRTtTQUNGLENBQUMsQ0FBQztRQUVILCtCQUErQjtRQUMvQixJQUFJLENBQUMsWUFBWSxDQUFDLFdBQVcsQ0FDM0IsSUFBSSxHQUFHLENBQUMsZUFBZSxDQUFDO1lBQ3RCLE1BQU0sRUFBRSxHQUFHLENBQUMsTUFBTSxDQUFDLEtBQUs7WUFDeEIsT0FBTyxFQUFFO2dCQUNQLDJCQUEyQjtnQkFDM0IsaUNBQWlDO2dCQUNqQyw0QkFBNEI7Z0JBQzVCLG1CQUFtQjthQUNwQjtZQUNELFNBQVMsRUFBRSxDQUFDLEdBQUcsQ0FBQztTQUNqQixDQUFDLENBQ0gsQ0FBQztRQUVGLHlEQUF5RDtRQUN6RCxJQUFJLENBQUMsWUFBWSxDQUFDLFdBQVcsQ0FDM0IsSUFBSSxHQUFHLENBQUMsZUFBZSxDQUFDO1lBQ3RCLE1BQU0sRUFBRSxHQUFHLENBQUMsTUFBTSxDQUFDLEtBQUs7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LEVBQUUsQ0FBQyxJQUFJLENBQUMsa0JBQWtCLENBQUMsQ0FBQyxHQUFHLENBQUMsU0FBUyxFQUFFLFlBQVksQ0FBQyxDQUFDO0lBQ3BFLENBQUM7Q0FDRjtBQXBLRCw4QkFvS0MiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0ICogYXMgZWMyIGZyb20gJ2F3cy1jZGstbGliL2F3cy1lYzInO1xuaW1wb3J0ICogYXMgaWFtIGZyb20gJ2F3cy1jZGstbGliL2F3cy1pYW0nO1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgRUMyTW9kdWxlUHJvcHMge1xuICB2cGM6IGVjMi5JVnBjO1xuICBpbnN0YW5jZVR5cGU/OiBzdHJpbmc7XG4gIGtleU5hbWU/OiBzdHJpbmc7IC8vIE1hZGUgb3B0aW9uYWxcbn1cblxuZXhwb3J0IGNsYXNzIEVDMk1vZHVsZSBleHRlbmRzIENvbnN0cnVjdCB7XG4gIHB1YmxpYyByZWFkb25seSBkZXBsb3ltZW50SW5zdGFuY2U6IGVjMi5JbnN0YW5jZTtcbiAgcHVibGljIHJlYWRvbmx5IGluc3RhbmNlUm9sZTogaWFtLlJvbGU7XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IEVDMk1vZHVsZVByb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkKTtcblxuICAgIC8vIENyZWF0ZSBJQU0gcm9sZSBmb3IgdGhlIEVDMiBpbnN0YW5jZVxuICAgIHRoaXMuaW5zdGFuY2VSb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsICdEZXBsb3ltZW50SW5zdGFuY2VSb2xlJywge1xuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoJ2VjMi5hbWF6b25hd3MuY29tJyksXG4gICAgICBtYW5hZ2VkUG9saWNpZXM6IFtcbiAgICAgICAgaWFtLk1hbmFnZWRQb2xpY3kuZnJvbUF3c01hbmFnZWRQb2xpY3lOYW1lKCdBbWF6b25TU01NYW5hZ2VkSW5zdGFuY2VDb3JlJyksXG4gICAgICAgIGlhbS5NYW5hZ2VkUG9saWN5LmZyb21Bd3NNYW5hZ2VkUG9saWN5TmFtZSgnQ2xvdWRXYXRjaEFnZW50U2VydmVyUG9saWN5JyksXG4gICAgICBdLFxuICAgIH0pO1xuXG4gICAgLy8gQWxsb3cgRUMyIHRvIHB1bGwgRUNSIGltYWdlc1xuICAgIHRoaXMuaW5zdGFuY2VSb2xlLmFkZFRvUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAnZWNyOkdldEF1dGhvcml6YXRpb25Ub2tlbicsXG4gICAgICAgICAgJ2VjcjpCYXRjaENoZWNrTGF5ZXJBdmFpbGFiaWxpdHknLFxuICAgICAgICAgICdlY3I6R2V0RG93bmxvYWRVcmxGb3JMYXllcicsXG4gICAgICAgICAgJ2VjcjpCYXRjaEdldEltYWdlJyxcbiAgICAgICAgXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbJyonXSxcbiAgICAgIH0pXG4gICAgKTtcblxuICAgIC8vIEFkZCBjdXN0b20gcG9saWN5IGZvciBTMyBhY2Nlc3MgKGRlcGxveW1lbnQgYXJ0aWZhY3RzKVxuICAgIHRoaXMuaW5zdGFuY2VSb2xlLmFkZFRvUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAnczM6R2V0T2JqZWN0JyxcbiAgICAgICAgICAnczM6R2V0T2JqZWN0VmVyc2lvbicsXG4gICAgICAgICAgJ3MzOkxpc3RCdWNrZXQnLFxuICAgICAgICBdLFxuICAgICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgICAnYXJuOmF3czpzMzo6OmF3cy1jb2RlcGlwZWxpbmUtKicsXG4gICAgICAgICAgJ2Fybjphd3M6czM6Ojphd3MtY29kZXBpcGVsaW5lLSovKicsXG4gICAgICAgICAgJ2Fybjphd3M6czM6OjptYXRlcmlhbHJlY29nbml0aW9uc2VydmljLSonLFxuICAgICAgICAgICdhcm46YXdzOnMzOjo6bWF0ZXJpYWxyZWNvZ25pdGlvbnNlcnZpYy0qLyonLFxuICAgICAgICBdLFxuICAgICAgfSlcbiAgICApO1xuXG4gICAgLy8gQWxsb3cgYXBwbGljYXRpb24gUzMgYnVja2V0IGFjY2VzcyAocmVhZC93cml0ZSkgZm9yIGJ1c2luZXNzIGxvZ2ljXG4gICAgdGhpcy5pbnN0YW5jZVJvbGUuYWRkVG9Qb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICdzMzpQdXRPYmplY3QnLFxuICAgICAgICAgICdzMzpQdXRPYmplY3RBY2wnLFxuICAgICAgICAgICdzMzpBYm9ydE11bHRpcGFydFVwbG9hZCcsXG4gICAgICAgICAgJ3MzOkxpc3RCdWNrZXQnLFxuICAgICAgICAgICdzMzpHZXRPYmplY3QnLFxuICAgICAgICAgICdzMzpHZXRPYmplY3RWZXJzaW9uJ1xuICAgICAgICBdLFxuICAgICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgICAnYXJuOmF3czpzMzo6Om1hdHNpZ2h0LWN1c3RvbWVyLWltYWdlcy1kZXYnLFxuICAgICAgICAgICdhcm46YXdzOnMzOjo6bWF0c2lnaHQtY3VzdG9tZXItaW1hZ2VzLWRldi8qJ1xuICAgICAgICBdLFxuICAgICAgfSlcbiAgICApO1xuXG4gICAgLy8gQWRkIENvZGVEZXBsb3kgcGVybWlzc2lvbnMgZm9yIHRoZSBFQzIgaW5zdGFuY2VcbiAgICB0aGlzLmluc3RhbmNlUm9sZS5hZGRUb1BvbGljeShcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgJ2NvZGVkZXBsb3k6KicsXG4gICAgICAgIF0sXG4gICAgICAgIHJlc291cmNlczogWycqJ10sXG4gICAgICB9KVxuICAgICk7XG5cbiAgICAvLyBDcmVhdGUgc2VjdXJpdHkgZ3JvdXAgZm9yIHRoZSBkZXBsb3ltZW50IGluc3RhbmNlXG4gICAgY29uc3QgZGVwbG95bWVudFNlY3VyaXR5R3JvdXAgPSBuZXcgZWMyLlNlY3VyaXR5R3JvdXAodGhpcywgJ0RlcGxveW1lbnRJbnN0YW5jZVNlY3VyaXR5R3JvdXAnLCB7XG4gICAgICB2cGM6IHByb3BzLnZwYyxcbiAgICAgIGRlc2NyaXB0aW9uOiAnU2VjdXJpdHkgZ3JvdXAgZm9yIE1hdGVyaWFsIFJlY29nbml0aW9uIFNlcnZpY2UgZGVwbG95bWVudCBpbnN0YW5jZScsXG4gICAgICBhbGxvd0FsbE91dGJvdW5kOiB0cnVlLFxuICAgIH0pO1xuXG4gICAgLy8gQWxsb3cgU1NIIGFjY2VzcyBmcm9tIGFueXdoZXJlIChmb3IgdGVzdGluZyBwdXJwb3NlcylcbiAgICBkZXBsb3ltZW50U2VjdXJpdHlHcm91cC5hZGRJbmdyZXNzUnVsZShcbiAgICAgIGVjMi5QZWVyLmFueUlwdjQoKSxcbiAgICAgIGVjMi5Qb3J0LnRjcCgyMiksXG4gICAgICAnQWxsb3cgU1NIIGFjY2VzcydcbiAgICApO1xuXG4gICAgLy8gQWxsb3cgSFRUUCBhY2Nlc3MgZm9yIHRoZSBhcHBsaWNhdGlvblxuICAgIGRlcGxveW1lbnRTZWN1cml0eUdyb3VwLmFkZEluZ3Jlc3NSdWxlKFxuICAgICAgZWMyLlBlZXIuYW55SXB2NCgpLFxuICAgICAgZWMyLlBvcnQudGNwKDgwKSxcbiAgICAgICdBbGxvdyBIVFRQIGFjY2VzcydcbiAgICApO1xuXG4gICAgLy8gQWxsb3cgSFRUUFMgYWNjZXNzIGZvciB0aGUgYXBwbGljYXRpb25cbiAgICBkZXBsb3ltZW50U2VjdXJpdHlHcm91cC5hZGRJbmdyZXNzUnVsZShcbiAgICAgIGVjMi5QZWVyLmFueUlwdjQoKSxcbiAgICAgIGVjMi5Qb3J0LnRjcCg0NDMpLFxuICAgICAgJ0FsbG93IEhUVFBTIGFjY2VzcydcbiAgICApO1xuXG4gICAgLy8gQWxsb3cgY29udGFpbmVyIGV4cG9zZWQgNTAwMCBwb3J0XG4gICAgZGVwbG95bWVudFNlY3VyaXR5R3JvdXAuYWRkSW5ncmVzc1J1bGUoXG4gICAgICBlYzIuUGVlci5hbnlJcHY0KCksXG4gICAgICBlYzIuUG9ydC50Y3AoNTAwMCksXG4gICAgICAnQWxsb3cgYXBwbGljYXRpb24gYWNjZXNzJ1xuICAgICk7XG5cbiAgICAvLyBDcmVhdGUgdXNlciBkYXRhIHNjcmlwdCBmb3IgaW5zdGFuY2UgaW5pdGlhbGl6YXRpb24gKG5vdCBnZW5lcmF0ZSBzY3JpcHQgZmlsZSwgb25seSBiYXNpYyBlbnZpcm9ubWVudCBwcmVwYXJhdGlvbilcbiAgICBjb25zdCB1c2VyRGF0YSA9IGVjMi5Vc2VyRGF0YS5mb3JMaW51eCgpO1xuICAgIHVzZXJEYXRhLmFkZENvbW1hbmRzKFxuICAgICAgJyMhL2Jpbi9iYXNoJyxcbiAgICAgICd5dW0gdXBkYXRlIC15JyxcbiAgICAgICd5dW0gaW5zdGFsbCAteSBkb2NrZXInLFxuICAgICAgJ3N5c3RlbWN0bCBlbmFibGUgLS1ub3cgZG9ja2VyJ1xuICAgICk7XG5cbiAgICAvLyBDcmVhdGUgdGhlIEVDMiBpbnN0YW5jZSB3aXRoIHN0YWJsZSBjb25maWd1cmF0aW9uXG4gICAgdGhpcy5kZXBsb3ltZW50SW5zdGFuY2UgPSBuZXcgZWMyLkluc3RhbmNlKHRoaXMsICdEZXBsb3ltZW50SW5zdGFuY2UnLCB7XG4gICAgICB2cGM6IHByb3BzLnZwYyxcbiAgICAgIHZwY1N1Ym5ldHM6IHtcbiAgICAgICAgc3VibmV0VHlwZTogZWMyLlN1Ym5ldFR5cGUuUFVCTElDLFxuICAgICAgfSxcbiAgICAgIGluc3RhbmNlVHlwZTogZWMyLkluc3RhbmNlVHlwZS5vZihcbiAgICAgICAgZWMyLkluc3RhbmNlQ2xhc3MuVDMsXG4gICAgICAgIGVjMi5JbnN0YW5jZVNpemUuTUlDUk9cbiAgICAgICksXG4gICAgICBtYWNoaW5lSW1hZ2U6IG5ldyBlYzIuQW1hem9uTGludXhJbWFnZSh7XG4gICAgICAgIGdlbmVyYXRpb246IGVjMi5BbWF6b25MaW51eEdlbmVyYXRpb24uQU1BWk9OX0xJTlVYXzIsXG4gICAgICB9KSxcbiAgICAgIC8vIGtleU5hbWU6IHByb3BzLmtleU5hbWUsIC8vIFJlbW92ZWQgdG8gYXZvaWQga2V5IHBhaXIgZGVwZW5kZW5jeVxuICAgICAgcm9sZTogdGhpcy5pbnN0YW5jZVJvbGUsXG4gICAgICBzZWN1cml0eUdyb3VwOiBkZXBsb3ltZW50U2VjdXJpdHlHcm91cCxcbiAgICAgIHVzZXJEYXRhOiB1c2VyRGF0YSxcbiAgICAgIGJsb2NrRGV2aWNlczogW1xuICAgICAgICB7XG4gICAgICAgICAgZGV2aWNlTmFtZTogJy9kZXYveHZkYScsXG4gICAgICAgICAgdm9sdW1lOiBlYzIuQmxvY2tEZXZpY2VWb2x1bWUuZWJzKDIwLCB7XG4gICAgICAgICAgICB2b2x1bWVUeXBlOiBlYzIuRWJzRGV2aWNlVm9sdW1lVHlwZS5HUDMsXG4gICAgICAgICAgICBkZWxldGVPblRlcm1pbmF0aW9uOiBmYWxzZSwgLy8gUHJldmVudCBpbnN0YW5jZSBkZWxldGlvbiBmcm9tIGRlbGV0aW5nIEVCUyB2b2x1bWVcbiAgICAgICAgICB9KSxcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgfSk7XG5cbiAgICAvLyBFbmFibGUgaW5zdGFuY2UgdGVybWluYXRpb24gcHJvdGVjdGlvblxuICAgIGNvbnN0IGNmbkluc3RhbmNlID0gdGhpcy5kZXBsb3ltZW50SW5zdGFuY2Uubm9kZS5kZWZhdWx0Q2hpbGQgYXMgZWMyLkNmbkluc3RhbmNlO1xuICAgIGNmbkluc3RhbmNlLmFkZFByb3BlcnR5T3ZlcnJpZGUoJ0Rpc2FibGVBcGlUZXJtaW5hdGlvbicsIHRydWUpO1xuICAgIFxuICAgIC8vIFRhZyBpbnN0YW5jZSB3aXRoIGEgc3RhYmxlIE5hbWUgZm9yIGlkZW50aWZpY2F0aW9uXG4gICAgY2RrLlRhZ3Mub2YodGhpcy5kZXBsb3ltZW50SW5zdGFuY2UpLmFkZCgnTmFtZScsICdNYXRlcmlhbFJlY29nbml0aW9uU2VydmljZUluc3RhbmNlJyk7XG5cbiAgICAvLyBFbGFzdGljIElQIGlzIHByZS1wcm92aXNpb25lZCBvdXRzaWRlIENES1xuXG4gICAgLy8gVGFnIHRoZSBpbnN0YW5jZVxuICAgIGNkay5UYWdzLm9mKHRoaXMuZGVwbG95bWVudEluc3RhbmNlKS5hZGQoJ1Byb2plY3QnLCAnTWF0ZXJpYWxSZWNvZ25pdGlvblNlcnZpY2UnKTtcbiAgICBjZGsuVGFncy5vZih0aGlzLmRlcGxveW1lbnRJbnN0YW5jZSkuYWRkKCdFbnZpcm9ubWVudCcsICdEZXZlbG9wbWVudCcpO1xuICAgIGNkay5UYWdzLm9mKHRoaXMuZGVwbG95bWVudEluc3RhbmNlKS5hZGQoJ1B1cnBvc2UnLCAnRGVwbG95bWVudCcpO1xuICB9XG59XG4iXX0=