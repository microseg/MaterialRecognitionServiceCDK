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
        // Create API Gateway
        // const apiGatewayModule = new ApiGatewayModule(this, 'ApiGatewayModule', {
        //   vpc: vpcModule.vpc,
        //   ec2Instance: ec2Module.deploymentInstance,
        // });
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
        // new cdk.CfnOutput(this, 'ApiGatewayUrl', {
        //   value: apiGatewayModule.api.url,
        //   description: 'URL of the API Gateway endpoint',
        // });
        // new cdk.CfnOutput(this, 'ApiGatewayHealthUrl', {
        //   value: `${apiGatewayModule.api.url}health`,
        //   description: 'Health check endpoint URL',
        // });
    }
}
exports.MaterialRecognitionServiceStack = MaterialRecognitionServiceStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RhY2suanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJzdGFjay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQSxtQ0FBbUM7QUFHbkMsK0RBQTJEO0FBQzNELHFEQUFpRDtBQUNqRCxxREFBaUQ7QUFVakQsTUFBYSwrQkFBZ0MsU0FBUSxHQUFHLENBQUMsS0FBSztJQUM1RCxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQTJDO1FBQ25GLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRXhCLHNFQUFzRTtRQUN0RSxNQUFNLFNBQVMsR0FBRyxJQUFJLHNCQUFTLENBQUMsSUFBSSxFQUFFLFdBQVcsRUFBRTtZQUNqRCxPQUFPLEVBQUUsYUFBYTtZQUN0QixNQUFNLEVBQUUsQ0FBQztTQUNWLENBQUMsQ0FBQztRQUVRLDBDQUEwQztRQUM5QyxNQUFNLFNBQVMsR0FBRyxJQUFJLHNCQUFTLENBQUMsSUFBSSxFQUFFLFdBQVcsRUFBRTtZQUNqRCxHQUFHLEVBQUUsU0FBUyxDQUFDLEdBQUc7WUFDbEIsWUFBWSxFQUFFLFVBQVUsRUFBRSxnQ0FBZ0M7U0FDM0QsQ0FBQyxDQUFDO1FBRVYscUJBQXFCO1FBQ3JCLDRFQUE0RTtRQUM1RSx3QkFBd0I7UUFDeEIsK0NBQStDO1FBQy9DLE1BQU07UUFFTix3QkFBd0I7UUFDeEIsTUFBTSxjQUFjLEdBQUcsSUFBSSxnQ0FBYyxDQUFDLElBQUksRUFBRSxnQkFBZ0IsRUFBRTtZQUNoRSxvQkFBb0IsRUFBRSxLQUFLLENBQUMsb0JBQW9CO1lBQ2hELFdBQVcsRUFBRSxLQUFLLENBQUMsV0FBVztZQUM5QixVQUFVLEVBQUUsS0FBSyxDQUFDLFVBQVU7WUFDNUIsWUFBWSxFQUFFLEtBQUssQ0FBQyxZQUFZO1lBQ2hDLGtCQUFrQixFQUFFLFNBQVMsQ0FBQyxrQkFBa0I7WUFDaEQsR0FBRyxFQUFFLFNBQVMsQ0FBQyxHQUFHO1NBQ25CLENBQUMsQ0FBQztRQUVILCtCQUErQjtRQUMvQixJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLE9BQU8sRUFBRTtZQUMvQixLQUFLLEVBQUUsU0FBUyxDQUFDLEdBQUcsQ0FBQyxLQUFLO1lBQzFCLFdBQVcsRUFBRSw4Q0FBOEM7U0FDNUQsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxlQUFlLEVBQUU7WUFDdkMsS0FBSyxFQUFFLFNBQVMsQ0FBQyxHQUFHLENBQUMsYUFBYSxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDO1lBQzNFLFdBQVcsRUFBRSwyQkFBMkI7U0FDekMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxnQkFBZ0IsRUFBRTtZQUN4QyxLQUFLLEVBQUUsU0FBUyxDQUFDLEdBQUcsQ0FBQyxjQUFjLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUM7WUFDNUUsV0FBVyxFQUFFLDhEQUE4RDtTQUM1RSxDQUFDLENBQUM7UUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLHNCQUFzQixFQUFFO1lBQzlDLEtBQUssRUFBRSxTQUFTLENBQUMsa0JBQWtCLENBQUMsVUFBVTtZQUM5QyxXQUFXLEVBQUUsbUNBQW1DO1NBQ2pELENBQUMsQ0FBQztRQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsYUFBYSxFQUFFO1lBQ3JDLEtBQUssRUFBRSxXQUFXLElBQUksQ0FBQyxNQUFNLDREQUE0RCxjQUFjLENBQUMsUUFBUSxDQUFDLFlBQVksT0FBTztZQUNwSSxXQUFXLEVBQUUsZ0NBQWdDO1NBQzlDLENBQUMsQ0FBQztRQUVILDZDQUE2QztRQUM3QyxxQ0FBcUM7UUFDckMsb0RBQW9EO1FBQ3BELE1BQU07UUFFTixtREFBbUQ7UUFDbkQsZ0RBQWdEO1FBQ2hELDhDQUE4QztRQUM5QyxNQUFNO0lBQ1IsQ0FBQztDQUNGO0FBcEVELDBFQW9FQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XHJcbmltcG9ydCAqIGFzIGVjMiBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZWMyJztcclxuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XHJcbmltcG9ydCB7IFBpcGVsaW5lTW9kdWxlIH0gZnJvbSAnLi9tb2R1bGVzL3BpcGVsaW5lLW1vZHVsZSc7XHJcbmltcG9ydCB7IEVDMk1vZHVsZSB9IGZyb20gJy4vbW9kdWxlcy9lYzItbW9kdWxlJztcclxuaW1wb3J0IHsgVnBjTW9kdWxlIH0gZnJvbSAnLi9tb2R1bGVzL3ZwYy1tb2R1bGUnO1xyXG4vLyBpbXBvcnQgeyBBcGlHYXRld2F5TW9kdWxlIH0gZnJvbSAnLi9tb2R1bGVzL2FwaS1nYXRld2F5LW1vZHVsZSc7IC8vIFRlbXBvcmFyaWx5IGNvbW1lbnRlZCBvdXRcclxuXHJcbmV4cG9ydCBpbnRlcmZhY2UgTWF0ZXJpYWxSZWNvZ25pdGlvblNlcnZpY2VTdGFja1Byb3BzIGV4dGVuZHMgY2RrLlN0YWNrUHJvcHMge1xyXG4gIGdpdGh1YlRva2VuU2VjcmV0QXJuOiBzdHJpbmc7XHJcbiAgZ2l0aHViT3duZXI6IHN0cmluZztcclxuICBnaXRodWJSZXBvOiBzdHJpbmc7XHJcbiAgZ2l0aHViQnJhbmNoOiBzdHJpbmc7XHJcbn1cclxuXHJcbmV4cG9ydCBjbGFzcyBNYXRlcmlhbFJlY29nbml0aW9uU2VydmljZVN0YWNrIGV4dGVuZHMgY2RrLlN0YWNrIHtcclxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogTWF0ZXJpYWxSZWNvZ25pdGlvblNlcnZpY2VTdGFja1Byb3BzKSB7XHJcbiAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcclxuXHJcbiAgICAvLyBDcmVhdGUgVlBDIGluZnJhc3RydWN0dXJlIChzdXBwb3J0cyBmdXR1cmUgQVBJIEdhdGV3YXkgaW50ZWdyYXRpb24pXHJcbiAgICBjb25zdCB2cGNNb2R1bGUgPSBuZXcgVnBjTW9kdWxlKHRoaXMsICdWcGNNb2R1bGUnLCB7XHJcbiAgICAgIHZwY0NpZHI6ICcxMC4wLjAuMC8xNicsXHJcbiAgICAgIG1heEF6czogMixcclxuICAgIH0pO1xyXG5cclxuICAgICAgICAgICAgICAgLy8gQ3JlYXRlIEVDMiBpbmZyYXN0cnVjdHVyZSB1c2luZyB0aGUgVlBDXHJcbiAgICAgICAgICAgY29uc3QgZWMyTW9kdWxlID0gbmV3IEVDMk1vZHVsZSh0aGlzLCAnRUMyTW9kdWxlJywge1xyXG4gICAgICAgICAgICAgdnBjOiB2cGNNb2R1bGUudnBjLFxyXG4gICAgICAgICAgICAgaW5zdGFuY2VUeXBlOiAndDMubWljcm8nLCAvLyBDaGVhcGVzdCBpbnN0YW5jZSBmb3IgdGVzdGluZ1xyXG4gICAgICAgICAgIH0pO1xyXG5cclxuICAgIC8vIENyZWF0ZSBBUEkgR2F0ZXdheVxyXG4gICAgLy8gY29uc3QgYXBpR2F0ZXdheU1vZHVsZSA9IG5ldyBBcGlHYXRld2F5TW9kdWxlKHRoaXMsICdBcGlHYXRld2F5TW9kdWxlJywge1xyXG4gICAgLy8gICB2cGM6IHZwY01vZHVsZS52cGMsXHJcbiAgICAvLyAgIGVjMkluc3RhbmNlOiBlYzJNb2R1bGUuZGVwbG95bWVudEluc3RhbmNlLFxyXG4gICAgLy8gfSk7XHJcblxyXG4gICAgLy8gQ3JlYXRlIENJL0NEIHBpcGVsaW5lXHJcbiAgICBjb25zdCBwaXBlbGluZU1vZHVsZSA9IG5ldyBQaXBlbGluZU1vZHVsZSh0aGlzLCAnUGlwZWxpbmVNb2R1bGUnLCB7XHJcbiAgICAgIGdpdGh1YlRva2VuU2VjcmV0QXJuOiBwcm9wcy5naXRodWJUb2tlblNlY3JldEFybixcclxuICAgICAgZ2l0aHViT3duZXI6IHByb3BzLmdpdGh1Yk93bmVyLFxyXG4gICAgICBnaXRodWJSZXBvOiBwcm9wcy5naXRodWJSZXBvLFxyXG4gICAgICBnaXRodWJCcmFuY2g6IHByb3BzLmdpdGh1YkJyYW5jaCxcclxuICAgICAgZGVwbG95bWVudEluc3RhbmNlOiBlYzJNb2R1bGUuZGVwbG95bWVudEluc3RhbmNlLFxyXG4gICAgICB2cGM6IHZwY01vZHVsZS52cGMsXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBPdXRwdXQgaW1wb3J0YW50IGluZm9ybWF0aW9uXHJcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnVnBjSWQnLCB7XHJcbiAgICAgIHZhbHVlOiB2cGNNb2R1bGUudnBjLnZwY0lkLFxyXG4gICAgICBkZXNjcmlwdGlvbjogJ0lEIG9mIHRoZSBWUEMgY3JlYXRlZCBmb3IgdGhlIGluZnJhc3RydWN0dXJlJyxcclxuICAgIH0pO1xyXG5cclxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdQdWJsaWNTdWJuZXRzJywge1xyXG4gICAgICB2YWx1ZTogdnBjTW9kdWxlLnZwYy5wdWJsaWNTdWJuZXRzLm1hcChzdWJuZXQgPT4gc3VibmV0LnN1Ym5ldElkKS5qb2luKCcsJyksXHJcbiAgICAgIGRlc2NyaXB0aW9uOiAnSURzIG9mIHRoZSBwdWJsaWMgc3VibmV0cycsXHJcbiAgICB9KTtcclxuXHJcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnUHJpdmF0ZVN1Ym5ldHMnLCB7XHJcbiAgICAgIHZhbHVlOiB2cGNNb2R1bGUudnBjLnByaXZhdGVTdWJuZXRzLm1hcChzdWJuZXQgPT4gc3VibmV0LnN1Ym5ldElkKS5qb2luKCcsJyksXHJcbiAgICAgIGRlc2NyaXB0aW9uOiAnSURzIG9mIHRoZSBwcml2YXRlIHN1Ym5ldHMgKGZvciBmdXR1cmUgQVBJIEdhdGV3YXkgVlBDIExpbmspJyxcclxuICAgIH0pO1xyXG5cclxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdEZXBsb3ltZW50SW5zdGFuY2VJZCcsIHtcclxuICAgICAgdmFsdWU6IGVjMk1vZHVsZS5kZXBsb3ltZW50SW5zdGFuY2UuaW5zdGFuY2VJZCxcclxuICAgICAgZGVzY3JpcHRpb246ICdJRCBvZiB0aGUgZGVwbG95bWVudCBFQzIgaW5zdGFuY2UnLFxyXG4gICAgfSk7XHJcblxyXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1BpcGVsaW5lVXJsJywge1xyXG4gICAgICB2YWx1ZTogYGh0dHBzOi8vJHt0aGlzLnJlZ2lvbn0uY29uc29sZS5hd3MuYW1hem9uLmNvbS9jb2Rlc3VpdGUvY29kZXBpcGVsaW5lL3BpcGVsaW5lcy8ke3BpcGVsaW5lTW9kdWxlLnBpcGVsaW5lLnBpcGVsaW5lTmFtZX0vdmlld2AsXHJcbiAgICAgIGRlc2NyaXB0aW9uOiAnVVJMIHRvIHZpZXcgdGhlIENJL0NEIHBpcGVsaW5lJyxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdBcGlHYXRld2F5VXJsJywge1xyXG4gICAgLy8gICB2YWx1ZTogYXBpR2F0ZXdheU1vZHVsZS5hcGkudXJsLFxyXG4gICAgLy8gICBkZXNjcmlwdGlvbjogJ1VSTCBvZiB0aGUgQVBJIEdhdGV3YXkgZW5kcG9pbnQnLFxyXG4gICAgLy8gfSk7XHJcblxyXG4gICAgLy8gbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0FwaUdhdGV3YXlIZWFsdGhVcmwnLCB7XHJcbiAgICAvLyAgIHZhbHVlOiBgJHthcGlHYXRld2F5TW9kdWxlLmFwaS51cmx9aGVhbHRoYCxcclxuICAgIC8vICAgZGVzY3JpcHRpb246ICdIZWFsdGggY2hlY2sgZW5kcG9pbnQgVVJMJyxcclxuICAgIC8vIH0pO1xyXG4gIH1cclxufVxyXG4iXX0=