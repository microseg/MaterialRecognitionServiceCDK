"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MaterialRecognitionServiceStack = void 0;
const cdk = require("aws-cdk-lib");
const pipeline_module_1 = require("./modules/pipeline-module");
const ec2_module_1 = require("./modules/ec2-module");
const vpc_module_1 = require("./modules/vpc-module");
class MaterialRecognitionServiceStack extends cdk.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        // Create VPC infrastructure (supports future API Gateway integration)
        const vpcModule = new vpc_module_1.VpcModule(this, 'VpcModule', {
            vpcCidr: '10.0.0.0/16',
            maxAzs: 2,
        });
        // Create EC2 infrastructure using the VPC
        const ec2Module = new ec2_module_1.EC2Module(this, 'EC2Module', {
            vpc: vpcModule.vpc,
            instanceType: 't3.micro', // Cheapest instance for testing
        });
        // Create CI/CD pipeline
        const pipelineModule = new pipeline_module_1.PipelineModule(this, 'PipelineModule', {
            githubTokenSecretArn: props.githubTokenSecretArn,
            githubOwner: props.githubOwner,
            githubRepo: props.githubRepo,
            githubBranch: props.githubBranch,
            deploymentInstance: ec2Module.deploymentInstance,
            vpc: vpcModule.vpc,
        });
        // Output important information
        new cdk.CfnOutput(this, 'VpcId', {
            value: vpcModule.vpc.vpcId,
            description: 'ID of the VPC created for the infrastructure',
        });
        new cdk.CfnOutput(this, 'PublicSubnets', {
            value: vpcModule.vpc.publicSubnets.map(subnet => subnet.subnetId).join(','),
            description: 'IDs of the public subnets',
        });
        new cdk.CfnOutput(this, 'PrivateSubnets', {
            value: vpcModule.vpc.privateSubnets.map(subnet => subnet.subnetId).join(','),
            description: 'IDs of the private subnets (for future API Gateway VPC Link)',
        });
        new cdk.CfnOutput(this, 'DeploymentInstanceId', {
            value: ec2Module.deploymentInstance.instanceId,
            description: 'ID of the deployment EC2 instance',
        });
        new cdk.CfnOutput(this, 'PipelineUrl', {
            value: `https://${this.region}.console.aws.amazon.com/codesuite/codepipeline/pipelines/${pipelineModule.pipeline.pipelineName}/view`,
            description: 'URL to view the CI/CD pipeline',
        });
    }
}
exports.MaterialRecognitionServiceStack = MaterialRecognitionServiceStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RhY2suanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJzdGFjay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQSxtQ0FBbUM7QUFHbkMsK0RBQTJEO0FBQzNELHFEQUFpRDtBQUNqRCxxREFBaUQ7QUFTakQsTUFBYSwrQkFBZ0MsU0FBUSxHQUFHLENBQUMsS0FBSztJQUM1RCxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQTJDO1FBQ25GLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRXhCLHNFQUFzRTtRQUN0RSxNQUFNLFNBQVMsR0FBRyxJQUFJLHNCQUFTLENBQUMsSUFBSSxFQUFFLFdBQVcsRUFBRTtZQUNqRCxPQUFPLEVBQUUsYUFBYTtZQUN0QixNQUFNLEVBQUUsQ0FBQztTQUNWLENBQUMsQ0FBQztRQUVRLDBDQUEwQztRQUM5QyxNQUFNLFNBQVMsR0FBRyxJQUFJLHNCQUFTLENBQUMsSUFBSSxFQUFFLFdBQVcsRUFBRTtZQUNqRCxHQUFHLEVBQUUsU0FBUyxDQUFDLEdBQUc7WUFDbEIsWUFBWSxFQUFFLFVBQVUsRUFBRSxnQ0FBZ0M7U0FDM0QsQ0FBQyxDQUFDO1FBRVYsd0JBQXdCO1FBQ3hCLE1BQU0sY0FBYyxHQUFHLElBQUksZ0NBQWMsQ0FBQyxJQUFJLEVBQUUsZ0JBQWdCLEVBQUU7WUFDaEUsb0JBQW9CLEVBQUUsS0FBSyxDQUFDLG9CQUFvQjtZQUNoRCxXQUFXLEVBQUUsS0FBSyxDQUFDLFdBQVc7WUFDOUIsVUFBVSxFQUFFLEtBQUssQ0FBQyxVQUFVO1lBQzVCLFlBQVksRUFBRSxLQUFLLENBQUMsWUFBWTtZQUNoQyxrQkFBa0IsRUFBRSxTQUFTLENBQUMsa0JBQWtCO1lBQ2hELEdBQUcsRUFBRSxTQUFTLENBQUMsR0FBRztTQUNuQixDQUFDLENBQUM7UUFFSCwrQkFBK0I7UUFDL0IsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxPQUFPLEVBQUU7WUFDL0IsS0FBSyxFQUFFLFNBQVMsQ0FBQyxHQUFHLENBQUMsS0FBSztZQUMxQixXQUFXLEVBQUUsOENBQThDO1NBQzVELENBQUMsQ0FBQztRQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsZUFBZSxFQUFFO1lBQ3ZDLEtBQUssRUFBRSxTQUFTLENBQUMsR0FBRyxDQUFDLGFBQWEsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQztZQUMzRSxXQUFXLEVBQUUsMkJBQTJCO1NBQ3pDLENBQUMsQ0FBQztRQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsZ0JBQWdCLEVBQUU7WUFDeEMsS0FBSyxFQUFFLFNBQVMsQ0FBQyxHQUFHLENBQUMsY0FBYyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDO1lBQzVFLFdBQVcsRUFBRSw4REFBOEQ7U0FDNUUsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxzQkFBc0IsRUFBRTtZQUM5QyxLQUFLLEVBQUUsU0FBUyxDQUFDLGtCQUFrQixDQUFDLFVBQVU7WUFDOUMsV0FBVyxFQUFFLG1DQUFtQztTQUNqRCxDQUFDLENBQUM7UUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLGFBQWEsRUFBRTtZQUNyQyxLQUFLLEVBQUUsV0FBVyxJQUFJLENBQUMsTUFBTSw0REFBNEQsY0FBYyxDQUFDLFFBQVEsQ0FBQyxZQUFZLE9BQU87WUFDcEksV0FBVyxFQUFFLGdDQUFnQztTQUM5QyxDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUFwREQsMEVBb0RDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcclxuaW1wb3J0ICogYXMgZWMyIGZyb20gJ2F3cy1jZGstbGliL2F3cy1lYzInO1xyXG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcclxuaW1wb3J0IHsgUGlwZWxpbmVNb2R1bGUgfSBmcm9tICcuL21vZHVsZXMvcGlwZWxpbmUtbW9kdWxlJztcclxuaW1wb3J0IHsgRUMyTW9kdWxlIH0gZnJvbSAnLi9tb2R1bGVzL2VjMi1tb2R1bGUnO1xyXG5pbXBvcnQgeyBWcGNNb2R1bGUgfSBmcm9tICcuL21vZHVsZXMvdnBjLW1vZHVsZSc7XHJcblxyXG5leHBvcnQgaW50ZXJmYWNlIE1hdGVyaWFsUmVjb2duaXRpb25TZXJ2aWNlU3RhY2tQcm9wcyBleHRlbmRzIGNkay5TdGFja1Byb3BzIHtcclxuICBnaXRodWJUb2tlblNlY3JldEFybjogc3RyaW5nO1xyXG4gIGdpdGh1Yk93bmVyOiBzdHJpbmc7XHJcbiAgZ2l0aHViUmVwbzogc3RyaW5nO1xyXG4gIGdpdGh1YkJyYW5jaDogc3RyaW5nO1xyXG59XHJcblxyXG5leHBvcnQgY2xhc3MgTWF0ZXJpYWxSZWNvZ25pdGlvblNlcnZpY2VTdGFjayBleHRlbmRzIGNkay5TdGFjayB7XHJcbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IE1hdGVyaWFsUmVjb2duaXRpb25TZXJ2aWNlU3RhY2tQcm9wcykge1xyXG4gICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XHJcblxyXG4gICAgLy8gQ3JlYXRlIFZQQyBpbmZyYXN0cnVjdHVyZSAoc3VwcG9ydHMgZnV0dXJlIEFQSSBHYXRld2F5IGludGVncmF0aW9uKVxyXG4gICAgY29uc3QgdnBjTW9kdWxlID0gbmV3IFZwY01vZHVsZSh0aGlzLCAnVnBjTW9kdWxlJywge1xyXG4gICAgICB2cGNDaWRyOiAnMTAuMC4wLjAvMTYnLFxyXG4gICAgICBtYXhBenM6IDIsXHJcbiAgICB9KTtcclxuXHJcbiAgICAgICAgICAgICAgIC8vIENyZWF0ZSBFQzIgaW5mcmFzdHJ1Y3R1cmUgdXNpbmcgdGhlIFZQQ1xyXG4gICAgICAgICAgIGNvbnN0IGVjMk1vZHVsZSA9IG5ldyBFQzJNb2R1bGUodGhpcywgJ0VDMk1vZHVsZScsIHtcclxuICAgICAgICAgICAgIHZwYzogdnBjTW9kdWxlLnZwYyxcclxuICAgICAgICAgICAgIGluc3RhbmNlVHlwZTogJ3QzLm1pY3JvJywgLy8gQ2hlYXBlc3QgaW5zdGFuY2UgZm9yIHRlc3RpbmdcclxuICAgICAgICAgICB9KTtcclxuXHJcbiAgICAvLyBDcmVhdGUgQ0kvQ0QgcGlwZWxpbmVcclxuICAgIGNvbnN0IHBpcGVsaW5lTW9kdWxlID0gbmV3IFBpcGVsaW5lTW9kdWxlKHRoaXMsICdQaXBlbGluZU1vZHVsZScsIHtcclxuICAgICAgZ2l0aHViVG9rZW5TZWNyZXRBcm46IHByb3BzLmdpdGh1YlRva2VuU2VjcmV0QXJuLFxyXG4gICAgICBnaXRodWJPd25lcjogcHJvcHMuZ2l0aHViT3duZXIsXHJcbiAgICAgIGdpdGh1YlJlcG86IHByb3BzLmdpdGh1YlJlcG8sXHJcbiAgICAgIGdpdGh1YkJyYW5jaDogcHJvcHMuZ2l0aHViQnJhbmNoLFxyXG4gICAgICBkZXBsb3ltZW50SW5zdGFuY2U6IGVjMk1vZHVsZS5kZXBsb3ltZW50SW5zdGFuY2UsXHJcbiAgICAgIHZwYzogdnBjTW9kdWxlLnZwYyxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIE91dHB1dCBpbXBvcnRhbnQgaW5mb3JtYXRpb25cclxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdWcGNJZCcsIHtcclxuICAgICAgdmFsdWU6IHZwY01vZHVsZS52cGMudnBjSWQsXHJcbiAgICAgIGRlc2NyaXB0aW9uOiAnSUQgb2YgdGhlIFZQQyBjcmVhdGVkIGZvciB0aGUgaW5mcmFzdHJ1Y3R1cmUnLFxyXG4gICAgfSk7XHJcblxyXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1B1YmxpY1N1Ym5ldHMnLCB7XHJcbiAgICAgIHZhbHVlOiB2cGNNb2R1bGUudnBjLnB1YmxpY1N1Ym5ldHMubWFwKHN1Ym5ldCA9PiBzdWJuZXQuc3VibmV0SWQpLmpvaW4oJywnKSxcclxuICAgICAgZGVzY3JpcHRpb246ICdJRHMgb2YgdGhlIHB1YmxpYyBzdWJuZXRzJyxcclxuICAgIH0pO1xyXG5cclxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdQcml2YXRlU3VibmV0cycsIHtcclxuICAgICAgdmFsdWU6IHZwY01vZHVsZS52cGMucHJpdmF0ZVN1Ym5ldHMubWFwKHN1Ym5ldCA9PiBzdWJuZXQuc3VibmV0SWQpLmpvaW4oJywnKSxcclxuICAgICAgZGVzY3JpcHRpb246ICdJRHMgb2YgdGhlIHByaXZhdGUgc3VibmV0cyAoZm9yIGZ1dHVyZSBBUEkgR2F0ZXdheSBWUEMgTGluayknLFxyXG4gICAgfSk7XHJcblxyXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0RlcGxveW1lbnRJbnN0YW5jZUlkJywge1xyXG4gICAgICB2YWx1ZTogZWMyTW9kdWxlLmRlcGxveW1lbnRJbnN0YW5jZS5pbnN0YW5jZUlkLFxyXG4gICAgICBkZXNjcmlwdGlvbjogJ0lEIG9mIHRoZSBkZXBsb3ltZW50IEVDMiBpbnN0YW5jZScsXHJcbiAgICB9KTtcclxuXHJcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnUGlwZWxpbmVVcmwnLCB7XHJcbiAgICAgIHZhbHVlOiBgaHR0cHM6Ly8ke3RoaXMucmVnaW9ufS5jb25zb2xlLmF3cy5hbWF6b24uY29tL2NvZGVzdWl0ZS9jb2RlcGlwZWxpbmUvcGlwZWxpbmVzLyR7cGlwZWxpbmVNb2R1bGUucGlwZWxpbmUucGlwZWxpbmVOYW1lfS92aWV3YCxcclxuICAgICAgZGVzY3JpcHRpb246ICdVUkwgdG8gdmlldyB0aGUgQ0kvQ0QgcGlwZWxpbmUnLFxyXG4gICAgfSk7XHJcbiAgfVxyXG59XHJcbiJdfQ==