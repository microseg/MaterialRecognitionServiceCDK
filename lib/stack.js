"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MaterialRecognitionServiceStack = void 0;
const cdk = require("aws-cdk-lib");
const pipeline_module_1 = require("./modules/pipeline-module");
const ec2_module_1 = require("./modules/ec2-module");
const vpc_module_1 = require("./modules/vpc-module");
const api_gateway_module_1 = require("./modules/api-gateway-module"); // Enable API Gateway module
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
        // Create API Gateway pointing to fixed Elastic IP
        const apiGatewayModule = new api_gateway_module_1.ApiGatewayModule(this, 'ApiGatewayModule', {
            vpc: vpcModule.vpc,
            ec2Instance: ec2Module.deploymentInstance,
            targetHost: '18.208.10.108', // Use fixed Elastic IP, not dependent on instance reference
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
        // Elastic IP 输出移除，现通过外部已分配的固定EIP进行访问
        new cdk.CfnOutput(this, 'PipelineUrl', {
            value: `https://${this.region}.console.aws.amazon.com/codesuite/codepipeline/pipelines/${pipelineModule.pipeline.pipelineName}/view`,
            description: 'URL to view the CI/CD pipeline',
        });
        new cdk.CfnOutput(this, 'ApiGatewayUrl', {
            value: apiGatewayModule.api.url,
            description: 'URL of the API Gateway endpoint',
        });
        new cdk.CfnOutput(this, 'ApiGatewayHealthUrl', {
            value: `${apiGatewayModule.api.url}health`,
            description: 'Health check endpoint URL',
        });
    }
}
exports.MaterialRecognitionServiceStack = MaterialRecognitionServiceStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RhY2suanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJzdGFjay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQSxtQ0FBbUM7QUFHbkMsK0RBQTJEO0FBQzNELHFEQUFpRDtBQUNqRCxxREFBaUQ7QUFDakQscUVBQWdFLENBQUMsNEJBQTRCO0FBUzdGLE1BQWEsK0JBQWdDLFNBQVEsR0FBRyxDQUFDLEtBQUs7SUFDNUQsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUEyQztRQUNuRixLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUV4QixzRUFBc0U7UUFDdEUsTUFBTSxTQUFTLEdBQUcsSUFBSSxzQkFBUyxDQUFDLElBQUksRUFBRSxXQUFXLEVBQUU7WUFDakQsT0FBTyxFQUFFLGFBQWE7WUFDdEIsTUFBTSxFQUFFLENBQUM7U0FDVixDQUFDLENBQUM7UUFFSCwwQ0FBMEM7UUFDMUMsTUFBTSxTQUFTLEdBQUcsSUFBSSxzQkFBUyxDQUFDLElBQUksRUFBRSxXQUFXLEVBQUU7WUFDakQsR0FBRyxFQUFFLFNBQVMsQ0FBQyxHQUFHO1lBQ2xCLFlBQVksRUFBRSxVQUFVLEVBQUUsZ0NBQWdDO1NBQzNELENBQUMsQ0FBQztRQUVILGtEQUFrRDtRQUNsRCxNQUFNLGdCQUFnQixHQUFHLElBQUkscUNBQWdCLENBQUMsSUFBSSxFQUFFLGtCQUFrQixFQUFFO1lBQ3RFLEdBQUcsRUFBRSxTQUFTLENBQUMsR0FBRztZQUNsQixXQUFXLEVBQUUsU0FBUyxDQUFDLGtCQUFrQjtZQUN6QyxVQUFVLEVBQUUsZUFBZSxFQUFFLDREQUE0RDtTQUMxRixDQUFDLENBQUM7UUFFSCx3QkFBd0I7UUFDeEIsTUFBTSxjQUFjLEdBQUcsSUFBSSxnQ0FBYyxDQUFDLElBQUksRUFBRSxnQkFBZ0IsRUFBRTtZQUNoRSxvQkFBb0IsRUFBRSxLQUFLLENBQUMsb0JBQW9CO1lBQ2hELFdBQVcsRUFBRSxLQUFLLENBQUMsV0FBVztZQUM5QixVQUFVLEVBQUUsS0FBSyxDQUFDLFVBQVU7WUFDNUIsWUFBWSxFQUFFLEtBQUssQ0FBQyxZQUFZO1lBQ2hDLGtCQUFrQixFQUFFLFNBQVMsQ0FBQyxrQkFBa0I7WUFDaEQsR0FBRyxFQUFFLFNBQVMsQ0FBQyxHQUFHO1NBQ25CLENBQUMsQ0FBQztRQUVILCtCQUErQjtRQUMvQixJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLE9BQU8sRUFBRTtZQUMvQixLQUFLLEVBQUUsU0FBUyxDQUFDLEdBQUcsQ0FBQyxLQUFLO1lBQzFCLFdBQVcsRUFBRSw4Q0FBOEM7U0FDNUQsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxlQUFlLEVBQUU7WUFDdkMsS0FBSyxFQUFFLFNBQVMsQ0FBQyxHQUFHLENBQUMsYUFBYSxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDO1lBQzNFLFdBQVcsRUFBRSwyQkFBMkI7U0FDekMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxnQkFBZ0IsRUFBRTtZQUN4QyxLQUFLLEVBQUUsU0FBUyxDQUFDLEdBQUcsQ0FBQyxjQUFjLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUM7WUFDNUUsV0FBVyxFQUFFLDhEQUE4RDtTQUM1RSxDQUFDLENBQUM7UUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLHNCQUFzQixFQUFFO1lBQzlDLEtBQUssRUFBRSxTQUFTLENBQUMsa0JBQWtCLENBQUMsVUFBVTtZQUM5QyxXQUFXLEVBQUUsbUNBQW1DO1NBQ2pELENBQUMsQ0FBQztRQUVILHFDQUFxQztRQUVyQyxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLGFBQWEsRUFBRTtZQUNyQyxLQUFLLEVBQUUsV0FBVyxJQUFJLENBQUMsTUFBTSw0REFBNEQsY0FBYyxDQUFDLFFBQVEsQ0FBQyxZQUFZLE9BQU87WUFDcEksV0FBVyxFQUFFLGdDQUFnQztTQUM5QyxDQUFDLENBQUM7UUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLGVBQWUsRUFBRTtZQUN2QyxLQUFLLEVBQUUsZ0JBQWdCLENBQUMsR0FBRyxDQUFDLEdBQUc7WUFDL0IsV0FBVyxFQUFFLGlDQUFpQztTQUMvQyxDQUFDLENBQUM7UUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLHFCQUFxQixFQUFFO1lBQzdDLEtBQUssRUFBRSxHQUFHLGdCQUFnQixDQUFDLEdBQUcsQ0FBQyxHQUFHLFFBQVE7WUFDMUMsV0FBVyxFQUFFLDJCQUEyQjtTQUN6QyxDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUF2RUQsMEVBdUVDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcclxuaW1wb3J0ICogYXMgZWMyIGZyb20gJ2F3cy1jZGstbGliL2F3cy1lYzInO1xyXG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcclxuaW1wb3J0IHsgUGlwZWxpbmVNb2R1bGUgfSBmcm9tICcuL21vZHVsZXMvcGlwZWxpbmUtbW9kdWxlJztcclxuaW1wb3J0IHsgRUMyTW9kdWxlIH0gZnJvbSAnLi9tb2R1bGVzL2VjMi1tb2R1bGUnO1xyXG5pbXBvcnQgeyBWcGNNb2R1bGUgfSBmcm9tICcuL21vZHVsZXMvdnBjLW1vZHVsZSc7XHJcbmltcG9ydCB7IEFwaUdhdGV3YXlNb2R1bGUgfSBmcm9tICcuL21vZHVsZXMvYXBpLWdhdGV3YXktbW9kdWxlJzsgLy8gRW5hYmxlIEFQSSBHYXRld2F5IG1vZHVsZVxyXG5cclxuZXhwb3J0IGludGVyZmFjZSBNYXRlcmlhbFJlY29nbml0aW9uU2VydmljZVN0YWNrUHJvcHMgZXh0ZW5kcyBjZGsuU3RhY2tQcm9wcyB7XHJcbiAgZ2l0aHViVG9rZW5TZWNyZXRBcm46IHN0cmluZztcclxuICBnaXRodWJPd25lcjogc3RyaW5nO1xyXG4gIGdpdGh1YlJlcG86IHN0cmluZztcclxuICBnaXRodWJCcmFuY2g6IHN0cmluZztcclxufVxyXG5cclxuZXhwb3J0IGNsYXNzIE1hdGVyaWFsUmVjb2duaXRpb25TZXJ2aWNlU3RhY2sgZXh0ZW5kcyBjZGsuU3RhY2sge1xyXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBNYXRlcmlhbFJlY29nbml0aW9uU2VydmljZVN0YWNrUHJvcHMpIHtcclxuICAgIHN1cGVyKHNjb3BlLCBpZCwgcHJvcHMpO1xyXG5cclxuICAgIC8vIENyZWF0ZSBWUEMgaW5mcmFzdHJ1Y3R1cmUgKHN1cHBvcnRzIGZ1dHVyZSBBUEkgR2F0ZXdheSBpbnRlZ3JhdGlvbilcclxuICAgIGNvbnN0IHZwY01vZHVsZSA9IG5ldyBWcGNNb2R1bGUodGhpcywgJ1ZwY01vZHVsZScsIHtcclxuICAgICAgdnBjQ2lkcjogJzEwLjAuMC4wLzE2JyxcclxuICAgICAgbWF4QXpzOiAyLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gQ3JlYXRlIEVDMiBpbmZyYXN0cnVjdHVyZSB1c2luZyB0aGUgVlBDXHJcbiAgICBjb25zdCBlYzJNb2R1bGUgPSBuZXcgRUMyTW9kdWxlKHRoaXMsICdFQzJNb2R1bGUnLCB7XHJcbiAgICAgIHZwYzogdnBjTW9kdWxlLnZwYyxcclxuICAgICAgaW5zdGFuY2VUeXBlOiAndDMubWljcm8nLCAvLyBDaGVhcGVzdCBpbnN0YW5jZSBmb3IgdGVzdGluZ1xyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gQ3JlYXRlIEFQSSBHYXRld2F5IHBvaW50aW5nIHRvIGZpeGVkIEVsYXN0aWMgSVBcclxuICAgIGNvbnN0IGFwaUdhdGV3YXlNb2R1bGUgPSBuZXcgQXBpR2F0ZXdheU1vZHVsZSh0aGlzLCAnQXBpR2F0ZXdheU1vZHVsZScsIHtcclxuICAgICAgdnBjOiB2cGNNb2R1bGUudnBjLFxyXG4gICAgICBlYzJJbnN0YW5jZTogZWMyTW9kdWxlLmRlcGxveW1lbnRJbnN0YW5jZSxcclxuICAgICAgdGFyZ2V0SG9zdDogJzE4LjIwOC4xMC4xMDgnLCAvLyBVc2UgZml4ZWQgRWxhc3RpYyBJUCwgbm90IGRlcGVuZGVudCBvbiBpbnN0YW5jZSByZWZlcmVuY2VcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIENyZWF0ZSBDSS9DRCBwaXBlbGluZVxyXG4gICAgY29uc3QgcGlwZWxpbmVNb2R1bGUgPSBuZXcgUGlwZWxpbmVNb2R1bGUodGhpcywgJ1BpcGVsaW5lTW9kdWxlJywge1xyXG4gICAgICBnaXRodWJUb2tlblNlY3JldEFybjogcHJvcHMuZ2l0aHViVG9rZW5TZWNyZXRBcm4sXHJcbiAgICAgIGdpdGh1Yk93bmVyOiBwcm9wcy5naXRodWJPd25lcixcclxuICAgICAgZ2l0aHViUmVwbzogcHJvcHMuZ2l0aHViUmVwbyxcclxuICAgICAgZ2l0aHViQnJhbmNoOiBwcm9wcy5naXRodWJCcmFuY2gsXHJcbiAgICAgIGRlcGxveW1lbnRJbnN0YW5jZTogZWMyTW9kdWxlLmRlcGxveW1lbnRJbnN0YW5jZSxcclxuICAgICAgdnBjOiB2cGNNb2R1bGUudnBjLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gT3V0cHV0IGltcG9ydGFudCBpbmZvcm1hdGlvblxyXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1ZwY0lkJywge1xyXG4gICAgICB2YWx1ZTogdnBjTW9kdWxlLnZwYy52cGNJZCxcclxuICAgICAgZGVzY3JpcHRpb246ICdJRCBvZiB0aGUgVlBDIGNyZWF0ZWQgZm9yIHRoZSBpbmZyYXN0cnVjdHVyZScsXHJcbiAgICB9KTtcclxuXHJcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnUHVibGljU3VibmV0cycsIHtcclxuICAgICAgdmFsdWU6IHZwY01vZHVsZS52cGMucHVibGljU3VibmV0cy5tYXAoc3VibmV0ID0+IHN1Ym5ldC5zdWJuZXRJZCkuam9pbignLCcpLFxyXG4gICAgICBkZXNjcmlwdGlvbjogJ0lEcyBvZiB0aGUgcHVibGljIHN1Ym5ldHMnLFxyXG4gICAgfSk7XHJcblxyXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1ByaXZhdGVTdWJuZXRzJywge1xyXG4gICAgICB2YWx1ZTogdnBjTW9kdWxlLnZwYy5wcml2YXRlU3VibmV0cy5tYXAoc3VibmV0ID0+IHN1Ym5ldC5zdWJuZXRJZCkuam9pbignLCcpLFxyXG4gICAgICBkZXNjcmlwdGlvbjogJ0lEcyBvZiB0aGUgcHJpdmF0ZSBzdWJuZXRzIChmb3IgZnV0dXJlIEFQSSBHYXRld2F5IFZQQyBMaW5rKScsXHJcbiAgICB9KTtcclxuXHJcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnRGVwbG95bWVudEluc3RhbmNlSWQnLCB7XHJcbiAgICAgIHZhbHVlOiBlYzJNb2R1bGUuZGVwbG95bWVudEluc3RhbmNlLmluc3RhbmNlSWQsXHJcbiAgICAgIGRlc2NyaXB0aW9uOiAnSUQgb2YgdGhlIGRlcGxveW1lbnQgRUMyIGluc3RhbmNlJyxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIEVsYXN0aWMgSVAg6L6T5Ye656e76Zmk77yM546w6YCa6L+H5aSW6YOo5bey5YiG6YWN55qE5Zu65a6aRUlQ6L+b6KGM6K6/6ZeuXHJcblxyXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1BpcGVsaW5lVXJsJywge1xyXG4gICAgICB2YWx1ZTogYGh0dHBzOi8vJHt0aGlzLnJlZ2lvbn0uY29uc29sZS5hd3MuYW1hem9uLmNvbS9jb2Rlc3VpdGUvY29kZXBpcGVsaW5lL3BpcGVsaW5lcy8ke3BpcGVsaW5lTW9kdWxlLnBpcGVsaW5lLnBpcGVsaW5lTmFtZX0vdmlld2AsXHJcbiAgICAgIGRlc2NyaXB0aW9uOiAnVVJMIHRvIHZpZXcgdGhlIENJL0NEIHBpcGVsaW5lJyxcclxuICAgIH0pO1xyXG5cclxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdBcGlHYXRld2F5VXJsJywge1xyXG4gICAgICB2YWx1ZTogYXBpR2F0ZXdheU1vZHVsZS5hcGkudXJsLFxyXG4gICAgICBkZXNjcmlwdGlvbjogJ1VSTCBvZiB0aGUgQVBJIEdhdGV3YXkgZW5kcG9pbnQnLFxyXG4gICAgfSk7XHJcblxyXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0FwaUdhdGV3YXlIZWFsdGhVcmwnLCB7XHJcbiAgICAgIHZhbHVlOiBgJHthcGlHYXRld2F5TW9kdWxlLmFwaS51cmx9aGVhbHRoYCxcclxuICAgICAgZGVzY3JpcHRpb246ICdIZWFsdGggY2hlY2sgZW5kcG9pbnQgVVJMJyxcclxuICAgIH0pO1xyXG4gIH1cclxufVxyXG4iXX0=