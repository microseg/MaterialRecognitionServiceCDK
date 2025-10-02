import * as cdk from 'aws-cdk-lib';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as targets from 'aws-cdk-lib/aws-elasticloadbalancingv2-targets';
import * as certificatemanager from 'aws-cdk-lib/aws-certificatemanager';
import { Construct } from 'constructs';

export interface AlbModuleProps {
  vpc: ec2.IVpc;
  ec2Instance: ec2.Instance;
  domainName?: string; // 自定义域名，如 'labpencil.com'
}

export class AlbModule extends Construct {
  public readonly loadBalancer: elbv2.ApplicationLoadBalancer;
  public readonly targetGroup: elbv2.ApplicationTargetGroup;
  public readonly certificate?: certificatemanager.ICertificate;

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
      port: 8080,                                     
      healthCheck: {
        path: '/',                              
        healthyHttpCodes: '200',
        interval: cdk.Duration.seconds(20),
        timeout: cdk.Duration.seconds(5),
        unhealthyThresholdCount: 2,
        healthyThresholdCount: 2,
      },
      deregistrationDelay: cdk.Duration.seconds(10),
    });

    this.targetGroup.addTarget(new targets.InstanceTarget(props.ec2Instance, 8080));

    // 如果提供了域名，创建SSL证书
    if (props.domainName) {
      this.certificate = new certificatemanager.Certificate(this, 'MaterialRecognitionCertificate', {
        domainName: props.domainName,
        validation: certificatemanager.CertificateValidation.fromDns(),
      });
    }

    // HTTP监听器 (端口80) - 重定向到HTTPS或直接转发
    const httpListener = this.loadBalancer.addListener('MaterialRecognitionHttpListener', {
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
      defaultAction: props.domainName 
        ? elbv2.ListenerAction.redirect({
            protocol: 'HTTPS',
            port: '443',
            permanent: true,
          })
        : elbv2.ListenerAction.forward([this.targetGroup]),
      open: true,
    });

    // HTTPS监听器 (端口443) - 如果提供了域名和证书
    if (props.domainName && this.certificate) {
      this.loadBalancer.addListener('MaterialRecognitionHttpsListener', {
        port: 443,
        protocol: elbv2.ApplicationProtocol.HTTPS,
        certificates: [this.certificate],
        defaultAction: elbv2.ListenerAction.forward([this.targetGroup]),
        open: true,
      });
    }

    props.ec2Instance.connections.allowFrom(
      this.loadBalancer,
      ec2.Port.tcp(8080),
      'Allow ALB to reach Nginx on 8080'
    );

    new cdk.CfnOutput(this, 'AlbDnsName', { value: this.loadBalancer.loadBalancerDnsName });
    
    // 如果配置了域名，输出相关信息
    if (props.domainName) {
      new cdk.CfnOutput(this, 'CustomDomainName', { 
        value: props.domainName,
        description: 'Custom domain name for the application'
      });
      
      new cdk.CfnOutput(this, 'DnsInstructions', {
        value: `Configure DNS: Add A record for ${props.domainName} pointing to ${this.loadBalancer.loadBalancerDnsName}`,
        description: 'DNS configuration instructions'
      });
    }
    
    cdk.Tags.of(this.loadBalancer).add('Project', 'MaterialRecognitionService');
    cdk.Tags.of(this.loadBalancer).add('Environment', 'Development');
  }
}
