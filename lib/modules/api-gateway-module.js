"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApiGatewayModule = void 0;
const cdk = require("aws-cdk-lib");
const apigateway = require("aws-cdk-lib/aws-apigateway");
const constructs_1 = require("constructs");
class ApiGatewayModule extends constructs_1.Construct {
    constructor(scope, id, props) {
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
exports.ApiGatewayModule = ApiGatewayModule;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXBpLWdhdGV3YXktbW9kdWxlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiYXBpLWdhdGV3YXktbW9kdWxlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLG1DQUFtQztBQUNuQyx5REFBeUQ7QUFJekQsMkNBQXVDO0FBUXZDLE1BQWEsZ0JBQWlCLFNBQVEsc0JBQVM7SUFHN0MsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUE0QjtRQUNwRSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBRWpCLHFCQUFxQjtRQUNyQixJQUFJLENBQUMsR0FBRyxHQUFHLElBQUksVUFBVSxDQUFDLE9BQU8sQ0FBQyxJQUFJLEVBQUUsd0JBQXdCLEVBQUU7WUFDaEUsV0FBVyxFQUFFLDRCQUE0QjtZQUN6QyxXQUFXLEVBQUUsOENBQThDO1lBQzNELDJCQUEyQixFQUFFO2dCQUMzQixZQUFZLEVBQUUsVUFBVSxDQUFDLElBQUksQ0FBQyxXQUFXO2dCQUN6QyxZQUFZLEVBQUUsVUFBVSxDQUFDLElBQUksQ0FBQyxXQUFXO2dCQUN6QyxZQUFZLEVBQUU7b0JBQ1osY0FBYztvQkFDZCxZQUFZO29CQUNaLGVBQWU7b0JBQ2YsV0FBVztvQkFDWCxzQkFBc0I7aUJBQ3ZCO2FBQ0Y7WUFDRCxhQUFhLEVBQUU7Z0JBQ2IsU0FBUyxFQUFFLE1BQU07Z0JBQ2pCLHlGQUF5RjtnQkFDekYsWUFBWSxFQUFFLFVBQVUsQ0FBQyxrQkFBa0IsQ0FBQyxHQUFHO2dCQUMvQyxnQkFBZ0IsRUFBRSxLQUFLO2dCQUN2QixjQUFjLEVBQUUsS0FBSzthQUN0QjtZQUNELGNBQWMsRUFBRSxLQUFLO1NBQ3RCLENBQUMsQ0FBQztRQUVILHFFQUFxRTtRQUNyRSxNQUFNLFdBQVcsR0FBRyxJQUFJLFVBQVUsQ0FBQyxXQUFXLENBQUM7WUFDN0MsSUFBSSxFQUFFLFVBQVUsQ0FBQyxlQUFlLENBQUMsVUFBVTtZQUMzQyxxQkFBcUIsRUFBRSxLQUFLO1lBQzVCLE9B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QUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxTQUFTLEVBQUUsYUFBYSxDQUFDLENBQUM7SUFDdEQsQ0FBQztDQUNGO0FBdktELDRDQXVLQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XHJcbmltcG9ydCAqIGFzIGFwaWdhdGV3YXkgZnJvbSAnYXdzLWNkay1saWIvYXdzLWFwaWdhdGV3YXknO1xyXG5pbXBvcnQgKiBhcyBlYzIgZnJvbSAnYXdzLWNkay1saWIvYXdzLWVjMic7XHJcbmltcG9ydCAqIGFzIGVsYnYyIGZyb20gJ2F3cy1jZGstbGliL2F3cy1lbGFzdGljbG9hZGJhbGFuY2luZ3YyJztcclxuaW1wb3J0ICogYXMgaWFtIGZyb20gJ2F3cy1jZGstbGliL2F3cy1pYW0nO1xyXG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcclxuXHJcbmV4cG9ydCBpbnRlcmZhY2UgQXBpR2F0ZXdheU1vZHVsZVByb3BzIHtcclxuICB2cGM6IGVjMi5JVnBjO1xyXG4gIGVjMkluc3RhbmNlOiBlYzIuSW5zdGFuY2U7XHJcbiAgdGFyZ2V0SG9zdDogc3RyaW5nOyAvLyBFSVAgb3IgZG9tYWluIG5hbWVcclxufVxyXG5cclxuZXhwb3J0IGNsYXNzIEFwaUdhdGV3YXlNb2R1bGUgZXh0ZW5kcyBDb25zdHJ1Y3Qge1xyXG4gIHB1YmxpYyByZWFkb25seSBhcGk6IGFwaWdhdGV3YXkuUmVzdEFwaTtcclxuXHJcbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IEFwaUdhdGV3YXlNb2R1bGVQcm9wcykge1xyXG4gICAgc3VwZXIoc2NvcGUsIGlkKTtcclxuXHJcbiAgICAvLyBDcmVhdGUgQVBJIEdhdGV3YXlcclxuICAgIHRoaXMuYXBpID0gbmV3IGFwaWdhdGV3YXkuUmVzdEFwaSh0aGlzLCAnTWF0ZXJpYWxSZWNvZ25pdGlvbkFwaScsIHtcclxuICAgICAgcmVzdEFwaU5hbWU6ICdNYXRlcmlhbFJlY29nbml0aW9uU2VydmljZScsXHJcbiAgICAgIGRlc2NyaXB0aW9uOiAnQVBJIEdhdGV3YXkgZm9yIE1hdGVyaWFsIFJlY29nbml0aW9uIFNlcnZpY2UnLFxyXG4gICAgICBkZWZhdWx0Q29yc1ByZWZsaWdodE9wdGlvbnM6IHtcclxuICAgICAgICBhbGxvd09yaWdpbnM6IGFwaWdhdGV3YXkuQ29ycy5BTExfT1JJR0lOUyxcclxuICAgICAgICBhbGxvd01ldGhvZHM6IGFwaWdhdGV3YXkuQ29ycy5BTExfTUVUSE9EUyxcclxuICAgICAgICBhbGxvd0hlYWRlcnM6IFtcclxuICAgICAgICAgICdDb250ZW50LVR5cGUnLFxyXG4gICAgICAgICAgJ1gtQW16LURhdGUnLFxyXG4gICAgICAgICAgJ0F1dGhvcml6YXRpb24nLFxyXG4gICAgICAgICAgJ1gtQXBpLUtleScsXHJcbiAgICAgICAgICAnWC1BbXotU2VjdXJpdHktVG9rZW4nLFxyXG4gICAgICAgIF0sXHJcbiAgICAgIH0sXHJcbiAgICAgIGRlcGxveU9wdGlvbnM6IHtcclxuICAgICAgICBzdGFnZU5hbWU6ICdwcm9kJyxcclxuICAgICAgICAvLyBkaXNhYmxlIGxvZ2dpbmcgYW5kIGRhdGEgdHJhY2luZyB0byBhdm9pZCBzZXR0aW5nIENsb3VkV2F0Y2ggbG9nIHJvbGUgYXQgYWNjb3VudCBsZXZlbFxyXG4gICAgICAgIGxvZ2dpbmdMZXZlbDogYXBpZ2F0ZXdheS5NZXRob2RMb2dnaW5nTGV2ZWwuT0ZGLFxyXG4gICAgICAgIGRhdGFUcmFjZUVuYWJsZWQ6IGZhbHNlLFxyXG4gICAgICAgIG1ldHJpY3NFbmFibGVkOiBmYWxzZSxcclxuICAgICAgfSxcclxuICAgICAgY2xvdWRXYXRjaFJvbGU6IGZhbHNlLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gQ3JlYXRlIGludGVncmF0aW9uIGZvciB0aGUgRUMyIGluc3RhbmNlIHVzaW5nIEhUVFAgd2l0aCBFbGFzdGljIElQXHJcbiAgICBjb25zdCBpbnRlZ3JhdGlvbiA9IG5ldyBhcGlnYXRld2F5LkludGVncmF0aW9uKHtcclxuICAgICAgdHlwZTogYXBpZ2F0ZXdheS5JbnRlZ3JhdGlvblR5cGUuSFRUUF9QUk9YWSxcclxuICAgICAgaW50ZWdyYXRpb25IdHRwTWV0aG9kOiAnR0VUJyxcclxuICAgICAgb3B0aW9uczoge1xyXG4gICAgICAgIGNvbm5lY3Rpb25UeXBlOiBhcGlnYXRld2F5LkNvbm5lY3Rpb25UeXBlLklOVEVSTkVULFxyXG4gICAgICAgIHJlcXVlc3RQYXJhbWV0ZXJzOiB7XHJcbiAgICAgICAgICAnaW50ZWdyYXRpb24ucmVxdWVzdC5wYXRoLnByb3h5JzogJ21ldGhvZC5yZXF1ZXN0LnBhdGgucHJveHknLFxyXG4gICAgICAgIH0sXHJcbiAgICAgIH0sXHJcbiAgICAgIHVyaTogYGh0dHA6Ly8ke3Byb3BzLnRhcmdldEhvc3R9OjgwYCxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIFJlbW92ZSB3aWxkY2FyZCBwcm94eSwgZGVmaW5lIGVhY2ggcm91dGUgZXhwbGljaXRseVxyXG5cclxuICAgIC8vIEFkZCBzcGVjaWZpYyBlbmRwb2ludHMgZm9yIGJldHRlciBBUEkgZGVzaWduXHJcbiAgICBjb25zdCBoZWFsdGhSZXNvdXJjZSA9IHRoaXMuYXBpLnJvb3QuYWRkUmVzb3VyY2UoJ2hlYWx0aCcpO1xyXG4gICAgaGVhbHRoUmVzb3VyY2UuYWRkTWV0aG9kKCdHRVQnLCBuZXcgYXBpZ2F0ZXdheS5JbnRlZ3JhdGlvbih7XHJcbiAgICAgIHR5cGU6IGFwaWdhdGV3YXkuSW50ZWdyYXRpb25UeXBlLkhUVFBfUFJPWFksXHJcbiAgICAgIGludGVncmF0aW9uSHR0cE1ldGhvZDogJ0dFVCcsXHJcbiAgICAgIG9wdGlvbnM6IHtcclxuICAgICAgICBjb25uZWN0aW9uVHlwZTogYXBpZ2F0ZXdheS5Db25uZWN0aW9uVHlwZS5JTlRFUk5FVCxcclxuICAgICAgfSxcclxuICAgICAgdXJpOiBgaHR0cDovLyR7cHJvcHMudGFyZ2V0SG9zdH06ODAvaGVhbHRoYCxcclxuICAgIH0pKTtcclxuXHJcbiAgICAvLyBBZGQgY2FsY3VsYXRvciBlbmRwb2ludHNcclxuICAgIGNvbnN0IGFkZFJlc291cmNlID0gdGhpcy5hcGkucm9vdC5hZGRSZXNvdXJjZSgnYWRkJykuYWRkUmVzb3VyY2UoJ3thfScpLmFkZFJlc291cmNlKCd7Yn0nKTtcclxuICAgIGFkZFJlc291cmNlLmFkZE1ldGhvZCgnR0VUJywgbmV3IGFwaWdhdGV3YXkuSW50ZWdyYXRpb24oe1xyXG4gICAgICB0eXBlOiBhcGlnYXRld2F5LkludGVncmF0aW9uVHlwZS5IVFRQX1BST1hZLFxyXG4gICAgICBpbnRlZ3JhdGlvbkh0dHBNZXRob2Q6ICdHRVQnLFxyXG4gICAgICBvcHRpb25zOiB7XHJcbiAgICAgICAgY29ubmVjdGlvblR5cGU6IGFwaWdhdGV3YXkuQ29ubmVjdGlvblR5cGUuSU5URVJORVQsXHJcbiAgICAgICAgcmVxdWVzdFBhcmFtZXRlcnM6IHtcclxuICAgICAgICAgICdpbnRlZ3JhdGlvbi5yZXF1ZXN0LnBhdGguYSc6ICdtZXRob2QucmVxdWVzdC5wYXRoLmEnLFxyXG4gICAgICAgICAgJ2ludGVncmF0aW9uLnJlcXVlc3QucGF0aC5iJzogJ21ldGhvZC5yZXF1ZXN0LnBhdGguYicsXHJcbiAgICAgICAgfSxcclxuICAgICAgfSxcclxuICAgICAgdXJpOiBgaHR0cDovLyR7cHJvcHMudGFyZ2V0SG9zdH06ODAvYWRkL3thfS97Yn1gLFxyXG4gICAgfSksIHtcclxuICAgICAgcmVxdWVzdFBhcmFtZXRlcnM6IHtcclxuICAgICAgICAnbWV0aG9kLnJlcXVlc3QucGF0aC5hJzogdHJ1ZSxcclxuICAgICAgICAnbWV0aG9kLnJlcXVlc3QucGF0aC5iJzogdHJ1ZSxcclxuICAgICAgfSxcclxuICAgIH0pO1xyXG5cclxuICAgIGNvbnN0IG11bHRpcGx5UmVzb3VyY2UgPSB0aGlzLmFwaS5yb290LmFkZFJlc291cmNlKCdtdWx0aXBseScpLmFkZFJlc291cmNlKCd7YX0nKS5hZGRSZXNvdXJjZSgne2J9Jyk7XHJcbiAgICBtdWx0aXBseVJlc291cmNlLmFkZE1ldGhvZCgnR0VUJywgbmV3IGFwaWdhdGV3YXkuSW50ZWdyYXRpb24oe1xyXG4gICAgICB0eXBlOiBhcGlnYXRld2F5LkludGVncmF0aW9uVHlwZS5IVFRQX1BST1hZLFxyXG4gICAgICBpbnRlZ3JhdGlvbkh0dHBNZXRob2Q6ICdHRVQnLFxyXG4gICAgICBvcHRpb25zOiB7XHJcbiAgICAgICAgY29ubmVjdGlvblR5cGU6IGFwaWdhdGV3YXkuQ29ubmVjdGlvblR5cGUuSU5URVJORVQsXHJcbiAgICAgICAgcmVxdWVzdFBhcmFtZXRlcnM6IHtcclxuICAgICAgICAgICdpbnRlZ3JhdGlvbi5yZXF1ZXN0LnBhdGguYSc6ICdtZXRob2QucmVxdWVzdC5wYXRoLmEnLFxyXG4gICAgICAgICAgJ2ludGVncmF0aW9uLnJlcXVlc3QucGF0aC5iJzogJ21ldGhvZC5yZXF1ZXN0LnBhdGguYicsXHJcbiAgICAgICAgfSxcclxuICAgICAgfSxcclxuICAgICAgdXJpOiBgaHR0cDovLyR7cHJvcHMudGFyZ2V0SG9zdH06ODAvbXVsdGlwbHkve2F9L3tifWAsXHJcbiAgICB9KSwge1xyXG4gICAgICByZXF1ZXN0UGFyYW1ldGVyczoge1xyXG4gICAgICAgICdtZXRob2QucmVxdWVzdC5wYXRoLmEnOiB0cnVlLFxyXG4gICAgICAgICdtZXRob2QucmVxdWVzdC5wYXRoLmInOiB0cnVlLFxyXG4gICAgICB9LFxyXG4gICAgfSk7XHJcblxyXG4gICAgY29uc3Qgc3VidHJhY3RSZXNvdXJjZSA9IHRoaXMuYXBpLnJvb3QuYWRkUmVzb3VyY2UoJ3N1YnRyYWN0JykuYWRkUmVzb3VyY2UoJ3thfScpLmFkZFJlc291cmNlKCd7Yn0nKTtcclxuICAgIHN1YnRyYWN0UmVzb3VyY2UuYWRkTWV0aG9kKCdHRVQnLCBuZXcgYXBpZ2F0ZXdheS5JbnRlZ3JhdGlvbih7XHJcbiAgICAgIHR5cGU6IGFwaWdhdGV3YXkuSW50ZWdyYXRpb25UeXBlLkhUVFBfUFJPWFksXHJcbiAgICAgIGludGVncmF0aW9uSHR0cE1ldGhvZDogJ0dFVCcsXHJcbiAgICAgIG9wdGlvbnM6IHtcclxuICAgICAgICBjb25uZWN0aW9uVHlwZTogYXBpZ2F0ZXdheS5Db25uZWN0aW9uVHlwZS5JTlRFUk5FVCxcclxuICAgICAgICByZXF1ZXN0UGFyYW1ldGVyczoge1xyXG4gICAgICAgICAgJ2ludGVncmF0aW9uLnJlcXVlc3QucGF0aC5hJzogJ21ldGhvZC5yZXF1ZXN0LnBhdGguYScsXHJcbiAgICAgICAgICAnaW50ZWdyYXRpb24ucmVxdWVzdC5wYXRoLmInOiAnbWV0aG9kLnJlcXVlc3QucGF0aC5iJyxcclxuICAgICAgICB9LFxyXG4gICAgICB9LFxyXG4gICAgICB1cmk6IGBodHRwOi8vJHtwcm9wcy50YXJnZXRIb3N0fTo4MC9zdWJ0cmFjdC97YX0ve2J9YCxcclxuICAgIH0pLCB7XHJcbiAgICAgIHJlcXVlc3RQYXJhbWV0ZXJzOiB7XHJcbiAgICAgICAgJ21ldGhvZC5yZXF1ZXN0LnBhdGguYSc6IHRydWUsXHJcbiAgICAgICAgJ21ldGhvZC5yZXF1ZXN0LnBhdGguYic6IHRydWUsXHJcbiAgICAgIH0sXHJcbiAgICB9KTtcclxuXHJcbiAgICBjb25zdCBkaXZpZGVSZXNvdXJjZSA9IHRoaXMuYXBpLnJvb3QuYWRkUmVzb3VyY2UoJ2RpdmlkZScpLmFkZFJlc291cmNlKCd7YX0nKS5hZGRSZXNvdXJjZSgne2J9Jyk7XHJcbiAgICBkaXZpZGVSZXNvdXJjZS5hZGRNZXRob2QoJ0dFVCcsIG5ldyBhcGlnYXRld2F5LkludGVncmF0aW9uKHtcclxuICAgICAgdHlwZTogYXBpZ2F0ZXdheS5JbnRlZ3JhdGlvblR5cGUuSFRUUF9QUk9YWSxcclxuICAgICAgaW50ZWdyYXRpb25IdHRwTWV0aG9kOiAnR0VUJyxcclxuICAgICAgb3B0aW9uczoge1xyXG4gICAgICAgIGNvbm5lY3Rpb25UeXBlOiBhcGlnYXRld2F5LkNvbm5lY3Rpb25UeXBlLklOVEVSTkVULFxyXG4gICAgICAgIHJlcXVlc3RQYXJhbWV0ZXJzOiB7XHJcbiAgICAgICAgICAnaW50ZWdyYXRpb24ucmVxdWVzdC5wYXRoLmEnOiAnbWV0aG9kLnJlcXVlc3QucGF0aC5hJyxcclxuICAgICAgICAgICdpbnRlZ3JhdGlvbi5yZXF1ZXN0LnBhdGguYic6ICdtZXRob2QucmVxdWVzdC5wYXRoLmInLFxyXG4gICAgICAgIH0sXHJcbiAgICAgIH0sXHJcbiAgICAgIHVyaTogYGh0dHA6Ly8ke3Byb3BzLnRhcmdldEhvc3R9OjgwL2RpdmlkZS97YX0ve2J9YCxcclxuICAgIH0pLCB7XHJcbiAgICAgIHJlcXVlc3RQYXJhbWV0ZXJzOiB7XHJcbiAgICAgICAgJ21ldGhvZC5yZXF1ZXN0LnBhdGguYSc6IHRydWUsXHJcbiAgICAgICAgJ21ldGhvZC5yZXF1ZXN0LnBhdGguYic6IHRydWUsXHJcbiAgICAgIH0sXHJcbiAgICB9KTtcclxuXHJcbiAgICBjb25zdCBjYWxjdWxhdGVSZXNvdXJjZSA9IHRoaXMuYXBpLnJvb3QuYWRkUmVzb3VyY2UoJ2NhbGN1bGF0ZScpO1xyXG4gICAgY2FsY3VsYXRlUmVzb3VyY2UuYWRkTWV0aG9kKCdQT1NUJywgbmV3IGFwaWdhdGV3YXkuSW50ZWdyYXRpb24oe1xyXG4gICAgICB0eXBlOiBhcGlnYXRld2F5LkludGVncmF0aW9uVHlwZS5IVFRQX1BST1hZLFxyXG4gICAgICBpbnRlZ3JhdGlvbkh0dHBNZXRob2Q6ICdQT1NUJyxcclxuICAgICAgb3B0aW9uczoge1xyXG4gICAgICAgIGNvbm5lY3Rpb25UeXBlOiBhcGlnYXRld2F5LkNvbm5lY3Rpb25UeXBlLklOVEVSTkVULFxyXG4gICAgICB9LFxyXG4gICAgICB1cmk6IGBodHRwOi8vJHtwcm9wcy50YXJnZXRIb3N0fTo4MC9jYWxjdWxhdGVgLFxyXG4gICAgfSkpO1xyXG5cclxuICAgIC8vIEFkZCB1c2FnZSBwbGFuIGZvciBBUEkgbWFuYWdlbWVudFxyXG4gICAgY29uc3QgcGxhbiA9IHRoaXMuYXBpLmFkZFVzYWdlUGxhbignTWF0ZXJpYWxSZWNvZ25pdGlvblVzYWdlUGxhbicsIHtcclxuICAgICAgbmFtZTogJ01hdGVyaWFsUmVjb2duaXRpb25TZXJ2aWNlJyxcclxuICAgICAgZGVzY3JpcHRpb246ICdVc2FnZSBwbGFuIGZvciBNYXRlcmlhbCBSZWNvZ25pdGlvbiBTZXJ2aWNlJyxcclxuICAgICAgdGhyb3R0bGU6IHtcclxuICAgICAgICByYXRlTGltaXQ6IDEwMCxcclxuICAgICAgICBidXJzdExpbWl0OiAyMDAsXHJcbiAgICAgIH0sXHJcbiAgICAgIHF1b3RhOiB7XHJcbiAgICAgICAgbGltaXQ6IDEwMDAwLFxyXG4gICAgICAgIHBlcmlvZDogYXBpZ2F0ZXdheS5QZXJpb2QuTU9OVEgsXHJcbiAgICAgIH0sXHJcbiAgICB9KTtcclxuXHJcbiAgICBwbGFuLmFkZEFwaVN0YWdlKHtcclxuICAgICAgc3RhZ2U6IHRoaXMuYXBpLmRlcGxveW1lbnRTdGFnZSxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIFRhZyB0aGUgQVBJIEdhdGV3YXlcclxuICAgIGNkay5UYWdzLm9mKHRoaXMuYXBpKS5hZGQoJ1Byb2plY3QnLCAnTWF0ZXJpYWxSZWNvZ25pdGlvblNlcnZpY2UnKTtcclxuICAgIGNkay5UYWdzLm9mKHRoaXMuYXBpKS5hZGQoJ0Vudmlyb25tZW50JywgJ0RldmVsb3BtZW50Jyk7XHJcbiAgICBjZGsuVGFncy5vZih0aGlzLmFwaSkuYWRkKCdQdXJwb3NlJywgJ0FQSSBHYXRld2F5Jyk7XHJcbiAgfVxyXG59XHJcbiJdfQ==