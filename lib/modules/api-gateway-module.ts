import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface ApiGatewayModuleProps {
  vpc: ec2.IVpc;
  ec2Instance: ec2.Instance;
  targetHost: string; // EIP or domain name
}

export class ApiGatewayModule extends Construct {
  public readonly api: apigateway.RestApi;

  constructor(scope: Construct, id: string, props: ApiGatewayModuleProps) {
    super(scope, id);

    // Create API Gateway
    this.api = new apigateway.RestApi(this, 'MaterialRecognitionApi', {
      restApiName: 'MaterialRecognitionPublicApi',
      description: 'API Gateway for Material Recognition Service',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: [
          'Content-Type',
          'X-Amz-Date',
          'Authorization',
          'X-Api-Key',
          'X-Amz-Security-Token',
        ],
      },
      deployOptions: {
        stageName: 'prod',
        loggingLevel: apigateway.MethodLoggingLevel.OFF,
        dataTraceEnabled: false,
        metricsEnabled: false,
      },
      cloudWatchRole: false,
    });

    const baseUrl = `http://${props.targetHost}`;

    // GET /health -> http://<alb-dns>/health
    this.api.root.addResource('health').addMethod(
      'GET',
      new apigateway.HttpIntegration(`${baseUrl}/health`, { proxy: true })
    );

    // POST /detect_from_s3 -> http://<alb-dns>/detect_from_s3
    this.api.root.addResource('detect_from_s3').addMethod(
      'POST',
      new apigateway.HttpIntegration(`${baseUrl}/detect_from_s3`, { proxy: true })
    );
    
    // Add usage plan for API management
    const plan = this.api.addUsagePlan('MaterialRecognitionUsagePlan', {
      name: 'MaterialRecognitionService',
      description: 'Usage plan for Material Recognition Service',
      throttle: {
        rateLimit: 100,
        burstLimit: 200,
      },
      quota: {
        limit: 10000,
        period: apigateway.Period.MONTH,
      },
    });

    plan.addApiStage({
      stage: this.api.deploymentStage,
    });

    // Tag the API Gateway
    cdk.Tags.of(this.api).add('Project', 'MaterialRecognitionService');
    cdk.Tags.of(this.api).add('Environment', 'Production');
    cdk.Tags.of(this.api).add('Purpose', 'API Gateway');
  }
}
