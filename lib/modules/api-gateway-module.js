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
                loggingLevel: apigateway.MethodLoggingLevel.INFO,
                dataTraceEnabled: true,
                metricsEnabled: true,
            },
        });
        // Create integration for the EC2 instance using HTTP
        const integration = new apigateway.Integration({
            type: apigateway.IntegrationType.HTTP_PROXY,
            integrationHttpMethod: 'GET',
            options: {
                connectionType: apigateway.ConnectionType.INTERNET,
                requestParameters: {
                    'integration.request.path.proxy': 'method.request.path.proxy',
                },
            },
            uri: `http://${props.ec2Instance.instancePublicIp}:5000`,
        });
        // Add proxy resource to handle all paths
        const proxyResource = this.api.root.addProxy({
            defaultIntegration: integration,
            anyMethod: true,
        });
        // Add specific endpoints for better API design
        const healthResource = this.api.root.addResource('health');
        healthResource.addMethod('GET', new apigateway.Integration({
            type: apigateway.IntegrationType.HTTP_PROXY,
            integrationHttpMethod: 'GET',
            options: {
                connectionType: apigateway.ConnectionType.INTERNET,
            },
            uri: `http://${props.ec2Instance.instancePublicIp}:5000/health`,
        }));
        // Add calculator endpoints
        const addResource = this.api.root.addResource('add').addResource('{a}').addResource('{b}');
        addResource.addMethod('GET', new apigateway.Integration({
            type: apigateway.IntegrationType.HTTP_PROXY,
            integrationHttpMethod: 'GET',
            options: {
                connectionType: apigateway.ConnectionType.INTERNET,
            },
            uri: `http://${props.ec2Instance.instancePublicIp}:5000/add/{a}/{b}`,
        }));
        const multiplyResource = this.api.root.addResource('multiply').addResource('{a}').addResource('{b}');
        multiplyResource.addMethod('GET', new apigateway.Integration({
            type: apigateway.IntegrationType.HTTP_PROXY,
            integrationHttpMethod: 'GET',
            options: {
                connectionType: apigateway.ConnectionType.INTERNET,
            },
            uri: `http://${props.ec2Instance.instancePublicIp}:5000/multiply/{a}/{b}`,
        }));
        const subtractResource = this.api.root.addResource('subtract').addResource('{a}').addResource('{b}');
        subtractResource.addMethod('GET', new apigateway.Integration({
            type: apigateway.IntegrationType.HTTP_PROXY,
            integrationHttpMethod: 'GET',
            options: {
                connectionType: apigateway.ConnectionType.INTERNET,
            },
            uri: `http://${props.ec2Instance.instancePublicIp}:5000/subtract/{a}/{b}`,
        }));
        const divideResource = this.api.root.addResource('divide').addResource('{a}').addResource('{b}');
        divideResource.addMethod('GET', new apigateway.Integration({
            type: apigateway.IntegrationType.HTTP_PROXY,
            integrationHttpMethod: 'GET',
            options: {
                connectionType: apigateway.ConnectionType.INTERNET,
            },
            uri: `http://${props.ec2Instance.instancePublicIp}:5000/divide/{a}/{b}`,
        }));
        const calculateResource = this.api.root.addResource('calculate');
        calculateResource.addMethod('POST', new apigateway.Integration({
            type: apigateway.IntegrationType.HTTP_PROXY,
            integrationHttpMethod: 'POST',
            options: {
                connectionType: apigateway.ConnectionType.INTERNET,
            },
            uri: `http://${props.ec2Instance.instancePublicIp}:5000/calculate`,
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXBpLWdhdGV3YXktbW9kdWxlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiYXBpLWdhdGV3YXktbW9kdWxlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLG1DQUFtQztBQUNuQyx5REFBeUQ7QUFJekQsMkNBQXVDO0FBT3ZDLE1BQWEsZ0JBQWlCLFNBQVEsc0JBQVM7SUFHN0MsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUE0QjtRQUNwRSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBRWpCLHFCQUFxQjtRQUNyQixJQUFJLENBQUMsR0FBRyxHQUFHLElBQUksVUFBVSxDQUFDLE9BQU8sQ0FBQyxJQUFJLEVBQUUsd0JBQXdCLEVBQUU7WUFDaEUsV0FBVyxFQUFFLDRCQUE0QjtZQUN6QyxXQUFXLEVBQUUsOENBQThDO1lBQzNELDJCQUEyQixFQUFFO2dCQUMzQixZQUFZLEVBQUUsVUFBVSxDQUFDLElBQUksQ0FBQyxXQUFXO2dCQUN6QyxZQUFZLEVBQUUsVUFBVSxDQUFDLElBQUksQ0FBQyxXQUFXO2dCQUN6QyxZQUFZLEVBQUU7b0JBQ1osY0FBYztvQkFDZCxZQUFZO29CQUNaLGVBQWU7b0JBQ2YsV0FBVztvQkFDWCxzQkFBc0I7aUJBQ3ZCO2FBQ0Y7WUFDRCxhQUFhLEVBQUU7Z0JBQ2IsU0FBUyxFQUFFLE1BQU07Z0JBQ2pCLFlBQVksRUFBRSxVQUFVLENBQUMsa0JBQWtCLENBQUMsSUFBSTtnQkFDaEQsZ0JBQWdCLEVBQUUsSUFBSTtnQkFDdEIsY0FBYyxFQUFFLElBQUk7YUFDckI7U0FDRixDQUFDLENBQUM7UUFFSCxxREFBcUQ7UUFDckQsTUFBTSxXQUFXLEdBQUcsSUFBSSxVQUFVLENBQUMsV0FBVyxDQUFDO1lBQzdDLElBQUksRUFBRSxVQUFVLENBQUMsZUFBZSxDQUFDLFVBQVU7WUFDM0MscUJBQXFCLEVBQUUsS0FBSztZQUM1QixPQUFPLEVBQUU7Z0JBQ1AsY0FBYyxFQUFFLFVBQVUsQ0FBQyxj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VUFBVSxFQUFFLEdBQUc7YUFDaEI7WUFDRCxLQUFLLEVBQUU7Z0JBQ0wsS0FBSyxFQUFFLEtBQUs7Z0JBQ1osTUFBTSxFQUFFLFVBQVUsQ0FBQyxNQUFNLENBQUMsS0FBSzthQUNoQztTQUNGLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxXQUFXLENBQUM7WUFDZixLQUFLLEVBQUUsSUFBSSxDQUFDLEdBQUcsQ0FBQyxlQUFlO1NBQ2hDLENBQUMsQ0FBQztRQUVILHNCQUFzQjtRQUN0QixHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLFNBQVMsRUFBRSw0QkFBNEIsQ0FBQyxDQUFDO1FBQ25FLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsYUFBYSxFQUFFLGFBQWEsQ0FBQyxDQUFDO1FBQ3hELEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsU0FBUyxFQUFFLGFBQWEsQ0FBQyxDQUFDO0lBQ3RELENBQUM7Q0FDRjtBQXJJRCw0Q0FxSUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xyXG5pbXBvcnQgKiBhcyBhcGlnYXRld2F5IGZyb20gJ2F3cy1jZGstbGliL2F3cy1hcGlnYXRld2F5JztcclxuaW1wb3J0ICogYXMgZWMyIGZyb20gJ2F3cy1jZGstbGliL2F3cy1lYzInO1xyXG5pbXBvcnQgKiBhcyBlbGJ2MiBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZWxhc3RpY2xvYWRiYWxhbmNpbmd2Mic7XHJcbmltcG9ydCAqIGFzIGlhbSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtaWFtJztcclxuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XHJcblxyXG5leHBvcnQgaW50ZXJmYWNlIEFwaUdhdGV3YXlNb2R1bGVQcm9wcyB7XHJcbiAgdnBjOiBlYzIuSVZwYztcclxuICBlYzJJbnN0YW5jZTogZWMyLkluc3RhbmNlO1xyXG59XHJcblxyXG5leHBvcnQgY2xhc3MgQXBpR2F0ZXdheU1vZHVsZSBleHRlbmRzIENvbnN0cnVjdCB7XHJcbiAgcHVibGljIHJlYWRvbmx5IGFwaTogYXBpZ2F0ZXdheS5SZXN0QXBpO1xyXG5cclxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogQXBpR2F0ZXdheU1vZHVsZVByb3BzKSB7XHJcbiAgICBzdXBlcihzY29wZSwgaWQpO1xyXG5cclxuICAgIC8vIENyZWF0ZSBBUEkgR2F0ZXdheVxyXG4gICAgdGhpcy5hcGkgPSBuZXcgYXBpZ2F0ZXdheS5SZXN0QXBpKHRoaXMsICdNYXRlcmlhbFJlY29nbml0aW9uQXBpJywge1xyXG4gICAgICByZXN0QXBpTmFtZTogJ01hdGVyaWFsUmVjb2duaXRpb25TZXJ2aWNlJyxcclxuICAgICAgZGVzY3JpcHRpb246ICdBUEkgR2F0ZXdheSBmb3IgTWF0ZXJpYWwgUmVjb2duaXRpb24gU2VydmljZScsXHJcbiAgICAgIGRlZmF1bHRDb3JzUHJlZmxpZ2h0T3B0aW9uczoge1xyXG4gICAgICAgIGFsbG93T3JpZ2luczogYXBpZ2F0ZXdheS5Db3JzLkFMTF9PUklHSU5TLFxyXG4gICAgICAgIGFsbG93TWV0aG9kczogYXBpZ2F0ZXdheS5Db3JzLkFMTF9NRVRIT0RTLFxyXG4gICAgICAgIGFsbG93SGVhZGVyczogW1xyXG4gICAgICAgICAgJ0NvbnRlbnQtVHlwZScsXHJcbiAgICAgICAgICAnWC1BbXotRGF0ZScsXHJcbiAgICAgICAgICAnQXV0aG9yaXphdGlvbicsXHJcbiAgICAgICAgICAnWC1BcGktS2V5JyxcclxuICAgICAgICAgICdYLUFtei1TZWN1cml0eS1Ub2tlbicsXHJcbiAgICAgICAgXSxcclxuICAgICAgfSxcclxuICAgICAgZGVwbG95T3B0aW9uczoge1xyXG4gICAgICAgIHN0YWdlTmFtZTogJ3Byb2QnLFxyXG4gICAgICAgIGxvZ2dpbmdMZXZlbDogYXBpZ2F0ZXdheS5NZXRob2RMb2dnaW5nTGV2ZWwuSU5GTyxcclxuICAgICAgICBkYXRhVHJhY2VFbmFibGVkOiB0cnVlLFxyXG4gICAgICAgIG1ldHJpY3NFbmFibGVkOiB0cnVlLFxyXG4gICAgICB9LFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gQ3JlYXRlIGludGVncmF0aW9uIGZvciB0aGUgRUMyIGluc3RhbmNlIHVzaW5nIEhUVFBcclxuICAgIGNvbnN0IGludGVncmF0aW9uID0gbmV3IGFwaWdhdGV3YXkuSW50ZWdyYXRpb24oe1xyXG4gICAgICB0eXBlOiBhcGlnYXRld2F5LkludGVncmF0aW9uVHlwZS5IVFRQX1BST1hZLFxyXG4gICAgICBpbnRlZ3JhdGlvbkh0dHBNZXRob2Q6ICdHRVQnLFxyXG4gICAgICBvcHRpb25zOiB7XHJcbiAgICAgICAgY29ubmVjdGlvblR5cGU6IGFwaWdhdGV3YXkuQ29ubmVjdGlvblR5cGUuSU5URVJORVQsXHJcbiAgICAgICAgcmVxdWVzdFBhcmFtZXRlcnM6IHtcclxuICAgICAgICAgICdpbnRlZ3JhdGlvbi5yZXF1ZXN0LnBhdGgucHJveHknOiAnbWV0aG9kLnJlcXVlc3QucGF0aC5wcm94eScsXHJcbiAgICAgICAgfSxcclxuICAgICAgfSxcclxuICAgICAgdXJpOiBgaHR0cDovLyR7cHJvcHMuZWMySW5zdGFuY2UuaW5zdGFuY2VQdWJsaWNJcH06NTAwMGAsXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBBZGQgcHJveHkgcmVzb3VyY2UgdG8gaGFuZGxlIGFsbCBwYXRoc1xyXG4gICAgY29uc3QgcHJveHlSZXNvdXJjZSA9IHRoaXMuYXBpLnJvb3QuYWRkUHJveHkoe1xyXG4gICAgICBkZWZhdWx0SW50ZWdyYXRpb246IGludGVncmF0aW9uLFxyXG4gICAgICBhbnlNZXRob2Q6IHRydWUsXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBBZGQgc3BlY2lmaWMgZW5kcG9pbnRzIGZvciBiZXR0ZXIgQVBJIGRlc2lnblxyXG4gICAgY29uc3QgaGVhbHRoUmVzb3VyY2UgPSB0aGlzLmFwaS5yb290LmFkZFJlc291cmNlKCdoZWFsdGgnKTtcclxuICAgIGhlYWx0aFJlc291cmNlLmFkZE1ldGhvZCgnR0VUJywgbmV3IGFwaWdhdGV3YXkuSW50ZWdyYXRpb24oe1xyXG4gICAgICB0eXBlOiBhcGlnYXRld2F5LkludGVncmF0aW9uVHlwZS5IVFRQX1BST1hZLFxyXG4gICAgICBpbnRlZ3JhdGlvbkh0dHBNZXRob2Q6ICdHRVQnLFxyXG4gICAgICBvcHRpb25zOiB7XHJcbiAgICAgICAgY29ubmVjdGlvblR5cGU6IGFwaWdhdGV3YXkuQ29ubmVjdGlvblR5cGUuSU5URVJORVQsXHJcbiAgICAgIH0sXHJcbiAgICAgIHVyaTogYGh0dHA6Ly8ke3Byb3BzLmVjMkluc3RhbmNlLmluc3RhbmNlUHVibGljSXB9OjUwMDAvaGVhbHRoYCxcclxuICAgIH0pKTtcclxuXHJcbiAgICAvLyBBZGQgY2FsY3VsYXRvciBlbmRwb2ludHNcclxuICAgIGNvbnN0IGFkZFJlc291cmNlID0gdGhpcy5hcGkucm9vdC5hZGRSZXNvdXJjZSgnYWRkJykuYWRkUmVzb3VyY2UoJ3thfScpLmFkZFJlc291cmNlKCd7Yn0nKTtcclxuICAgIGFkZFJlc291cmNlLmFkZE1ldGhvZCgnR0VUJywgbmV3IGFwaWdhdGV3YXkuSW50ZWdyYXRpb24oe1xyXG4gICAgICB0eXBlOiBhcGlnYXRld2F5LkludGVncmF0aW9uVHlwZS5IVFRQX1BST1hZLFxyXG4gICAgICBpbnRlZ3JhdGlvbkh0dHBNZXRob2Q6ICdHRVQnLFxyXG4gICAgICBvcHRpb25zOiB7XHJcbiAgICAgICAgY29ubmVjdGlvblR5cGU6IGFwaWdhdGV3YXkuQ29ubmVjdGlvblR5cGUuSU5URVJORVQsXHJcbiAgICAgIH0sXHJcbiAgICAgIHVyaTogYGh0dHA6Ly8ke3Byb3BzLmVjMkluc3RhbmNlLmluc3RhbmNlUHVibGljSXB9OjUwMDAvYWRkL3thfS97Yn1gLFxyXG4gICAgfSkpO1xyXG5cclxuICAgIGNvbnN0IG11bHRpcGx5UmVzb3VyY2UgPSB0aGlzLmFwaS5yb290LmFkZFJlc291cmNlKCdtdWx0aXBseScpLmFkZFJlc291cmNlKCd7YX0nKS5hZGRSZXNvdXJjZSgne2J9Jyk7XHJcbiAgICBtdWx0aXBseVJlc291cmNlLmFkZE1ldGhvZCgnR0VUJywgbmV3IGFwaWdhdGV3YXkuSW50ZWdyYXRpb24oe1xyXG4gICAgICB0eXBlOiBhcGlnYXRld2F5LkludGVncmF0aW9uVHlwZS5IVFRQX1BST1hZLFxyXG4gICAgICBpbnRlZ3JhdGlvbkh0dHBNZXRob2Q6ICdHRVQnLFxyXG4gICAgICBvcHRpb25zOiB7XHJcbiAgICAgICAgY29ubmVjdGlvblR5cGU6IGFwaWdhdGV3YXkuQ29ubmVjdGlvblR5cGUuSU5URVJORVQsXHJcbiAgICAgIH0sXHJcbiAgICAgIHVyaTogYGh0dHA6Ly8ke3Byb3BzLmVjMkluc3RhbmNlLmluc3RhbmNlUHVibGljSXB9OjUwMDAvbXVsdGlwbHkve2F9L3tifWAsXHJcbiAgICB9KSk7XHJcblxyXG4gICAgY29uc3Qgc3VidHJhY3RSZXNvdXJjZSA9IHRoaXMuYXBpLnJvb3QuYWRkUmVzb3VyY2UoJ3N1YnRyYWN0JykuYWRkUmVzb3VyY2UoJ3thfScpLmFkZFJlc291cmNlKCd7Yn0nKTtcclxuICAgIHN1YnRyYWN0UmVzb3VyY2UuYWRkTWV0aG9kKCdHRVQnLCBuZXcgYXBpZ2F0ZXdheS5JbnRlZ3JhdGlvbih7XHJcbiAgICAgIHR5cGU6IGFwaWdhdGV3YXkuSW50ZWdyYXRpb25UeXBlLkhUVFBfUFJPWFksXHJcbiAgICAgIGludGVncmF0aW9uSHR0cE1ldGhvZDogJ0dFVCcsXHJcbiAgICAgIG9wdGlvbnM6IHtcclxuICAgICAgICBjb25uZWN0aW9uVHlwZTogYXBpZ2F0ZXdheS5Db25uZWN0aW9uVHlwZS5JTlRFUk5FVCxcclxuICAgICAgfSxcclxuICAgICAgdXJpOiBgaHR0cDovLyR7cHJvcHMuZWMySW5zdGFuY2UuaW5zdGFuY2VQdWJsaWNJcH06NTAwMC9zdWJ0cmFjdC97YX0ve2J9YCxcclxuICAgIH0pKTtcclxuXHJcbiAgICBjb25zdCBkaXZpZGVSZXNvdXJjZSA9IHRoaXMuYXBpLnJvb3QuYWRkUmVzb3VyY2UoJ2RpdmlkZScpLmFkZFJlc291cmNlKCd7YX0nKS5hZGRSZXNvdXJjZSgne2J9Jyk7XHJcbiAgICBkaXZpZGVSZXNvdXJjZS5hZGRNZXRob2QoJ0dFVCcsIG5ldyBhcGlnYXRld2F5LkludGVncmF0aW9uKHtcclxuICAgICAgdHlwZTogYXBpZ2F0ZXdheS5JbnRlZ3JhdGlvblR5cGUuSFRUUF9QUk9YWSxcclxuICAgICAgaW50ZWdyYXRpb25IdHRwTWV0aG9kOiAnR0VUJyxcclxuICAgICAgb3B0aW9uczoge1xyXG4gICAgICAgIGNvbm5lY3Rpb25UeXBlOiBhcGlnYXRld2F5LkNvbm5lY3Rpb25UeXBlLklOVEVSTkVULFxyXG4gICAgICB9LFxyXG4gICAgICB1cmk6IGBodHRwOi8vJHtwcm9wcy5lYzJJbnN0YW5jZS5pbnN0YW5jZVB1YmxpY0lwfTo1MDAwL2RpdmlkZS97YX0ve2J9YCxcclxuICAgIH0pKTtcclxuXHJcbiAgICBjb25zdCBjYWxjdWxhdGVSZXNvdXJjZSA9IHRoaXMuYXBpLnJvb3QuYWRkUmVzb3VyY2UoJ2NhbGN1bGF0ZScpO1xyXG4gICAgY2FsY3VsYXRlUmVzb3VyY2UuYWRkTWV0aG9kKCdQT1NUJywgbmV3IGFwaWdhdGV3YXkuSW50ZWdyYXRpb24oe1xyXG4gICAgICB0eXBlOiBhcGlnYXRld2F5LkludGVncmF0aW9uVHlwZS5IVFRQX1BST1hZLFxyXG4gICAgICBpbnRlZ3JhdGlvbkh0dHBNZXRob2Q6ICdQT1NUJyxcclxuICAgICAgb3B0aW9uczoge1xyXG4gICAgICAgIGNvbm5lY3Rpb25UeXBlOiBhcGlnYXRld2F5LkNvbm5lY3Rpb25UeXBlLklOVEVSTkVULFxyXG4gICAgICB9LFxyXG4gICAgICB1cmk6IGBodHRwOi8vJHtwcm9wcy5lYzJJbnN0YW5jZS5pbnN0YW5jZVB1YmxpY0lwfTo1MDAwL2NhbGN1bGF0ZWAsXHJcbiAgICB9KSk7XHJcblxyXG4gICAgLy8gQWRkIHVzYWdlIHBsYW4gZm9yIEFQSSBtYW5hZ2VtZW50XHJcbiAgICBjb25zdCBwbGFuID0gdGhpcy5hcGkuYWRkVXNhZ2VQbGFuKCdNYXRlcmlhbFJlY29nbml0aW9uVXNhZ2VQbGFuJywge1xyXG4gICAgICBuYW1lOiAnTWF0ZXJpYWxSZWNvZ25pdGlvblNlcnZpY2UnLFxyXG4gICAgICBkZXNjcmlwdGlvbjogJ1VzYWdlIHBsYW4gZm9yIE1hdGVyaWFsIFJlY29nbml0aW9uIFNlcnZpY2UnLFxyXG4gICAgICB0aHJvdHRsZToge1xyXG4gICAgICAgIHJhdGVMaW1pdDogMTAwLFxyXG4gICAgICAgIGJ1cnN0TGltaXQ6IDIwMCxcclxuICAgICAgfSxcclxuICAgICAgcXVvdGE6IHtcclxuICAgICAgICBsaW1pdDogMTAwMDAsXHJcbiAgICAgICAgcGVyaW9kOiBhcGlnYXRld2F5LlBlcmlvZC5NT05USCxcclxuICAgICAgfSxcclxuICAgIH0pO1xyXG5cclxuICAgIHBsYW4uYWRkQXBpU3RhZ2Uoe1xyXG4gICAgICBzdGFnZTogdGhpcy5hcGkuZGVwbG95bWVudFN0YWdlLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gVGFnIHRoZSBBUEkgR2F0ZXdheVxyXG4gICAgY2RrLlRhZ3Mub2YodGhpcy5hcGkpLmFkZCgnUHJvamVjdCcsICdNYXRlcmlhbFJlY29nbml0aW9uU2VydmljZScpO1xyXG4gICAgY2RrLlRhZ3Mub2YodGhpcy5hcGkpLmFkZCgnRW52aXJvbm1lbnQnLCAnRGV2ZWxvcG1lbnQnKTtcclxuICAgIGNkay5UYWdzLm9mKHRoaXMuYXBpKS5hZGQoJ1B1cnBvc2UnLCAnQVBJIEdhdGV3YXknKTtcclxuICB9XHJcbn1cclxuIl19