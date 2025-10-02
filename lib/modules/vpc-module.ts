import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

export interface VpcModuleProps {
  vpcCidr?: string;
  maxAzs?: number;
}

export class VpcModule extends Construct {
  public readonly vpc: ec2.Vpc;

  constructor(scope: Construct, id: string, props: VpcModuleProps = {}) {
    super(scope, id);

    const { vpcCidr = '10.0.0.0/16', maxAzs = 2 } = props;

    // Create a VPC with only public subnets to avoid NAT Gateway costs
    this.vpc = new ec2.Vpc(this, 'SimpleVpc', {
      ipAddresses: ec2.IpAddresses.cidr(vpcCidr),
      maxAzs: maxAzs,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
      ],
      // Disable NAT Gateway to save costs
      natGateways: 0,
    });

    // Tag the VPC
    cdk.Tags.of(this.vpc).add('Project', 'MaterialRecognitionService');
    cdk.Tags.of(this.vpc).add('Environment', 'Development');
    cdk.Tags.of(this.vpc).add('Purpose', 'SimpleDeployment');
    cdk.Tags.of(this.vpc).add('CostOptimization', 'NoNATGateway');
  }
}
