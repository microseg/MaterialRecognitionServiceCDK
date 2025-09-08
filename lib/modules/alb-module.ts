import * as cdk from 'aws-cdk-lib';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as targets from 'aws-cdk-lib/aws-elasticloadbalancingv2-targets';
import { Construct } from 'constructs';

export interface AlbModuleProps {
  vpc: ec2.IVpc;
  ec2Instance: ec2.Instance;
}

export class AlbModule extends Construct {
  public readonly loadBalancer: elbv2.ApplicationLoadBalancer;
  public readonly targetGroup: elbv2.ApplicationTargetGroup;

  constructor(scope: Construct, id: string, props: AlbModuleProps) {
    super(scope, id);

    this.loadBalancer = new elbv2.ApplicationLoadBalancer(this, 'MaterialRecognitionALB', {
      vpc: props.vpc,
      internetFacing: true,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      http2Enabled: true,
    });

    this.targetGroup = new elbv2.ApplicationTargetGroup(this, 'MaterialRecognitionTG', {
      vpc: props.vpc,
      targetType: elbv2.TargetType.INSTANCE,          
      protocol: elbv2.ApplicationProtocol.HTTP,       
      port: 5000,                                     
      healthCheck: {
        path: '/health',                              
        healthyHttpCodes: '200',
        interval: cdk.Duration.seconds(20),
        timeout: cdk.Duration.seconds(5),
        unhealthyThresholdCount: 2,
        healthyThresholdCount: 2,
      },
      deregistrationDelay: cdk.Duration.seconds(10),
    });

    this.targetGroup.addTarget(new targets.InstanceTarget(props.ec2Instance, 5000));

    const listener = this.loadBalancer.addListener('MaterialRecognitionListener', {
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
      defaultAction: elbv2.ListenerAction.forward([this.targetGroup]),
      open: true,
    });

    props.ec2Instance.connections.allowFrom(
      this.loadBalancer,
      ec2.Port.tcp(5000),
      'Allow ALB to reach app on 5000'
    );

    new cdk.CfnOutput(this, 'AlbDnsName', { value: this.loadBalancer.loadBalancerDnsName });
    cdk.Tags.of(this.loadBalancer).add('Project', 'MaterialRecognitionService');
    cdk.Tags.of(this.loadBalancer).add('Environment', 'Development');
  }
}
