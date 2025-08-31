"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VpcModule = void 0;
const cdk = require("aws-cdk-lib");
const ec2 = require("aws-cdk-lib/aws-ec2");
const constructs_1 = require("constructs");
class VpcModule extends constructs_1.Construct {
    constructor(scope, id, props = {}) {
        super(scope, id);
        const { vpcCidr = '10.0.0.0/16', maxAzs = 2 } = props;
        // Create a VPC with both public and private subnets for future API Gateway support
        this.vpc = new ec2.Vpc(this, 'SimpleVpc', {
            ipAddresses: ec2.IpAddresses.cidr(vpcCidr),
            maxAzs: maxAzs,
            subnetConfiguration: [
                {
                    cidrMask: 24,
                    name: 'Public',
                    subnetType: ec2.SubnetType.PUBLIC,
                },
                {
                    cidrMask: 24,
                    name: 'Private',
                    subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
                },
            ],
            // Enable NAT Gateway for private subnets (required for API Gateway VPC Link)
            natGateways: 1, // Single NAT Gateway to save costs
        });
        // Tag the VPC
        cdk.Tags.of(this.vpc).add('Project', 'MaterialRecognitionService');
        cdk.Tags.of(this.vpc).add('Environment', 'Development');
        cdk.Tags.of(this.vpc).add('Purpose', 'SimpleDeployment');
    }
}
exports.VpcModule = VpcModule;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidnBjLW1vZHVsZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInZwYy1tb2R1bGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEsbUNBQW1DO0FBQ25DLDJDQUEyQztBQUMzQywyQ0FBdUM7QUFPdkMsTUFBYSxTQUFVLFNBQVEsc0JBQVM7SUFHdEMsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxRQUF3QixFQUFFO1FBQ2xFLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFFakIsTUFBTSxFQUFFLE9BQU8sR0FBRyxhQUFhLEVBQUUsTUFBTSxHQUFHLENBQUMsRUFBRSxHQUFHLEtBQUssQ0FBQztRQUV0RCxtRkFBbUY7UUFDbkYsSUFBSSxDQUFDLEdBQUcsR0FBRyxJQUFJLEdBQUcsQ0FBQyxHQUFHLENBQUMsSUFBSSxFQUFFLFdBQVcsRUFBRTtZQUN4QyxXQUFXLEVBQUUsR0FBRyxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDO1lBQzFDLE1BQU0sRUFBRSxNQUFNO1lBQ2QsbUJBQW1CLEVBQUU7Z0JBQ25CO29CQUNFLFFBQVEsRUFBRSxFQUFFO29CQUNaLElBQUksRUFBRSxRQUFRO29CQUNkLFVBQVUsRUFBRSxHQUFHLENBQUMsVUFBVSxDQUFDLE1BQU07aUJBQ2xDO2dCQUNEO29CQUNFLFFBQVEsRUFBRSxFQUFFO29CQUNaLElBQUksRUFBRSxTQUFTO29CQUNmLFVBQVUsRUFBRSxHQUFHLENBQUMsVUFBVSxDQUFDLG1CQUFtQjtpQkFDL0M7YUFDRjtZQUNELDZFQUE2RTtZQUM3RSxXQUFXLEVBQUUsQ0FBQyxFQUFFLG1DQUFtQztTQUNwRCxDQUFDLENBQUM7UUFFSCxjQUFjO1FBQ2QsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxTQUFTLEVBQUUsNEJBQTRCLENBQUMsQ0FBQztRQUNuRSxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLGFBQWEsRUFBRSxhQUFhLENBQUMsQ0FBQztRQUN4RCxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLFNBQVMsRUFBRSxrQkFBa0IsQ0FBQyxDQUFDO0lBQzNELENBQUM7Q0FDRjtBQWpDRCw4QkFpQ0MiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xyXG5pbXBvcnQgKiBhcyBlYzIgZnJvbSAnYXdzLWNkay1saWIvYXdzLWVjMic7XHJcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xyXG5cclxuZXhwb3J0IGludGVyZmFjZSBWcGNNb2R1bGVQcm9wcyB7XHJcbiAgdnBjQ2lkcj86IHN0cmluZztcclxuICBtYXhBenM/OiBudW1iZXI7XHJcbn1cclxuXHJcbmV4cG9ydCBjbGFzcyBWcGNNb2R1bGUgZXh0ZW5kcyBDb25zdHJ1Y3Qge1xyXG4gIHB1YmxpYyByZWFkb25seSB2cGM6IGVjMi5WcGM7XHJcblxyXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBWcGNNb2R1bGVQcm9wcyA9IHt9KSB7XHJcbiAgICBzdXBlcihzY29wZSwgaWQpO1xyXG5cclxuICAgIGNvbnN0IHsgdnBjQ2lkciA9ICcxMC4wLjAuMC8xNicsIG1heEF6cyA9IDIgfSA9IHByb3BzO1xyXG5cclxuICAgIC8vIENyZWF0ZSBhIFZQQyB3aXRoIGJvdGggcHVibGljIGFuZCBwcml2YXRlIHN1Ym5ldHMgZm9yIGZ1dHVyZSBBUEkgR2F0ZXdheSBzdXBwb3J0XHJcbiAgICB0aGlzLnZwYyA9IG5ldyBlYzIuVnBjKHRoaXMsICdTaW1wbGVWcGMnLCB7XHJcbiAgICAgIGlwQWRkcmVzc2VzOiBlYzIuSXBBZGRyZXNzZXMuY2lkcih2cGNDaWRyKSxcclxuICAgICAgbWF4QXpzOiBtYXhBenMsXHJcbiAgICAgIHN1Ym5ldENvbmZpZ3VyYXRpb246IFtcclxuICAgICAgICB7XHJcbiAgICAgICAgICBjaWRyTWFzazogMjQsXHJcbiAgICAgICAgICBuYW1lOiAnUHVibGljJyxcclxuICAgICAgICAgIHN1Ym5ldFR5cGU6IGVjMi5TdWJuZXRUeXBlLlBVQkxJQyxcclxuICAgICAgICB9LFxyXG4gICAgICAgIHtcclxuICAgICAgICAgIGNpZHJNYXNrOiAyNCxcclxuICAgICAgICAgIG5hbWU6ICdQcml2YXRlJyxcclxuICAgICAgICAgIHN1Ym5ldFR5cGU6IGVjMi5TdWJuZXRUeXBlLlBSSVZBVEVfV0lUSF9FR1JFU1MsXHJcbiAgICAgICAgfSxcclxuICAgICAgXSxcclxuICAgICAgLy8gRW5hYmxlIE5BVCBHYXRld2F5IGZvciBwcml2YXRlIHN1Ym5ldHMgKHJlcXVpcmVkIGZvciBBUEkgR2F0ZXdheSBWUEMgTGluaylcclxuICAgICAgbmF0R2F0ZXdheXM6IDEsIC8vIFNpbmdsZSBOQVQgR2F0ZXdheSB0byBzYXZlIGNvc3RzXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBUYWcgdGhlIFZQQ1xyXG4gICAgY2RrLlRhZ3Mub2YodGhpcy52cGMpLmFkZCgnUHJvamVjdCcsICdNYXRlcmlhbFJlY29nbml0aW9uU2VydmljZScpO1xyXG4gICAgY2RrLlRhZ3Mub2YodGhpcy52cGMpLmFkZCgnRW52aXJvbm1lbnQnLCAnRGV2ZWxvcG1lbnQnKTtcclxuICAgIGNkay5UYWdzLm9mKHRoaXMudnBjKS5hZGQoJ1B1cnBvc2UnLCAnU2ltcGxlRGVwbG95bWVudCcpO1xyXG4gIH1cclxufVxyXG4iXX0=