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
      restApiName: 'MaterialRecognitionService',
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
        // disable logging and data tracing to avoid setting CloudWatch log role at account level
        loggingLevel: apigateway.MethodLoggingLevel.OFF,
        dataTraceEnabled: false,
        metricsEnabled: false,
      },
      cloudWatchRole: false,
    });

    // Create integration for the EC2 instance using HTTP with Elastic IP
    const integration = new apigateway.Integration({
      type: apigateway.IntegrationType.HTTP_PROXY,
      integrationHttpMethod: 'GET',
      options: {
        connectionType: apigateway.ConnectionType.INTERNET,
        requestParameters: {
          'integration.request.path.proxy': 'method.request.path.proxy',
        },
      },
      uri: `http://${props.targetHost}:80`,
    });

    // Remove wildcard proxy, define each route explicitly

    // Add specific endpoints for better API design
    const healthResource = this.api.root.addResource('health');
    healthResource.addMethod('GET', new apigateway.Integration({
      type: apigateway.IntegrationType.HTTP_PROXY,
      integrationHttpMethod: 'GET',
      options: {
        connectionType: apigateway.ConnectionType.INTERNET,
      },
      uri: `http://${props.targetHost}:80/health`,
    }));

    // Add calculator endpoints
    const addResource = this.api.root.addResource('add').addResource('{a}').addResource('{b}');
    addResource.addMethod('GET', new apigateway.Integration({
      type: apigateway.IntegrationType.HTTP_PROXY,
      integrationHttpMethod: 'GET',
      options: {
        connectionType: apigateway.ConnectionType.INTERNET,
        requestParameters: {
          'integration.request.path.a': 'method.request.path.a',
          'integration.request.path.b': 'method.request.path.b',
        },
      },
      uri: `http://${props.targetHost}:80/add/{a}/{b}`,
    }), {
      requestParameters: {
        'method.request.path.a': true,
        'method.request.path.b': true,
      },
    });

    const multiplyResource = this.api.root.addResource('multiply').addResource('{a}').addResource('{b}');
    multiplyResource.addMethod('GET', new apigateway.Integration({
      type: apigateway.IntegrationType.HTTP_PROXY,
      integrationHttpMethod: 'GET',
      options: {
        connectionType: apigateway.ConnectionType.INTERNET,
        requestParameters: {
          'integration.request.path.a': 'method.request.path.a',
          'integration.request.path.b': 'method.request.path.b',
        },
      },
      uri: `http://${props.targetHost}:80/multiply/{a}/{b}`,
    }), {
      requestParameters: {
        'method.request.path.a': true,
        'method.request.path.b': true,
      },
    });

    const subtractResource = this.api.root.addResource('subtract').addResource('{a}').addResource('{b}');
    subtractResource.addMethod('GET', new apigateway.Integration({
      type: apigateway.IntegrationType.HTTP_PROXY,
      integrationHttpMethod: 'GET',
      options: {
        connectionType: apigateway.ConnectionType.INTERNET,
        requestParameters: {
          'integration.request.path.a': 'method.request.path.a',
          'integration.request.path.b': 'method.request.path.b',
        },
      },
      uri: `http://${props.targetHost}:80/subtract/{a}/{b}`,
    }), {
      requestParameters: {
        'method.request.path.a': true,
        'method.request.path.b': true,
      },
    });

    const divideResource = this.api.root.addResource('divide').addResource('{a}').addResource('{b}');
    divideResource.addMethod('GET', new apigateway.Integration({
      type: apigateway.IntegrationType.HTTP_PROXY,
      integrationHttpMethod: 'GET',
      options: {
        connectionType: apigateway.ConnectionType.INTERNET,
        requestParameters: {
          'integration.request.path.a': 'method.request.path.a',
          'integration.request.path.b': 'method.request.path.b',
        },
      },
      uri: `http://${props.targetHost}:80/divide/{a}/{b}`,
    }), {
      requestParameters: {
        'method.request.path.a': true,
        'method.request.path.b': true,
      },
    });

    const calculateResource = this.api.root.addResource('calculate');
    calculateResource.addMethod('POST', new apigateway.Integration({
      type: apigateway.IntegrationType.HTTP_PROXY,
      integrationHttpMethod: 'POST',
      options: {
        connectionType: apigateway.ConnectionType.INTERNET,
      },
      uri: `http://${props.targetHost}:80/calculate`,
    }));

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
    cdk.Tags.of(this.api).add('Environment', 'Development');
    cdk.Tags.of(this.api).add('Purpose', 'API Gateway');
  }
}
