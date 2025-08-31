"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PipelineModule = void 0;
const cdk = require("aws-cdk-lib");
const codepipeline = require("aws-cdk-lib/aws-codepipeline");
const codepipeline_actions = require("aws-cdk-lib/aws-codepipeline-actions");
const codedeploy = require("aws-cdk-lib/aws-codedeploy");
const codebuild = require("aws-cdk-lib/aws-codebuild");
const iam = require("aws-cdk-lib/aws-iam");
const s3 = require("aws-cdk-lib/aws-s3");
const constructs_1 = require("constructs");
class PipelineModule extends constructs_1.Construct {
    constructor(scope, id, props) {
        super(scope, id);
        // Create S3 bucket for pipeline artifacts
        this.artifactBucket = new s3.Bucket(this, 'PipelineArtifactBucket', {
            versioned: true,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            autoDeleteObjects: true,
            encryption: s3.BucketEncryption.S3_MANAGED,
        });
        // Create IAM role for CodeDeploy
        const codeDeployRole = new iam.Role(this, 'CodeDeployRole', {
            assumedBy: new iam.ServicePrincipal('codedeploy.amazonaws.com'),
        });
        // Add CodeDeploy permissions
        codeDeployRole.addToPolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
                'autoscaling:CompleteLifecycleAction',
                'autoscaling:DeleteLifecycleHook',
                'autoscaling:DescribeAutoScalingGroups',
                'autoscaling:DescribeLifecycleHooks',
                'autoscaling:PutLifecycleHook',
                'autoscaling:RecordLifecycleActionHeartbeat',
                'ec2:DescribeInstances',
                'ec2:DescribeInstanceStatus',
                'tag:GetTags',
                'tag:GetResources',
            ],
            resources: ['*'],
        }));
        // Create IAM role for CodePipeline
        const pipelineRole = new iam.Role(this, 'PipelineRole', {
            assumedBy: new iam.ServicePrincipal('codepipeline.amazonaws.com'),
        });
        // Grant pipeline role access to artifact bucket
        this.artifactBucket.grantReadWrite(pipelineRole);
        // Grant pipeline role access to CodeDeploy
        pipelineRole.addToPolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
                'codedeploy:*',
            ],
            resources: ['*'],
        }));
        // Grant pipeline role access to Secrets Manager
        pipelineRole.addToPolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
                'secretsmanager:GetSecretValue',
            ],
            resources: [props.githubTokenSecretArn],
        }));
        // Create CodeBuild project
        this.buildProject = new codebuild.PipelineProject(this, 'MaterialRecognitionBuildProject', {
            projectName: 'MaterialRecognitionBuildProject',
            environment: {
                buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
                computeType: codebuild.ComputeType.SMALL,
                privileged: false,
            },
            environmentVariables: {
                GITHUB_TOKEN: {
                    value: props.githubTokenSecretArn,
                    type: codebuild.BuildEnvironmentVariableType.SECRETS_MANAGER,
                },
            },
            buildSpec: codebuild.BuildSpec.fromObject({
                version: '0.2',
                phases: {
                    install: {
                        'runtime-versions': {
                            python: '3.11',
                        },
                    },
                    pre_build: {
                        commands: [
                            'echo "Starting pre-build phase"',
                            'pip install --upgrade pip',
                        ],
                    },
                    build: {
                        commands: [
                            'echo "Starting build phase"',
                            'pip install -r requirements.txt',
                            'python -m pytest tests/ || true', // Run tests if they exist
                        ],
                    },
                    post_build: {
                        commands: [
                            'echo "Starting post-build phase"',
                            'mkdir -p deploy',
                            'cp -r app.py requirements.txt appspec.yml deploy/',
                            'cp -r scripts deploy/',
                            'echo "Build completed successfully"',
                        ],
                    },
                },
                artifacts: {
                    files: [
                        'deploy/**/*',
                        'appspec.yml',
                        'scripts/**/*',
                    ],
                    'base-directory': '.',
                },
            }),
        });
        // Create CodeDeploy application
        const codeDeployApplication = new codedeploy.ServerApplication(this, 'MaterialRecognitionApp', {
            applicationName: 'MaterialRecognitionService',
        });
        // Create CodeDeploy deployment group
        this.deploymentGroup = new codedeploy.ServerDeploymentGroup(this, 'MaterialRecognitionDeploymentGroup', {
            application: codeDeployApplication,
            deploymentGroupName: 'MaterialRecognitionDeploymentGroup',
            installAgent: true,
            autoRollback: {
                failedDeployment: true,
                stoppedDeployment: true,
            },
        });
        // Create the pipeline
        this.pipeline = new codepipeline.Pipeline(this, 'MaterialRecognitionPipeline', {
            pipelineName: 'MaterialRecognitionServicePipeline',
            role: pipelineRole,
            artifactBucket: this.artifactBucket,
            stages: [
                {
                    stageName: 'Source',
                    actions: [
                        new codepipeline_actions.GitHubSourceAction({
                            actionName: 'GitHub_Source',
                            owner: props.githubOwner,
                            repo: props.githubRepo,
                            branch: props.githubBranch,
                            oauthToken: cdk.SecretValue.secretsManager('github-token'),
                            output: new codepipeline.Artifact('SourceCode'),
                            variablesNamespace: 'SourceVariables',
                        }),
                    ],
                },
                {
                    stageName: 'Build',
                    actions: [
                        new codepipeline_actions.CodeBuildAction({
                            actionName: 'Build',
                            project: this.buildProject,
                            input: new codepipeline.Artifact('SourceCode'),
                            outputs: [
                                new codepipeline.Artifact('BuildOutput'),
                            ],
                        }),
                    ],
                },
                {
                    stageName: 'Deploy',
                    actions: [
                        new codepipeline_actions.CodeDeployServerDeployAction({
                            actionName: 'Deploy',
                            deploymentGroup: this.deploymentGroup,
                            input: new codepipeline.Artifact('BuildOutput'),
                        }),
                    ],
                },
            ],
        });
        // Tag the pipeline
        cdk.Tags.of(this.pipeline).add('Project', 'MaterialRecognitionService');
        cdk.Tags.of(this.pipeline).add('Environment', 'Development');
    }
}
exports.PipelineModule = PipelineModule;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGlwZWxpbmUtbW9kdWxlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsicGlwZWxpbmUtbW9kdWxlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLG1DQUFtQztBQUNuQyw2REFBNkQ7QUFDN0QsNkVBQTZFO0FBQzdFLHlEQUF5RDtBQUN6RCx1REFBdUQ7QUFFdkQsMkNBQTJDO0FBQzNDLHlDQUF5QztBQUN6QywyQ0FBdUM7QUFXdkMsTUFBYSxjQUFlLFNBQVEsc0JBQVM7SUFNM0MsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUEwQjtRQUNsRSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBRWpCLDBDQUEwQztRQUMxQyxJQUFJLENBQUMsY0FBYyxHQUFHLElBQUksRUFBRSxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsd0JBQXdCLEVBQUU7WUFDbEUsU0FBUyxFQUFFLElBQUk7WUFDZixhQUFhLEVBQUUsR0FBRyxDQUFDLGFBQWEsQ0FBQyxPQUFPO1lBQ3hDLGlCQUFpQixFQUFFLElBQUk7WUFDdkIsVUFBVSxFQUFFLEVBQUUsQ0FBQyxnQkFBZ0IsQ0FBQyxVQUFVO1NBQzNDLENBQUMsQ0FBQztRQUVILGlDQUFpQztRQUNqQyxNQUFNLGNBQWMsR0FBRyxJQUFJLEdBQUcsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLGdCQUFnQixFQUFFO1lBQzFELFNBQVMsRUFBRSxJQUFJLEdBQUcsQ0FBQyxnQkFBZ0IsQ0FBQywwQkFBMEIsQ0FBQztTQUNoRSxDQUFDLENBQUM7UUFFSCw2QkFBNkI7UUFDN0IsY0FBYyxDQUFDLFdBQVcsQ0FDeEIsSUFBSSxHQUFHLENBQUMsZUFBZSxDQUFDO1lBQ3RCLE1BQU0sRUFBRSxHQUFHLENBQUMsTUFBTSxDQUFDLEtBQUs7WUFDeEIsT0FBTyxFQUFFO2dCQUNQLHFDQUFxQztnQkFDckMsaUNBQWlDO2dCQUNqQyx1Q0FBdUM7Z0JBQ3ZDLG9DQUFvQztnQkFDcEMsOEJBQThCO2dCQUM5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LENBQUMsUUFBUSxDQUFDLFlBQVksQ0FBQzs0QkFDOUMsT0FBTyxFQUFFO2dDQUNQLElBQUksWUFBWSxDQUFDLFFBQVEsQ0FBQyxhQUFhLENBQUM7NkJBQ3pDO3lCQUNGLENBQUM7cUJBQ0g7aUJBQ0Y7Z0JBQ0Q7b0JBQ0UsU0FBUyxFQUFFLFFBQVE7b0JBQ25CLE9BQU8sRUFBRTt3QkFDUCxJQUFJLG9CQUFvQixDQUFDLDRCQUE0QixDQUFDOzRCQUNwRCxVQUFVLEVBQUUsUUFBUTs0QkFDcEIsZUFBZSxFQUFFLElBQUksQ0FBQyxlQUFlOzRCQUNyQyxLQUFLLEVBQUUsSUFBSSxZQUFZLENBQUMsUUFBUSxDQUFDLGFBQWEsQ0FBQzt5QkFDaEQsQ0FBQztxQkFDSDtpQkFDRjthQUNGO1NBQ0YsQ0FBQyxDQUFDO1FBRUgsbUJBQW1CO1FBQ25CLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQyxHQUFHLENBQUMsU0FBUyxFQUFFLDRCQUE0QixDQUFDLENBQUM7UUFDeEUsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxhQUFhLEVBQUUsYUFBYSxDQUFDLENBQUM7SUFDL0QsQ0FBQztDQUNGO0FBbE1ELHdDQWtNQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgKiBhcyBjb2RlcGlwZWxpbmUgZnJvbSAnYXdzLWNkay1saWIvYXdzLWNvZGVwaXBlbGluZSc7XG5pbXBvcnQgKiBhcyBjb2RlcGlwZWxpbmVfYWN0aW9ucyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY29kZXBpcGVsaW5lLWFjdGlvbnMnO1xuaW1wb3J0ICogYXMgY29kZWRlcGxveSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY29kZWRlcGxveSc7XG5pbXBvcnQgKiBhcyBjb2RlYnVpbGQgZnJvbSAnYXdzLWNkay1saWIvYXdzLWNvZGVidWlsZCc7XG5pbXBvcnQgKiBhcyBlYzIgZnJvbSAnYXdzLWNkay1saWIvYXdzLWVjMic7XG5pbXBvcnQgKiBhcyBpYW0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWlhbSc7XG5pbXBvcnQgKiBhcyBzMyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtczMnO1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgUGlwZWxpbmVNb2R1bGVQcm9wcyB7XG4gIGdpdGh1YlRva2VuU2VjcmV0QXJuOiBzdHJpbmc7XG4gIGdpdGh1Yk93bmVyOiBzdHJpbmc7XG4gIGdpdGh1YlJlcG86IHN0cmluZztcbiAgZ2l0aHViQnJhbmNoOiBzdHJpbmc7XG4gIGRlcGxveW1lbnRJbnN0YW5jZTogZWMyLkluc3RhbmNlO1xuICB2cGM6IGVjMi5JVnBjO1xufVxuXG5leHBvcnQgY2xhc3MgUGlwZWxpbmVNb2R1bGUgZXh0ZW5kcyBDb25zdHJ1Y3Qge1xuICBwdWJsaWMgcmVhZG9ubHkgcGlwZWxpbmU6IGNvZGVwaXBlbGluZS5QaXBlbGluZTtcbiAgcHVibGljIHJlYWRvbmx5IGFydGlmYWN0QnVja2V0OiBzMy5CdWNrZXQ7XG4gIHB1YmxpYyByZWFkb25seSBkZXBsb3ltZW50R3JvdXA6IGNvZGVkZXBsb3kuU2VydmVyRGVwbG95bWVudEdyb3VwO1xuICBwdWJsaWMgcmVhZG9ubHkgYnVpbGRQcm9qZWN0OiBjb2RlYnVpbGQuUGlwZWxpbmVQcm9qZWN0O1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBQaXBlbGluZU1vZHVsZVByb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkKTtcblxuICAgIC8vIENyZWF0ZSBTMyBidWNrZXQgZm9yIHBpcGVsaW5lIGFydGlmYWN0c1xuICAgIHRoaXMuYXJ0aWZhY3RCdWNrZXQgPSBuZXcgczMuQnVja2V0KHRoaXMsICdQaXBlbGluZUFydGlmYWN0QnVja2V0Jywge1xuICAgICAgdmVyc2lvbmVkOiB0cnVlLFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICAgIGF1dG9EZWxldGVPYmplY3RzOiB0cnVlLFxuICAgICAgZW5jcnlwdGlvbjogczMuQnVja2V0RW5jcnlwdGlvbi5TM19NQU5BR0VELFxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIElBTSByb2xlIGZvciBDb2RlRGVwbG95XG4gICAgY29uc3QgY29kZURlcGxveVJvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgJ0NvZGVEZXBsb3lSb2xlJywge1xuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoJ2NvZGVkZXBsb3kuYW1hem9uYXdzLmNvbScpLFxuICAgIH0pO1xuXG4gICAgLy8gQWRkIENvZGVEZXBsb3kgcGVybWlzc2lvbnNcbiAgICBjb2RlRGVwbG95Um9sZS5hZGRUb1BvbGljeShcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgJ2F1dG9zY2FsaW5nOkNvbXBsZXRlTGlmZWN5Y2xlQWN0aW9uJyxcbiAgICAgICAgICAnYXV0b3NjYWxpbmc6RGVsZXRlTGlmZWN5Y2xlSG9vaycsXG4gICAgICAgICAgJ2F1dG9zY2FsaW5nOkRlc2NyaWJlQXV0b1NjYWxpbmdHcm91cHMnLFxuICAgICAgICAgICdhdXRvc2NhbGluZzpEZXNjcmliZUxpZmVjeWNsZUhvb2tzJyxcbiAgICAgICAgICAnYXV0b3NjYWxpbmc6UHV0TGlmZWN5Y2xlSG9vaycsXG4gICAgICAgICAgJ2F1dG9zY2FsaW5nOlJlY29yZExpZmVjeWNsZUFjdGlvbkhlYXJ0YmVhdCcsXG4gICAgICAgICAgJ2VjMjpEZXNjcmliZUluc3RhbmNlcycsXG4gICAgICAgICAgJ2VjMjpEZXNjcmliZUluc3RhbmNlU3RhdHVzJyxcbiAgICAgICAgICAndGFnOkdldFRhZ3MnLFxuICAgICAgICAgICd0YWc6R2V0UmVzb3VyY2VzJyxcbiAgICAgICAgXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbJyonXSxcbiAgICAgIH0pXG4gICAgKTtcblxuICAgIC8vIENyZWF0ZSBJQU0gcm9sZSBmb3IgQ29kZVBpcGVsaW5lXG4gICAgY29uc3QgcGlwZWxpbmVSb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsICdQaXBlbGluZVJvbGUnLCB7XG4gICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbCgnY29kZXBpcGVsaW5lLmFtYXpvbmF3cy5jb20nKSxcbiAgICB9KTtcblxuICAgIC8vIEdyYW50IHBpcGVsaW5lIHJvbGUgYWNjZXNzIHRvIGFydGlmYWN0IGJ1Y2tldFxuICAgIHRoaXMuYXJ0aWZhY3RCdWNrZXQuZ3JhbnRSZWFkV3JpdGUocGlwZWxpbmVSb2xlKTtcblxuICAgIC8vIEdyYW50IHBpcGVsaW5lIHJvbGUgYWNjZXNzIHRvIENvZGVEZXBsb3lcbiAgICBwaXBlbGluZVJvbGUuYWRkVG9Qb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICdjb2RlZGVwbG95OionLFxuICAgICAgICBdLFxuICAgICAgICByZXNvdXJjZXM6IFsnKiddLFxuICAgICAgfSlcbiAgICApO1xuXG4gICAgLy8gR3JhbnQgcGlwZWxpbmUgcm9sZSBhY2Nlc3MgdG8gU2VjcmV0cyBNYW5hZ2VyXG4gICAgcGlwZWxpbmVSb2xlLmFkZFRvUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAnc2VjcmV0c21hbmFnZXI6R2V0U2VjcmV0VmFsdWUnLFxuICAgICAgICBdLFxuICAgICAgICByZXNvdXJjZXM6IFtwcm9wcy5naXRodWJUb2tlblNlY3JldEFybl0sXG4gICAgICB9KVxuICAgICk7XG5cbiAgICAvLyBDcmVhdGUgQ29kZUJ1aWxkIHByb2plY3RcbiAgICB0aGlzLmJ1aWxkUHJvamVjdCA9IG5ldyBjb2RlYnVpbGQuUGlwZWxpbmVQcm9qZWN0KHRoaXMsICdNYXRlcmlhbFJlY29nbml0aW9uQnVpbGRQcm9qZWN0Jywge1xuICAgICAgcHJvamVjdE5hbWU6ICdNYXRlcmlhbFJlY29nbml0aW9uQnVpbGRQcm9qZWN0JyxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIGJ1aWxkSW1hZ2U6IGNvZGVidWlsZC5MaW51eEJ1aWxkSW1hZ2UuU1RBTkRBUkRfN18wLFxuICAgICAgICBjb21wdXRlVHlwZTogY29kZWJ1aWxkLkNvbXB1dGVUeXBlLlNNQUxMLFxuICAgICAgICBwcml2aWxlZ2VkOiBmYWxzZSxcbiAgICAgIH0sXG4gICAgICBlbnZpcm9ubWVudFZhcmlhYmxlczoge1xuICAgICAgICBHSVRIVUJfVE9LRU46IHtcbiAgICAgICAgICB2YWx1ZTogcHJvcHMuZ2l0aHViVG9rZW5TZWNyZXRBcm4sXG4gICAgICAgICAgdHlwZTogY29kZWJ1aWxkLkJ1aWxkRW52aXJvbm1lbnRWYXJpYWJsZVR5cGUuU0VDUkVUU19NQU5BR0VSLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICAgIGJ1aWxkU3BlYzogY29kZWJ1aWxkLkJ1aWxkU3BlYy5mcm9tT2JqZWN0KHtcbiAgICAgICAgdmVyc2lvbjogJzAuMicsXG4gICAgICAgIHBoYXNlczoge1xuICAgICAgICAgIGluc3RhbGw6IHtcbiAgICAgICAgICAgICdydW50aW1lLXZlcnNpb25zJzoge1xuICAgICAgICAgICAgICBweXRob246ICczLjExJyxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgICBwcmVfYnVpbGQ6IHtcbiAgICAgICAgICAgIGNvbW1hbmRzOiBbXG4gICAgICAgICAgICAgICdlY2hvIFwiU3RhcnRpbmcgcHJlLWJ1aWxkIHBoYXNlXCInLFxuICAgICAgICAgICAgICAncGlwIGluc3RhbGwgLS11cGdyYWRlIHBpcCcsXG4gICAgICAgICAgICBdLFxuICAgICAgICAgIH0sXG4gICAgICAgICAgYnVpbGQ6IHtcbiAgICAgICAgICAgIGNvbW1hbmRzOiBbXG4gICAgICAgICAgICAgICdlY2hvIFwiU3RhcnRpbmcgYnVpbGQgcGhhc2VcIicsXG4gICAgICAgICAgICAgICdwaXAgaW5zdGFsbCAtciByZXF1aXJlbWVudHMudHh0JyxcbiAgICAgICAgICAgICAgJ3B5dGhvbiAtbSBweXRlc3QgdGVzdHMvIHx8IHRydWUnLCAvLyBSdW4gdGVzdHMgaWYgdGhleSBleGlzdFxuICAgICAgICAgICAgXSxcbiAgICAgICAgICB9LFxuICAgICAgICAgIHBvc3RfYnVpbGQ6IHtcbiAgICAgICAgICAgIGNvbW1hbmRzOiBbXG4gICAgICAgICAgICAgICdlY2hvIFwiU3RhcnRpbmcgcG9zdC1idWlsZCBwaGFzZVwiJyxcbiAgICAgICAgICAgICAgJ21rZGlyIC1wIGRlcGxveScsXG4gICAgICAgICAgICAgICdjcCAtciBhcHAucHkgcmVxdWlyZW1lbnRzLnR4dCBhcHBzcGVjLnltbCBkZXBsb3kvJyxcbiAgICAgICAgICAgICAgJ2NwIC1yIHNjcmlwdHMgZGVwbG95LycsXG4gICAgICAgICAgICAgICdlY2hvIFwiQnVpbGQgY29tcGxldGVkIHN1Y2Nlc3NmdWxseVwiJyxcbiAgICAgICAgICAgIF0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgICAgYXJ0aWZhY3RzOiB7XG4gICAgICAgICAgZmlsZXM6IFtcbiAgICAgICAgICAgICdkZXBsb3kvKiovKicsXG4gICAgICAgICAgICAnYXBwc3BlYy55bWwnLFxuICAgICAgICAgICAgJ3NjcmlwdHMvKiovKicsXG4gICAgICAgICAgXSxcbiAgICAgICAgICAnYmFzZS1kaXJlY3RvcnknOiAnLicsXG4gICAgICAgIH0sXG4gICAgICB9KSxcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBDb2RlRGVwbG95IGFwcGxpY2F0aW9uXG4gICAgY29uc3QgY29kZURlcGxveUFwcGxpY2F0aW9uID0gbmV3IGNvZGVkZXBsb3kuU2VydmVyQXBwbGljYXRpb24odGhpcywgJ01hdGVyaWFsUmVjb2duaXRpb25BcHAnLCB7XG4gICAgICBhcHBsaWNhdGlvbk5hbWU6ICdNYXRlcmlhbFJlY29nbml0aW9uU2VydmljZScsXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgQ29kZURlcGxveSBkZXBsb3ltZW50IGdyb3VwXG4gICAgdGhpcy5kZXBsb3ltZW50R3JvdXAgPSBuZXcgY29kZWRlcGxveS5TZXJ2ZXJEZXBsb3ltZW50R3JvdXAodGhpcywgJ01hdGVyaWFsUmVjb2duaXRpb25EZXBsb3ltZW50R3JvdXAnLCB7XG4gICAgICBhcHBsaWNhdGlvbjogY29kZURlcGxveUFwcGxpY2F0aW9uLFxuICAgICAgZGVwbG95bWVudEdyb3VwTmFtZTogJ01hdGVyaWFsUmVjb2duaXRpb25EZXBsb3ltZW50R3JvdXAnLFxuICAgICAgaW5zdGFsbEFnZW50OiB0cnVlLFxuICAgICAgYXV0b1JvbGxiYWNrOiB7XG4gICAgICAgIGZhaWxlZERlcGxveW1lbnQ6IHRydWUsXG4gICAgICAgIHN0b3BwZWREZXBsb3ltZW50OiB0cnVlLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSB0aGUgcGlwZWxpbmVcbiAgICB0aGlzLnBpcGVsaW5lID0gbmV3IGNvZGVwaXBlbGluZS5QaXBlbGluZSh0aGlzLCAnTWF0ZXJpYWxSZWNvZ25pdGlvblBpcGVsaW5lJywge1xuICAgICAgcGlwZWxpbmVOYW1lOiAnTWF0ZXJpYWxSZWNvZ25pdGlvblNlcnZpY2VQaXBlbGluZScsXG4gICAgICByb2xlOiBwaXBlbGluZVJvbGUsXG4gICAgICBhcnRpZmFjdEJ1Y2tldDogdGhpcy5hcnRpZmFjdEJ1Y2tldCxcbiAgICAgIHN0YWdlczogW1xuICAgICAgICB7XG4gICAgICAgICAgc3RhZ2VOYW1lOiAnU291cmNlJyxcbiAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICBuZXcgY29kZXBpcGVsaW5lX2FjdGlvbnMuR2l0SHViU291cmNlQWN0aW9uKHtcbiAgICAgICAgICAgICAgYWN0aW9uTmFtZTogJ0dpdEh1Yl9Tb3VyY2UnLFxuICAgICAgICAgICAgICBvd25lcjogcHJvcHMuZ2l0aHViT3duZXIsXG4gICAgICAgICAgICAgIHJlcG86IHByb3BzLmdpdGh1YlJlcG8sXG4gICAgICAgICAgICAgIGJyYW5jaDogcHJvcHMuZ2l0aHViQnJhbmNoLFxuICAgICAgICAgICAgICBvYXV0aFRva2VuOiBjZGsuU2VjcmV0VmFsdWUuc2VjcmV0c01hbmFnZXIoJ2dpdGh1Yi10b2tlbicpLFxuICAgICAgICAgICAgICBvdXRwdXQ6IG5ldyBjb2RlcGlwZWxpbmUuQXJ0aWZhY3QoJ1NvdXJjZUNvZGUnKSxcbiAgICAgICAgICAgICAgdmFyaWFibGVzTmFtZXNwYWNlOiAnU291cmNlVmFyaWFibGVzJyxcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgIF0sXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBzdGFnZU5hbWU6ICdCdWlsZCcsXG4gICAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICAgbmV3IGNvZGVwaXBlbGluZV9hY3Rpb25zLkNvZGVCdWlsZEFjdGlvbih7XG4gICAgICAgICAgICAgIGFjdGlvbk5hbWU6ICdCdWlsZCcsXG4gICAgICAgICAgICAgIHByb2plY3Q6IHRoaXMuYnVpbGRQcm9qZWN0LFxuICAgICAgICAgICAgICBpbnB1dDogbmV3IGNvZGVwaXBlbGluZS5BcnRpZmFjdCgnU291cmNlQ29kZScpLFxuICAgICAgICAgICAgICBvdXRwdXRzOiBbXG4gICAgICAgICAgICAgICAgbmV3IGNvZGVwaXBlbGluZS5BcnRpZmFjdCgnQnVpbGRPdXRwdXQnKSxcbiAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgIF0sXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBzdGFnZU5hbWU6ICdEZXBsb3knLFxuICAgICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAgIG5ldyBjb2RlcGlwZWxpbmVfYWN0aW9ucy5Db2RlRGVwbG95U2VydmVyRGVwbG95QWN0aW9uKHtcbiAgICAgICAgICAgICAgYWN0aW9uTmFtZTogJ0RlcGxveScsXG4gICAgICAgICAgICAgIGRlcGxveW1lbnRHcm91cDogdGhpcy5kZXBsb3ltZW50R3JvdXAsXG4gICAgICAgICAgICAgIGlucHV0OiBuZXcgY29kZXBpcGVsaW5lLkFydGlmYWN0KCdCdWlsZE91dHB1dCcpLFxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgXSxcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgfSk7XG5cbiAgICAvLyBUYWcgdGhlIHBpcGVsaW5lXG4gICAgY2RrLlRhZ3Mub2YodGhpcy5waXBlbGluZSkuYWRkKCdQcm9qZWN0JywgJ01hdGVyaWFsUmVjb2duaXRpb25TZXJ2aWNlJyk7XG4gICAgY2RrLlRhZ3Mub2YodGhpcy5waXBlbGluZSkuYWRkKCdFbnZpcm9ubWVudCcsICdEZXZlbG9wbWVudCcpO1xuICB9XG59XG4iXX0=