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

    // Create Application Load Balancer
    this.loadBalancer = new elbv2.ApplicationLoadBalancer(this, 'MaterialRecognitionALB', {
      vpc: props.vpc,
      internetFacing: true,
      loadBalancerName: 'material-recognition-alb',
    });

    // Create target group
    this.targetGroup = new elbv2.ApplicationTargetGroup(this, 'MaterialRecognitionTargetGroup', {
      vpc: props.vpc,
      port: 5000,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.INSTANCE,
      healthCheck: {
        path: '/health',
        port: '5000',
        protocol: elbv2.Protocol.HTTP,
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
        timeout: cdk.Duration.seconds(5),
        interval: cdk.Duration.seconds(30),
      },
    });

    // Add EC2 instance to target group
    this.targetGroup.addTarget(new targets.InstanceTarget(props.ec2Instance));

    // Create listener
    const listener = this.loadBalancer.addListener('MaterialRecognitionListener', {
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
      defaultAction: elbv2.ListenerAction.forward([this.targetGroup]),
    });

    // Tag the ALB
    cdk.Tags.of(this.loadBalancer).add('Project', 'MaterialRecognitionService');
    cdk.Tags.of(this.loadBalancer).add('Environment', 'Development');
    cdk.Tags.of(this.loadBalancer).add('Purpose', 'Load Balancer');
  }
}
