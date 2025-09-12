import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

export interface VpcModuleProps {
  vpcCidr?: string;
  maxAzs?: number;
  enableNatGateway?: boolean; // default true for prod, false to save costs in test
}

export class VpcModule extends Construct {
  public readonly vpc: ec2.Vpc;

  constructor(scope: Construct, id: string, props: VpcModuleProps = {}) {
    super(scope, id);

    const { vpcCidr = '10.0.0.0/16', maxAzs = 2, enableNatGateway = true } = props;

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
          subnetType: enableNatGateway ? ec2.SubnetType.PRIVATE_WITH_EGRESS : ec2.SubnetType.PRIVATE_ISOLATED,
        },
      ],
      // NAT Gateway for private subnets (turn off to save cost during tests)
      natGateways: enableNatGateway ? 1 : 0,
    });

    // Add Gateway Endpoints so isolated subnets can still reach AWS services without NAT
    // (safe to add even when NAT is enabled)
    this.vpc.addGatewayEndpoint('S3GatewayEndpoint', {
      service: ec2.GatewayVpcEndpointAwsService.S3,
      // default: all routes in this VPC, adequate for our use
    });

    this.vpc.addGatewayEndpoint('DynamoDbGatewayEndpoint', {
      service: ec2.GatewayVpcEndpointAwsService.DYNAMODB,
    });

    // Tag the VPC
    cdk.Tags.of(this.vpc).add('Project', 'MaterialRecognitionService');
    cdk.Tags.of(this.vpc).add('Environment', 'Development');
    cdk.Tags.of(this.vpc).add('Purpose', 'SimpleDeployment');
  }
}
