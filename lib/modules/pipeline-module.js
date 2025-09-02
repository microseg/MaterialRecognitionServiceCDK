"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PipelineModule = void 0;
const cdk = require("aws-cdk-lib");
const codepipeline = require("aws-cdk-lib/aws-codepipeline");
const codepipeline_actions = require("aws-cdk-lib/aws-codepipeline-actions");
// import * as codedeploy from 'aws-cdk-lib/aws-codedeploy';
const codebuild = require("aws-cdk-lib/aws-codebuild");
const iam = require("aws-cdk-lib/aws-iam");
const s3 = require("aws-cdk-lib/aws-s3");
const ecr_module_1 = require("./ecr-module");
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
        // ECR repository (extracted into its own module)
        const ecrModule = new ecr_module_1.EcrModule(this, 'EcrModule', {
            repositoryName: 'material-recognition',
            // Import existing ECR repo to avoid CFN conflicts if already created
            importExisting: true,
            removalPolicy: cdk.RemovalPolicy.RETAIN,
            imageScanOnPush: true,
        });
        this.ecrRepository = ecrModule.repository;
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
        this.buildProject = new codebuild.PipelineProject(this, 'MaterialRecognitionBuildProject', {
            projectName: 'MaterialRecognitionBuildProject',
            environment: {
                buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
                computeType: codebuild.ComputeType.SMALL,
                privileged: true,
            },
            environmentVariables: {
                ECR_REPO_URI: { value: this.ecrRepository.repositoryUri },
            },
            buildSpec: codebuild.BuildSpec.fromObject({
                version: '0.2',
                phases: {
                    pre_build: {
                        commands: [
                            'echo "Logging into ECR"',
                            'ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)',
                            'aws ecr get-login-password --region $AWS_DEFAULT_REGION | docker login --username AWS --password-stdin $ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com',
                            'COMMIT_ID=$(echo $CODEBUILD_RESOLVED_SOURCE_VERSION | cut -c 1-7)',
                            'IMAGE_TAG=${COMMIT_ID:-latest}',
                            'echo Using tag $IMAGE_TAG',
                        ],
                    },
                    build: {
                        commands: [
                            'echo "PWD=$(pwd)"',
                            'ls -la',
                            'echo "Searching for Dockerfile..."',
                            'find . -maxdepth 4 -name Dockerfile -print || true',
                            'DOCKERFILE_PATH=$(find . -maxdepth 4 -path "*/MaterialRecognitionService/MaterialRecognitionService/Dockerfile" | head -n1)',
                            'if [ -z "$DOCKERFILE_PATH" ]; then DOCKERFILE_PATH=$(find . -maxdepth 2 -name Dockerfile | head -n1); fi',
                            'echo "Using DOCKERFILE_PATH=$DOCKERFILE_PATH"',
                            'if [ -z "$DOCKERFILE_PATH" ] || [ ! -f "$DOCKERFILE_PATH" ]; then echo "Dockerfile not found"; exit 1; fi',
                            'CONTEXT_DIR=$(dirname "$DOCKERFILE_PATH")',
                            'echo "CONTEXT_DIR=$CONTEXT_DIR"',
                            'ls -la "$CONTEXT_DIR" || true',
                            'echo "Building image $ECR_REPO_URI:$IMAGE_TAG"',
                            'docker build -f "$DOCKERFILE_PATH" -t $ECR_REPO_URI:$IMAGE_TAG "$CONTEXT_DIR"',
                        ],
                    },
                    post_build: {
                        commands: [
                            'docker push $ECR_REPO_URI:$IMAGE_TAG',
                            'echo "Tagging and pushing latest"',
                            'docker tag $ECR_REPO_URI:$IMAGE_TAG $ECR_REPO_URI:latest',
                            'docker push $ECR_REPO_URI:latest',
                        ],
                    },
                },
                artifacts: {
                    files: ['**/*'],
                },
            }),
        });
        // Allow build project to push/pull the ECR repository
        this.ecrRepository.grantPullPush(this.buildProject);
        this.buildProject.addToRolePolicy(new iam.PolicyStatement({
            actions: [
                'ecr:GetAuthorizationToken',
                'sts:GetCallerIdentity',
            ],
            resources: ['*'],
        }));
        // Deploy project: use SSM to pull and run the container on EC2 (no scripts generated)
        this.deployProject = new codebuild.PipelineProject(this, 'MaterialRecognitionDeployProject', {
            projectName: 'MaterialRecognitionDeployProject',
            environment: {
                buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
                computeType: codebuild.ComputeType.SMALL,
                privileged: false,
            },
            environmentVariables: {
                INSTANCE_ID: { value: props.deploymentInstance.instanceId },
                ECR_REPO_URI: { value: this.ecrRepository.repositoryUri },
            },
            buildSpec: codebuild.BuildSpec.fromObject({
                version: '0.2',
                phases: {
                    build: {
                        commands: [
                            'IMAGE_URI="$ECR_REPO_URI:latest"',
                            'echo Using image $IMAGE_URI',
                            'echo "Sending SSM commands to instance $INSTANCE_ID"',
                            // Three atomic steps for stability
                            // 1) Install and start Docker
                            'cat >/tmp/ssm-step1.json <<EOF\n{\n  "DocumentName": "AWS-RunShellScript",\n  "Parameters": {\n    "commands": [\n      "sudo yum update -y || true",\n      "sudo yum install -y docker || true",\n      "sudo systemctl enable --now docker || true"\n    ]\n  },\n  "TimeoutSeconds": 900\n}\nEOF',
                            'aws ssm send-command --instance-ids $INSTANCE_ID --cli-input-json file:///tmp/ssm-step1.json --query "Command.CommandId" --output text > cmd1.txt',
                            'for i in $(seq 1 60); do STATUS=$(aws ssm get-command-invocation --command-id "$(cat cmd1.txt)" --instance-id "$INSTANCE_ID" --query Status --output text); echo $STATUS; if [ "$STATUS" = "Success" ]; then break; elif [ "$STATUS" = "Failed" ] || [ "$STATUS" = "Cancelled" ] || [ "$STATUS" = "TimedOut" ]; then aws ssm get-command-invocation --command-id "$(cat cmd1.txt)" --instance-id "$INSTANCE_ID" --query StandardErrorContent --output text; exit 1; fi; sleep 5; done',
                            // 2) Login to ECR (using AWS_DEFAULT_REGION)
                            'cat >/tmp/ssm-step2.json <<EOF\n{\n  "DocumentName": "AWS-RunShellScript",\n  "Parameters": {\n    "commands": [\n      "ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)",\n      "aws ecr get-login-password --region $AWS_DEFAULT_REGION | docker login --username AWS --password-stdin $(aws sts get-caller-identity --query Account --output text).dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com"\n    ]\n  },\n  "TimeoutSeconds": 900\n}\nEOF',
                            'aws ssm send-command --instance-ids $INSTANCE_ID --cli-input-json file:///tmp/ssm-step2.json --query "Command.CommandId" --output text > cmd2.txt',
                            'for i in $(seq 1 60); do STATUS=$(aws ssm get-command-invocation --command-id "$(cat cmd2.txt)" --instance-id "$INSTANCE_ID" --query Status --output text); echo $STATUS; if [ "$STATUS" = "Success" ]; then break; elif [ "$STATUS" = "Failed" ] || [ "$STATUS" = "Cancelled" ] || [ "$STATUS" = "TimedOut" ]; then aws ssm get-command-invocation --command-id "$(cat cmd2.txt)" --instance-id "$INSTANCE_ID" --query StandardErrorContent --output text; exit 1; fi; sleep 5; done',
                            // 3) Pull and run container (clear port 5000 if occupied)
                            'cat >/tmp/ssm-step3.json <<EOF\n{\n  "DocumentName": "AWS-RunShellScript",\n  "Parameters": {\n    "commands": [\n      "systemctl stop material-recognition.service || true",\n      "systemctl disable material-recognition.service || true",\n      "pkill -f gunicorn || true",\n      "docker ps -q --filter publish=5000 | xargs -r docker rm -f || true",\n      "fuser -k 5000/tcp || true",\n      "sleep 1",\n      "docker rm -f material-recognition || true",\n      "docker pull $IMAGE_URI",\n      "docker container run -d --name material-recognition --publish 5000:5000 --restart always $IMAGE_URI"\n    ]\n  },\n  "TimeoutSeconds": 900\n}\nEOF',
                            'aws ssm send-command --instance-ids $INSTANCE_ID --cli-input-json file:///tmp/ssm-step3.json --query "Command.CommandId" --output text > cmd3.txt',
                            'for i in $(seq 1 60); do STATUS=$(aws ssm get-command-invocation --command-id "$(cat cmd3.txt)" --instance-id "$INSTANCE_ID" --query Status --output text); echo $STATUS; if [ "$STATUS" = "Success" ]; then exit 0; elif [ "$STATUS" = "Failed" ] || [ "$STATUS" = "Cancelled" ] || [ "$STATUS" = "TimedOut" ]; then aws ssm get-command-invocation --command-id "$(cat cmd3.txt)" --instance-id "$INSTANCE_ID" --query StandardErrorContent --output text; exit 1; fi; sleep 5; done; exit 1',
                        ],
                    },
                },
                artifacts: { files: ['**/*'] },
            }),
        });
        // Allow deploy project to use SSM and ECR
        this.deployProject.addToRolePolicy(new iam.PolicyStatement({
            actions: [
                'ssm:SendCommand',
                'ssm:GetCommandInvocation',
                'ec2:DescribeInstances',
                'ecr:GetAuthorizationToken',
            ],
            resources: ['*'],
        }));
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
                            actionName: 'BuildImage',
                            project: this.buildProject,
                            input: new codepipeline.Artifact('SourceCode'),
                            outputs: [new codepipeline.Artifact('ImageOutput')],
                        }),
                    ],
                },
                {
                    stageName: 'Deploy',
                    actions: [
                        new codepipeline_actions.CodeBuildAction({
                            actionName: 'DeployToEC2',
                            project: this.deployProject,
                            input: new codepipeline.Artifact('SourceCode'), // not used, for pipeline constraint
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
input: new codepipeline.Artifact('SourceCode'),
    outputs;
[new codepipeline.Artifact('ImageOutput')],
;
{
    stageName: 'Deploy',
        actions;
    [
        new codepipeline_actions.CodeBuildAction({
            actionName: 'DeployToEC2',
            project: this.deployProject,
            input: new codepipeline.Artifact('SourceCode'), // not used, for pipeline constraint
        }),
    ],
    ;
}
;
// Tag the pipeline
cdk.Tags.of(this.pipeline).add('Project', 'MaterialRecognitionService');
cdk.Tags.of(this.pipeline).add('Environment', 'Development');
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGlwZWxpbmUtbW9kdWxlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsicGlwZWxpbmUtbW9kdWxlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLG1DQUFtQztBQUNuQyw2REFBNkQ7QUFDN0QsNkVBQTZFO0FBQzdFLDREQUE0RDtBQUM1RCx1REFBdUQ7QUFFdkQsMkNBQTJDO0FBQzNDLHlDQUF5QztBQUV6Qyw2Q0FBeUM7QUFDekMsMkNBQXVDO0FBV3ZDLE1BQWEsY0FBZSxTQUFRLHNCQUFTO0lBTzNDLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBMEI7UUFDbEUsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztRQUVqQiwwQ0FBMEM7UUFDMUMsSUFBSSxDQUFDLGNBQWMsR0FBRyxJQUFJLEVBQUUsQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLHdCQUF3QixFQUFFO1lBQ2xFLFNBQVMsRUFBRSxJQUFJO1lBQ2YsYUFBYSxFQUFFLEdBQUcsQ0FBQyxhQUFhLENBQUMsT0FBTztZQUN4QyxpQkFBaUIsRUFBRSxJQUFJO1lBQ3ZCLFVBQVUsRUFBRSxFQUFFLENBQUMsZ0JBQWdCLENBQUMsVUFBVTtTQUMzQyxDQUFDLENBQUM7UUFFSCxpREFBaUQ7UUFDakQsTUFBTSxTQUFTLEdBQUcsSUFBSSxzQkFBUyxDQUFDLElBQUksRUFBRSxXQUFXLEVBQUU7WUFDakQsY0FBYyxFQUFFLHNCQUFzQjtZQUN0QyxxRUFBcUU7WUFDckUsY0FBYyxFQUFFLElBQUk7WUFDcEIsYUFBYSxFQUFFLEdBQUcsQ0FBQyxhQUFhLENBQUMsTUFBTTtZQUN2QyxlQUFlLEVBQUUsSUFBSTtTQUN0QixDQUFDLENBQUM7UUFDSCxJQUFJLENBQUMsYUFBYSxHQUFHLFNBQVMsQ0FBQyxVQUFVLENBQUM7UUFFMUMsbUNBQW1DO1FBQ25DLE1BQU0sWUFBWSxHQUFHLElBQUksR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsY0FBYyxFQUFFO1lBQ3RELFNBQVMsRUFBRSxJQUFJLEdBQUcsQ0FBQyxnQkFBZ0IsQ0FBQyw0QkFBNEIsQ0FBQztTQUNsRSxDQUFDLENBQUM7UUFFSCxnREFBZ0Q7UUFDaEQsSUFBSSxDQUFDLGNBQWMsQ0FBQyxjQUFjLENBQUMsWUFBWSxDQUFDLENBQUM7UUFFakQsMkNBQTJDO1FBQzNDLFlBQVksQ0FBQyxXQUFXLENBQ3RCLElBQUksR0FBRyxDQUFDLGVBQWUsQ0FBQztZQUN0QixNQUFNLEVBQUUsR0FBRyxDQUFDLE1BQU0sQ0FBQyxLQUFLO1lBQ3hCLE9BQU8sRUFBRTtnQkFDUCxjQUFjO2FBQ2Y7WUFDRCxTQUFTLEVBQUUsQ0FBQyxHQUFHLENBQUM7U0FDakIsQ0FBQyxDQUNILENBQUM7UUFFRixnREFBZ0Q7UUFDaEQsWUFBWSxDQUFDLFdBQVcsQ0FDdEIsSUFBSSxHQUFHLENBQUMsZUFBZSxDQUFDO1lBQ3RCLE1BQU0sRUFBRSxHQUFHLENBQUMsTUFBTSxDQUFDLEtBQUs7WUFDeEIsT0FBTyxFQUFFO2dCQUNQLCtCQUErQjthQUNoQztZQUNELFNBQVMsRUFBRSxDQUFDLEtBQUssQ0FBQyxvQkFBb0IsQ0FBQztTQUN4QyxDQUFDLENBQ0gsQ0FBQztRQUVGLElBQUksQ0FBQyxZQUFZLEdBQUcsSUFBSSxTQUFTLENBQUMsZUFBZSxDQUFDLElBQUksRUFBRSxpQ0FBaUMsRUFBRTtZQUN6RixXQUFXLEVBQUUsaUNBQWlDO1lBQzlDLFdBQVcsRUFBRTtnQkFDWCxVQUFVLEVBQUUsU0FBUyxDQUFDLGVBQWUsQ0FBQyxZQUFZO2dCQUNsRCxXQUFXLEVBQUUsU0FBUyxDQUFDLFdBQVcsQ0FBQyxLQUFLO2dCQUN4QyxVQUFVLEVBQUUsSUFBSTthQUNqQjtZQUNELG9CQUFvQixFQUFFO2dCQUNwQixZQUFZLEVBQUUsRUFBRSxLQUFLLEVBQUUsSUFBSSxDQUFDLGFBQWEsQ0FBQyxhQUFhLEVBQUU7YUFDMUQ7WUFDRCxTQUFTLEVBQUUsU0FBUyxDQUFDLFNBQVMsQ0FBQyxVQUFVLENBQUM7Z0JBQ3hDLE9BQU8sRUFBRSxLQUFLO2dCQUNkLE1BQU0sRUFBRTtvQkFDTixTQUFTLEVBQUU7d0JBQ1QsUUFBUSxFQUFFOzRCQUNSLHlCQUF5Qjs0QkFDekIseUVBQXlFOzRCQUN6RSw4SkFBOEo7NEJBQzlKLG1FQUFtRTs0QkFDbkUsZ0NBQWdDOzRCQUNoQywyQkFBMkI7eUJBQzVCO3FCQUNGO29CQUNELEtBQUssRUFBRTt3QkFDTCxRQUFRLEVBQUU7NEJBQ1IsbUJBQW1COzRCQUNuQixRQUFROzRCQUNSLG9DQUFvQzs0QkFDcEMsb0RBQW9EOzRCQUNwRCw2SEFBNkg7NEJBQzdILDBHQUEwRzs0QkFDMUcsK0NBQStDOzRCQUMvQywyR0FBMkc7NEJBQzNHLDJDQUEyQzs0QkFDM0MsaUNBQWlDOzRCQUNqQywrQkFBK0I7NEJBQy9CLGdEQUFnRDs0QkFDaEQsK0VBQStFO3lCQUNoRjtxQkFDRjtvQkFDRCxVQUFVLEVBQUU7d0JBQ1YsUUFBUSxFQUFFOzRCQUNSLHNDQUFzQzs0QkFDdEMsbUNBQW1DOzRCQUNuQywwREFBMEQ7NEJBQzFELGtDQUFrQzt5QkFDbkM7cUJBQ0Y7aUJBQ0Y7Z0JBQ0QsU0FBUyxFQUFFO29CQUNULEtBQUssRUFBRSxDQUFDLE1BQU0sQ0FBQztpQkFDaEI7YUFDRixDQUFDO1NBQ0gsQ0FBQyxDQUFDO1FBRUgsc0RBQXNEO1FBQ3RELElBQUksQ0FBQyxhQUFhLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQztRQUNwRCxJQUFJLENBQUMsWUFBWSxDQUFDLGVBQWUsQ0FBQyxJQUFJLEdBQUcsQ0FBQyxlQUFlLENBQUM7WUFDeEQsT0FBTyxFQUFFO2dCQUNQLDJCQUEyQjtnQkFDM0IsdUJBQXVCO2FBQ3hCO1lBQ0QsU0FBUyxFQUFFLENBQUMsR0FBRyxDQUFDO1NBQ2pCLENBQUMsQ0FBQyxDQUFDO1FBRUosc0ZBQXNGO1FBQ3RGLElBQUksQ0FBQyxhQUFhLEdBQUcsSUFBSSxTQUFTLENBQUMsZUFBZSxDQUFDLElBQUksRUFBRSxrQ0FBa0MsRUFBRTtZQUMzRixXQUFXLEVBQUUsa0NBQWtDO1lBQy9DLFdBQVcsRUFBRTtnQkFDWCxVQUFVLEVBQUUsU0FBUyxDQUFDLGVBQWUsQ0FBQyxZQUFZO2dCQUNsRCxXQUFXLEVBQUUsU0FBUyxDQUFDLFdBQVcsQ0FBQyxLQUFLO2dCQUN4QyxVQUFVLEVBQUUsS0FBSzthQUNsQjtZQUNELG9CQUFvQixFQUFFO2dCQUNwQixXQUFXLEVBQUUsRUFBRSxLQUFLLEVBQUUsS0FBSyxDQUFDLGtCQUFrQixDQUFDLFVBQVUsRUFBRTtnQkFDM0QsWUFBWSxFQUFFLEVBQUUsS0FBSyxFQUFFLElBQUksQ0FBQyxhQUFhLENBQUMsYUFBYSxFQUFFO2FBQzFEO1lBQ0QsU0FBUyxFQUFFLFNBQVMsQ0FBQyxTQUFTLENBQUMsVUFBVSxDQUFDO2dCQUN4QyxPQUFPLEVBQUUsS0FBSztnQkFDZCxNQUFNLEVBQUU7b0JBQ04sS0FBSyxFQUFFO3dCQUNMLFFBQVEsRUFBRTs0QkFDUixrQ0FBa0M7NEJBQ2xDLDZCQUE2Qjs0QkFDN0Isc0RBQXNEOzRCQUN0RCxtQ0FBbUM7NEJBQ25DLDhCQUE4Qjs0QkFDOUIsc1NBQXNTOzRCQUN0UyxtSkFBbUo7NEJBQ25KLHVkQUF1ZDs0QkFDdmQsNkNBQTZDOzRCQUM3Qyx5Y0FBeWM7NEJBQ3pjLG1KQUFtSjs0QkFDbkosdWRBQXVkOzRCQUN2ZCwwREFBMEQ7NEJBQzFELHdvQkFBd29COzRCQUN4b0IsbUpBQW1KOzRCQUNuSixnZUFBZ2U7eUJBQ2plO3FCQUNGO2lCQUNGO2dCQUNELFNBQVMsRUFBRSxFQUFFLEtBQUssRUFBRSxDQUFDLE1BQU0sQ0FBQyxFQUFFO2FBQy9CLENBQUM7U0FDSCxDQUFDLENBQUM7UUFFSCwwQ0FBMEM7UUFDMUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxlQUFlLENBQUMsSUFBSSxHQUFHLENBQUMsZUFBZSxDQUFDO1lBQ3pELE9BQU8sRUFBRTtnQkFDUCxpQkFBaUI7Z0JBQ2pCLDBCQUEwQjtnQkFDMUIsdUJBQXVCO2dCQUN2QiwyQkFBMkI7YUFDNUI7WUFDRCxTQUFTLEVBQUUsQ0FBQyxHQUFHLENBQUM7U0FDakIsQ0FBQyxDQUFDLENBQUM7UUFFSixzQkFBc0I7UUFDdEIsSUFBSSxDQUFDLFFBQVEsR0FBRyxJQUFJLFlBQVksQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLDZCQUE2QixFQUFFO1lBQzdFLFlBQVksRUFBRSxvQ0FBb0M7WUFDbEQsSUFBSSxFQUFFLFlBQVk7WUFDbEIsY0FBYyxFQUFFLElBQUksQ0FBQyxjQUFjO1lBQ25DLE1BQU0sRUFBRTtnQkFDTjtvQkFDRSxTQUFTLEVBQUUsUUFBUTtvQkFDbkIsT0FBTyxFQUFFO3dCQUNQLElBQUksb0JBQW9CLENBQUMsa0JBQWtCLENBQUM7NEJBQzFDLFVBQVUsRUFBRSxlQUFlOzRCQUMzQixLQUFLLEVBQUUsS0FBSyxDQUFDLFdBQVc7NEJBQ3hCLElBQUksRUFBRSxLQUFLLENBQUMsVUFBVTs0QkFDdEIsTUFBTSxFQUFFLEtBQUssQ0FBQyxZQUFZOzRCQUMxQixVQUFVLEVBQUUsR0FBRyxDQUFDLFdBQVcsQ0FBQyxjQUFjLENBQUMsY0FBYyxDQUFDOzRCQUMxRCxNQUFNLEVBQUUsSUFBSSxZQUFZLENBQUMsUUFBUSxDQUFDLFlBQVksQ0FBQzs0QkFDL0Msa0JBQWtCLEVBQUUsaUJBQWlCO3lCQUN0QyxDQUFDO3FCQUNIO2lCQUNGO2dCQUNEO29CQUNFLFNBQVMsRUFBRSxPQUFPO29CQUNsQixPQUFPLEVBQUU7d0JBQ1AsSUFBSSxvQkFBb0IsQ0FBQyxlQUFlLENBQUM7NEJBQ3ZDLFVBQVUsRUFBRSxZQUFZOzRCQUN4QixPQUFPLEVBQUUsSUFBSSxDQUFDLFlBQVk7NEJBQzFCLEtBQUssRUFBRSxJQUFJLFlBQVksQ0FBQyxRQUFRLENBQUMsWUFBWSxDQUFDOzRCQUM5QyxPQUFPLEVBQUUsQ0FBQyxJQUFJLFlBQVksQ0FBQyxRQUFRLENBQUMsYUFBYSxDQUFDLENBQUM7eUJBQ3BELENBQUM7cUJBQ0g7aUJBQ0Y7Z0JBQ0Q7b0JBQ0UsU0FBUyxFQUFFLFFBQVE7b0JBQ25CLE9BQU8sRUFBRTt3QkFDUCxJQUFJLG9CQUFvQixDQUFDLGVBQWUsQ0FBQzs0QkFDdkMsVUFBVSxFQUFFLGFBQWE7NEJBQ3pCLE9BQU8sRUFBRSxJQUFJLENBQUMsYUFBYTs0QkFDM0IsS0FBSyxFQUFFLElBQUksWUFBWSxDQUFDLFFBQVEsQ0FBQyxZQUFZLENBQUMsRUFBRSxvQ0FBb0M7eUJBQ3JGLENBQUM7cUJBQ0g7aUJBQ0Y7YUFDRjtTQUNGLENBQUMsQ0FBQztRQUVILG1CQUFtQjtRQUNuQixHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUMsR0FBRyxDQUFDLFNBQVMsRUFBRSw0QkFBNEIsQ0FBQyxDQUFDO1FBQ3hFLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQyxHQUFHLENBQUMsYUFBYSxFQUFFLGFBQWEsQ0FBQyxDQUFDO0lBQy9ELENBQUM7Q0FDRjtBQTlORCx3Q0E4TkM7QUFHYSxLQUFLLEVBQUUsSUFBSSxZQUFZLENBQUMsUUFBUSxDQUFDLFlBQVksQ0FBQztJQUU5QyxPQUFPLENBQUE7QUFBRSxDQUFDLElBQUksWUFBWSxDQUFDLFFBQVEsQ0FBQyxhQUFhLENBQUMsQ0FBQztJQUNyRCxBQURzRCxKQUFBLENBQUE7QUFPMUQsQ0FBQztJQUVDLFNBQVMsRUFBRSxRQUFRO1FBRW5CLE9BQU8sQ0FBQTtJQUFFO1FBRVAsSUFBSSxvQkFBb0IsQ0FBQyxlQUFlLENBQUM7WUFDdkMsVUFBVSxFQUFFLGFBQWE7WUFDekIsT0FBTyxFQUFFLElBQUksQ0FBQyxhQUFhO1lBQzNCLEtBQUssRUFBRSxJQUFJLFlBQVksQ0FBQyxRQUFRLENBQUMsWUFBWSxDQUFDLEVBQUUsb0NBQW9DO1NBQ3JGLENBQUM7S0FFSDtRQUVILEFBRkksSkFBQSxDQUFBO0FBRUosQ0FBQztBQUlILENBQUM7QUFJSCxtQkFBbUI7QUFFbkIsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxTQUFTLEVBQUUsNEJBQTRCLENBQUMsQ0FBQztBQUV4RSxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUMsR0FBRyxDQUFDLGFBQWEsRUFBRSxhQUFhLENBQUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XHJcbmltcG9ydCAqIGFzIGNvZGVwaXBlbGluZSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY29kZXBpcGVsaW5lJztcclxuaW1wb3J0ICogYXMgY29kZXBpcGVsaW5lX2FjdGlvbnMgZnJvbSAnYXdzLWNkay1saWIvYXdzLWNvZGVwaXBlbGluZS1hY3Rpb25zJztcclxuLy8gaW1wb3J0ICogYXMgY29kZWRlcGxveSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY29kZWRlcGxveSc7XHJcbmltcG9ydCAqIGFzIGNvZGVidWlsZCBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY29kZWJ1aWxkJztcclxuaW1wb3J0ICogYXMgZWMyIGZyb20gJ2F3cy1jZGstbGliL2F3cy1lYzInO1xyXG5pbXBvcnQgKiBhcyBpYW0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWlhbSc7XHJcbmltcG9ydCAqIGFzIHMzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zMyc7XHJcbmltcG9ydCAqIGFzIGVjciBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZWNyJztcclxuaW1wb3J0IHsgRWNyTW9kdWxlIH0gZnJvbSAnLi9lY3ItbW9kdWxlJztcclxuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XHJcblxyXG5leHBvcnQgaW50ZXJmYWNlIFBpcGVsaW5lTW9kdWxlUHJvcHMge1xyXG4gIGdpdGh1YlRva2VuU2VjcmV0QXJuOiBzdHJpbmc7XHJcbiAgZ2l0aHViT3duZXI6IHN0cmluZztcclxuICBnaXRodWJSZXBvOiBzdHJpbmc7XHJcbiAgZ2l0aHViQnJhbmNoOiBzdHJpbmc7XHJcbiAgZGVwbG95bWVudEluc3RhbmNlOiBlYzIuSW5zdGFuY2U7XHJcbiAgdnBjOiBlYzIuSVZwYztcclxufVxyXG5cclxuZXhwb3J0IGNsYXNzIFBpcGVsaW5lTW9kdWxlIGV4dGVuZHMgQ29uc3RydWN0IHtcclxuICBwdWJsaWMgcmVhZG9ubHkgcGlwZWxpbmU6IGNvZGVwaXBlbGluZS5QaXBlbGluZTtcclxuICBwdWJsaWMgcmVhZG9ubHkgYXJ0aWZhY3RCdWNrZXQ6IHMzLkJ1Y2tldDtcclxuICBwdWJsaWMgcmVhZG9ubHkgYnVpbGRQcm9qZWN0OiBjb2RlYnVpbGQuUGlwZWxpbmVQcm9qZWN0O1xyXG4gIHB1YmxpYyByZWFkb25seSBkZXBsb3lQcm9qZWN0OiBjb2RlYnVpbGQuUGlwZWxpbmVQcm9qZWN0O1xyXG4gIHB1YmxpYyByZWFkb25seSBlY3JSZXBvc2l0b3J5OiBlY3IuSVJlcG9zaXRvcnk7XHJcblxyXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBQaXBlbGluZU1vZHVsZVByb3BzKSB7XHJcbiAgICBzdXBlcihzY29wZSwgaWQpO1xyXG5cclxuICAgIC8vIENyZWF0ZSBTMyBidWNrZXQgZm9yIHBpcGVsaW5lIGFydGlmYWN0c1xyXG4gICAgdGhpcy5hcnRpZmFjdEJ1Y2tldCA9IG5ldyBzMy5CdWNrZXQodGhpcywgJ1BpcGVsaW5lQXJ0aWZhY3RCdWNrZXQnLCB7XHJcbiAgICAgIHZlcnNpb25lZDogdHJ1ZSxcclxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcclxuICAgICAgYXV0b0RlbGV0ZU9iamVjdHM6IHRydWUsXHJcbiAgICAgIGVuY3J5cHRpb246IHMzLkJ1Y2tldEVuY3J5cHRpb24uUzNfTUFOQUdFRCxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIEVDUiByZXBvc2l0b3J5IChleHRyYWN0ZWQgaW50byBpdHMgb3duIG1vZHVsZSlcclxuICAgIGNvbnN0IGVjck1vZHVsZSA9IG5ldyBFY3JNb2R1bGUodGhpcywgJ0Vjck1vZHVsZScsIHtcclxuICAgICAgcmVwb3NpdG9yeU5hbWU6ICdtYXRlcmlhbC1yZWNvZ25pdGlvbicsXHJcbiAgICAgIC8vIEltcG9ydCBleGlzdGluZyBFQ1IgcmVwbyB0byBhdm9pZCBDRk4gY29uZmxpY3RzIGlmIGFscmVhZHkgY3JlYXRlZFxyXG4gICAgICBpbXBvcnRFeGlzdGluZzogdHJ1ZSxcclxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOLFxyXG4gICAgICBpbWFnZVNjYW5PblB1c2g6IHRydWUsXHJcbiAgICB9KTtcclxuICAgIHRoaXMuZWNyUmVwb3NpdG9yeSA9IGVjck1vZHVsZS5yZXBvc2l0b3J5O1xyXG5cclxuICAgIC8vIENyZWF0ZSBJQU0gcm9sZSBmb3IgQ29kZVBpcGVsaW5lXHJcbiAgICBjb25zdCBwaXBlbGluZVJvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgJ1BpcGVsaW5lUm9sZScsIHtcclxuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoJ2NvZGVwaXBlbGluZS5hbWF6b25hd3MuY29tJyksXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBHcmFudCBwaXBlbGluZSByb2xlIGFjY2VzcyB0byBhcnRpZmFjdCBidWNrZXRcclxuICAgIHRoaXMuYXJ0aWZhY3RCdWNrZXQuZ3JhbnRSZWFkV3JpdGUocGlwZWxpbmVSb2xlKTtcclxuXHJcbiAgICAvLyBHcmFudCBwaXBlbGluZSByb2xlIGFjY2VzcyB0byBDb2RlRGVwbG95XHJcbiAgICBwaXBlbGluZVJvbGUuYWRkVG9Qb2xpY3koXHJcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcclxuICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXHJcbiAgICAgICAgYWN0aW9uczogW1xyXG4gICAgICAgICAgJ2NvZGVkZXBsb3k6KicsXHJcbiAgICAgICAgXSxcclxuICAgICAgICByZXNvdXJjZXM6IFsnKiddLFxyXG4gICAgICB9KVxyXG4gICAgKTtcclxuXHJcbiAgICAvLyBHcmFudCBwaXBlbGluZSByb2xlIGFjY2VzcyB0byBTZWNyZXRzIE1hbmFnZXJcclxuICAgIHBpcGVsaW5lUm9sZS5hZGRUb1BvbGljeShcclxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xyXG4gICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcclxuICAgICAgICBhY3Rpb25zOiBbXHJcbiAgICAgICAgICAnc2VjcmV0c21hbmFnZXI6R2V0U2VjcmV0VmFsdWUnLFxyXG4gICAgICAgIF0sXHJcbiAgICAgICAgcmVzb3VyY2VzOiBbcHJvcHMuZ2l0aHViVG9rZW5TZWNyZXRBcm5dLFxyXG4gICAgICB9KVxyXG4gICAgKTtcclxuXHJcbiAgICB0aGlzLmJ1aWxkUHJvamVjdCA9IG5ldyBjb2RlYnVpbGQuUGlwZWxpbmVQcm9qZWN0KHRoaXMsICdNYXRlcmlhbFJlY29nbml0aW9uQnVpbGRQcm9qZWN0Jywge1xyXG4gICAgICBwcm9qZWN0TmFtZTogJ01hdGVyaWFsUmVjb2duaXRpb25CdWlsZFByb2plY3QnLFxyXG4gICAgICBlbnZpcm9ubWVudDoge1xyXG4gICAgICAgIGJ1aWxkSW1hZ2U6IGNvZGVidWlsZC5MaW51eEJ1aWxkSW1hZ2UuU1RBTkRBUkRfN18wLFxyXG4gICAgICAgIGNvbXB1dGVUeXBlOiBjb2RlYnVpbGQuQ29tcHV0ZVR5cGUuU01BTEwsXHJcbiAgICAgICAgcHJpdmlsZWdlZDogdHJ1ZSwgXHJcbiAgICAgIH0sXHJcbiAgICAgIGVudmlyb25tZW50VmFyaWFibGVzOiB7XHJcbiAgICAgICAgRUNSX1JFUE9fVVJJOiB7IHZhbHVlOiB0aGlzLmVjclJlcG9zaXRvcnkucmVwb3NpdG9yeVVyaSB9LFxyXG4gICAgICB9LFxyXG4gICAgICBidWlsZFNwZWM6IGNvZGVidWlsZC5CdWlsZFNwZWMuZnJvbU9iamVjdCh7XHJcbiAgICAgICAgdmVyc2lvbjogJzAuMicsXHJcbiAgICAgICAgcGhhc2VzOiB7XHJcbiAgICAgICAgICBwcmVfYnVpbGQ6IHtcclxuICAgICAgICAgICAgY29tbWFuZHM6IFtcclxuICAgICAgICAgICAgICAnZWNobyBcIkxvZ2dpbmcgaW50byBFQ1JcIicsXHJcbiAgICAgICAgICAgICAgJ0FDQ09VTlRfSUQ9JChhd3Mgc3RzIGdldC1jYWxsZXItaWRlbnRpdHkgLS1xdWVyeSBBY2NvdW50IC0tb3V0cHV0IHRleHQpJyxcclxuICAgICAgICAgICAgICAnYXdzIGVjciBnZXQtbG9naW4tcGFzc3dvcmQgLS1yZWdpb24gJEFXU19ERUZBVUxUX1JFR0lPTiB8IGRvY2tlciBsb2dpbiAtLXVzZXJuYW1lIEFXUyAtLXBhc3N3b3JkLXN0ZGluICRBQ0NPVU5UX0lELmRrci5lY3IuJEFXU19ERUZBVUxUX1JFR0lPTi5hbWF6b25hd3MuY29tJyxcclxuICAgICAgICAgICAgICAnQ09NTUlUX0lEPSQoZWNobyAkQ09ERUJVSUxEX1JFU09MVkVEX1NPVVJDRV9WRVJTSU9OIHwgY3V0IC1jIDEtNyknLFxyXG4gICAgICAgICAgICAgICdJTUFHRV9UQUc9JHtDT01NSVRfSUQ6LWxhdGVzdH0nLFxyXG4gICAgICAgICAgICAgICdlY2hvIFVzaW5nIHRhZyAkSU1BR0VfVEFHJyxcclxuICAgICAgICAgICAgXSxcclxuICAgICAgICAgIH0sXHJcbiAgICAgICAgICBidWlsZDoge1xyXG4gICAgICAgICAgICBjb21tYW5kczogW1xyXG4gICAgICAgICAgICAgICdlY2hvIFwiUFdEPSQocHdkKVwiJyxcclxuICAgICAgICAgICAgICAnbHMgLWxhJyxcclxuICAgICAgICAgICAgICAnZWNobyBcIlNlYXJjaGluZyBmb3IgRG9ja2VyZmlsZS4uLlwiJyxcclxuICAgICAgICAgICAgICAnZmluZCAuIC1tYXhkZXB0aCA0IC1uYW1lIERvY2tlcmZpbGUgLXByaW50IHx8IHRydWUnLFxyXG4gICAgICAgICAgICAgICdET0NLRVJGSUxFX1BBVEg9JChmaW5kIC4gLW1heGRlcHRoIDQgLXBhdGggXCIqL01hdGVyaWFsUmVjb2duaXRpb25TZXJ2aWNlL01hdGVyaWFsUmVjb2duaXRpb25TZXJ2aWNlL0RvY2tlcmZpbGVcIiB8IGhlYWQgLW4xKScsXHJcbiAgICAgICAgICAgICAgJ2lmIFsgLXogXCIkRE9DS0VSRklMRV9QQVRIXCIgXTsgdGhlbiBET0NLRVJGSUxFX1BBVEg9JChmaW5kIC4gLW1heGRlcHRoIDIgLW5hbWUgRG9ja2VyZmlsZSB8IGhlYWQgLW4xKTsgZmknLFxyXG4gICAgICAgICAgICAgICdlY2hvIFwiVXNpbmcgRE9DS0VSRklMRV9QQVRIPSRET0NLRVJGSUxFX1BBVEhcIicsXHJcbiAgICAgICAgICAgICAgJ2lmIFsgLXogXCIkRE9DS0VSRklMRV9QQVRIXCIgXSB8fCBbICEgLWYgXCIkRE9DS0VSRklMRV9QQVRIXCIgXTsgdGhlbiBlY2hvIFwiRG9ja2VyZmlsZSBub3QgZm91bmRcIjsgZXhpdCAxOyBmaScsXHJcbiAgICAgICAgICAgICAgJ0NPTlRFWFRfRElSPSQoZGlybmFtZSBcIiRET0NLRVJGSUxFX1BBVEhcIiknLFxyXG4gICAgICAgICAgICAgICdlY2hvIFwiQ09OVEVYVF9ESVI9JENPTlRFWFRfRElSXCInLFxyXG4gICAgICAgICAgICAgICdscyAtbGEgXCIkQ09OVEVYVF9ESVJcIiB8fCB0cnVlJyxcclxuICAgICAgICAgICAgICAnZWNobyBcIkJ1aWxkaW5nIGltYWdlICRFQ1JfUkVQT19VUkk6JElNQUdFX1RBR1wiJyxcclxuICAgICAgICAgICAgICAnZG9ja2VyIGJ1aWxkIC1mIFwiJERPQ0tFUkZJTEVfUEFUSFwiIC10ICRFQ1JfUkVQT19VUkk6JElNQUdFX1RBRyBcIiRDT05URVhUX0RJUlwiJyxcclxuICAgICAgICAgICAgXSxcclxuICAgICAgICAgIH0sXHJcbiAgICAgICAgICBwb3N0X2J1aWxkOiB7XHJcbiAgICAgICAgICAgIGNvbW1hbmRzOiBbXHJcbiAgICAgICAgICAgICAgJ2RvY2tlciBwdXNoICRFQ1JfUkVQT19VUkk6JElNQUdFX1RBRycsXHJcbiAgICAgICAgICAgICAgJ2VjaG8gXCJUYWdnaW5nIGFuZCBwdXNoaW5nIGxhdGVzdFwiJyxcclxuICAgICAgICAgICAgICAnZG9ja2VyIHRhZyAkRUNSX1JFUE9fVVJJOiRJTUFHRV9UQUcgJEVDUl9SRVBPX1VSSTpsYXRlc3QnLFxyXG4gICAgICAgICAgICAgICdkb2NrZXIgcHVzaCAkRUNSX1JFUE9fVVJJOmxhdGVzdCcsXHJcbiAgICAgICAgICAgIF0sXHJcbiAgICAgICAgICB9LFxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgYXJ0aWZhY3RzOiB7XHJcbiAgICAgICAgICBmaWxlczogWycqKi8qJ10sXHJcbiAgICAgICAgfSxcclxuICAgICAgfSksXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBBbGxvdyBidWlsZCBwcm9qZWN0IHRvIHB1c2gvcHVsbCB0aGUgRUNSIHJlcG9zaXRvcnlcclxuICAgIHRoaXMuZWNyUmVwb3NpdG9yeS5ncmFudFB1bGxQdXNoKHRoaXMuYnVpbGRQcm9qZWN0KTtcclxuICAgIHRoaXMuYnVpbGRQcm9qZWN0LmFkZFRvUm9sZVBvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XHJcbiAgICAgIGFjdGlvbnM6IFtcclxuICAgICAgICAnZWNyOkdldEF1dGhvcml6YXRpb25Ub2tlbicsXHJcbiAgICAgICAgJ3N0czpHZXRDYWxsZXJJZGVudGl0eScsXHJcbiAgICAgIF0sXHJcbiAgICAgIHJlc291cmNlczogWycqJ10sXHJcbiAgICB9KSk7XHJcblxyXG4gICAgLy8gRGVwbG95IHByb2plY3Q6IHVzZSBTU00gdG8gcHVsbCBhbmQgcnVuIHRoZSBjb250YWluZXIgb24gRUMyIChubyBzY3JpcHRzIGdlbmVyYXRlZClcclxuICAgIHRoaXMuZGVwbG95UHJvamVjdCA9IG5ldyBjb2RlYnVpbGQuUGlwZWxpbmVQcm9qZWN0KHRoaXMsICdNYXRlcmlhbFJlY29nbml0aW9uRGVwbG95UHJvamVjdCcsIHtcclxuICAgICAgcHJvamVjdE5hbWU6ICdNYXRlcmlhbFJlY29nbml0aW9uRGVwbG95UHJvamVjdCcsXHJcbiAgICAgIGVudmlyb25tZW50OiB7XHJcbiAgICAgICAgYnVpbGRJbWFnZTogY29kZWJ1aWxkLkxpbnV4QnVpbGRJbWFnZS5TVEFOREFSRF83XzAsXHJcbiAgICAgICAgY29tcHV0ZVR5cGU6IGNvZGVidWlsZC5Db21wdXRlVHlwZS5TTUFMTCxcclxuICAgICAgICBwcml2aWxlZ2VkOiBmYWxzZSxcclxuICAgICAgfSxcclxuICAgICAgZW52aXJvbm1lbnRWYXJpYWJsZXM6IHtcclxuICAgICAgICBJTlNUQU5DRV9JRDogeyB2YWx1ZTogcHJvcHMuZGVwbG95bWVudEluc3RhbmNlLmluc3RhbmNlSWQgfSxcclxuICAgICAgICBFQ1JfUkVQT19VUkk6IHsgdmFsdWU6IHRoaXMuZWNyUmVwb3NpdG9yeS5yZXBvc2l0b3J5VXJpIH0sXHJcbiAgICAgIH0sXHJcbiAgICAgIGJ1aWxkU3BlYzogY29kZWJ1aWxkLkJ1aWxkU3BlYy5mcm9tT2JqZWN0KHtcclxuICAgICAgICB2ZXJzaW9uOiAnMC4yJyxcclxuICAgICAgICBwaGFzZXM6IHtcclxuICAgICAgICAgIGJ1aWxkOiB7XHJcbiAgICAgICAgICAgIGNvbW1hbmRzOiBbXHJcbiAgICAgICAgICAgICAgJ0lNQUdFX1VSST1cIiRFQ1JfUkVQT19VUkk6bGF0ZXN0XCInLFxyXG4gICAgICAgICAgICAgICdlY2hvIFVzaW5nIGltYWdlICRJTUFHRV9VUkknLFxyXG4gICAgICAgICAgICAgICdlY2hvIFwiU2VuZGluZyBTU00gY29tbWFuZHMgdG8gaW5zdGFuY2UgJElOU1RBTkNFX0lEXCInLFxyXG4gICAgICAgICAgICAgIC8vIFRocmVlIGF0b21pYyBzdGVwcyBmb3Igc3RhYmlsaXR5XHJcbiAgICAgICAgICAgICAgLy8gMSkgSW5zdGFsbCBhbmQgc3RhcnQgRG9ja2VyXHJcbiAgICAgICAgICAgICAgJ2NhdCA+L3RtcC9zc20tc3RlcDEuanNvbiA8PEVPRlxcbntcXG4gIFwiRG9jdW1lbnROYW1lXCI6IFwiQVdTLVJ1blNoZWxsU2NyaXB0XCIsXFxuICBcIlBhcmFtZXRlcnNcIjoge1xcbiAgICBcImNvbW1hbmRzXCI6IFtcXG4gICAgICBcInN1ZG8geXVtIHVwZGF0ZSAteSB8fCB0cnVlXCIsXFxuICAgICAgXCJzdWRvIHl1bSBpbnN0YWxsIC15IGRvY2tlciB8fCB0cnVlXCIsXFxuICAgICAgXCJzdWRvIHN5c3RlbWN0bCBlbmFibGUgLS1ub3cgZG9ja2VyIHx8IHRydWVcIlxcbiAgICBdXFxuICB9LFxcbiAgXCJUaW1lb3V0U2Vjb25kc1wiOiA5MDBcXG59XFxuRU9GJyxcclxuICAgICAgICAgICAgICAnYXdzIHNzbSBzZW5kLWNvbW1hbmQgLS1pbnN0YW5jZS1pZHMgJElOU1RBTkNFX0lEIC0tY2xpLWlucHV0LWpzb24gZmlsZTovLy90bXAvc3NtLXN0ZXAxLmpzb24gLS1xdWVyeSBcIkNvbW1hbmQuQ29tbWFuZElkXCIgLS1vdXRwdXQgdGV4dCA+IGNtZDEudHh0JyxcclxuICAgICAgICAgICAgICAnZm9yIGkgaW4gJChzZXEgMSA2MCk7IGRvIFNUQVRVUz0kKGF3cyBzc20gZ2V0LWNvbW1hbmQtaW52b2NhdGlvbiAtLWNvbW1hbmQtaWQgXCIkKGNhdCBjbWQxLnR4dClcIiAtLWluc3RhbmNlLWlkIFwiJElOU1RBTkNFX0lEXCIgLS1xdWVyeSBTdGF0dXMgLS1vdXRwdXQgdGV4dCk7IGVjaG8gJFNUQVRVUzsgaWYgWyBcIiRTVEFUVVNcIiA9IFwiU3VjY2Vzc1wiIF07IHRoZW4gYnJlYWs7IGVsaWYgWyBcIiRTVEFUVVNcIiA9IFwiRmFpbGVkXCIgXSB8fCBbIFwiJFNUQVRVU1wiID0gXCJDYW5jZWxsZWRcIiBdIHx8IFsgXCIkU1RBVFVTXCIgPSBcIlRpbWVkT3V0XCIgXTsgdGhlbiBhd3Mgc3NtIGdldC1jb21tYW5kLWludm9jYXRpb24gLS1jb21tYW5kLWlkIFwiJChjYXQgY21kMS50eHQpXCIgLS1pbnN0YW5jZS1pZCBcIiRJTlNUQU5DRV9JRFwiIC0tcXVlcnkgU3RhbmRhcmRFcnJvckNvbnRlbnQgLS1vdXRwdXQgdGV4dDsgZXhpdCAxOyBmaTsgc2xlZXAgNTsgZG9uZScsXHJcbiAgICAgICAgICAgICAgLy8gMikgTG9naW4gdG8gRUNSICh1c2luZyBBV1NfREVGQVVMVF9SRUdJT04pXHJcbiAgICAgICAgICAgICAgJ2NhdCA+L3RtcC9zc20tc3RlcDIuanNvbiA8PEVPRlxcbntcXG4gIFwiRG9jdW1lbnROYW1lXCI6IFwiQVdTLVJ1blNoZWxsU2NyaXB0XCIsXFxuICBcIlBhcmFtZXRlcnNcIjoge1xcbiAgICBcImNvbW1hbmRzXCI6IFtcXG4gICAgICBcIkFDQ09VTlRfSUQ9JChhd3Mgc3RzIGdldC1jYWxsZXItaWRlbnRpdHkgLS1xdWVyeSBBY2NvdW50IC0tb3V0cHV0IHRleHQpXCIsXFxuICAgICAgXCJhd3MgZWNyIGdldC1sb2dpbi1wYXNzd29yZCAtLXJlZ2lvbiAkQVdTX0RFRkFVTFRfUkVHSU9OIHwgZG9ja2VyIGxvZ2luIC0tdXNlcm5hbWUgQVdTIC0tcGFzc3dvcmQtc3RkaW4gJChhd3Mgc3RzIGdldC1jYWxsZXItaWRlbnRpdHkgLS1xdWVyeSBBY2NvdW50IC0tb3V0cHV0IHRleHQpLmRrci5lY3IuJEFXU19ERUZBVUxUX1JFR0lPTi5hbWF6b25hd3MuY29tXCJcXG4gICAgXVxcbiAgfSxcXG4gIFwiVGltZW91dFNlY29uZHNcIjogOTAwXFxufVxcbkVPRicsXHJcbiAgICAgICAgICAgICAgJ2F3cyBzc20gc2VuZC1jb21tYW5kIC0taW5zdGFuY2UtaWRzICRJTlNUQU5DRV9JRCAtLWNsaS1pbnB1dC1qc29uIGZpbGU6Ly8vdG1wL3NzbS1zdGVwMi5qc29uIC0tcXVlcnkgXCJDb21tYW5kLkNvbW1hbmRJZFwiIC0tb3V0cHV0IHRleHQgPiBjbWQyLnR4dCcsXHJcbiAgICAgICAgICAgICAgJ2ZvciBpIGluICQoc2VxIDEgNjApOyBkbyBTVEFUVVM9JChhd3Mgc3NtIGdldC1jb21tYW5kLWludm9jYXRpb24gLS1jb21tYW5kLWlkIFwiJChjYXQgY21kMi50eHQpXCIgLS1pbnN0YW5jZS1pZCBcIiRJTlNUQU5DRV9JRFwiIC0tcXVlcnkgU3RhdHVzIC0tb3V0cHV0IHRleHQpOyBlY2hvICRTVEFUVVM7IGlmIFsgXCIkU1RBVFVTXCIgPSBcIlN1Y2Nlc3NcIiBdOyB0aGVuIGJyZWFrOyBlbGlmIFsgXCIkU1RBVFVTXCIgPSBcIkZhaWxlZFwiIF0gfHwgWyBcIiRTVEFUVVNcIiA9IFwiQ2FuY2VsbGVkXCIgXSB8fCBbIFwiJFNUQVRVU1wiID0gXCJUaW1lZE91dFwiIF07IHRoZW4gYXdzIHNzbSBnZXQtY29tbWFuZC1pbnZvY2F0aW9uIC0tY29tbWFuZC1pZCBcIiQoY2F0IGNtZDIudHh0KVwiIC0taW5zdGFuY2UtaWQgXCIkSU5TVEFOQ0VfSURcIiAtLXF1ZXJ5IFN0YW5kYXJkRXJyb3JDb250ZW50IC0tb3V0cHV0IHRleHQ7IGV4aXQgMTsgZmk7IHNsZWVwIDU7IGRvbmUnLFxyXG4gICAgICAgICAgICAgIC8vIDMpIFB1bGwgYW5kIHJ1biBjb250YWluZXIgKGNsZWFyIHBvcnQgNTAwMCBpZiBvY2N1cGllZClcclxuICAgICAgICAgICAgICAnY2F0ID4vdG1wL3NzbS1zdGVwMy5qc29uIDw8RU9GXFxue1xcbiAgXCJEb2N1bWVudE5hbWVcIjogXCJBV1MtUnVuU2hlbGxTY3JpcHRcIixcXG4gIFwiUGFyYW1ldGVyc1wiOiB7XFxuICAgIFwiY29tbWFuZHNcIjogW1xcbiAgICAgIFwic3lzdGVtY3RsIHN0b3AgbWF0ZXJpYWwtcmVjb2duaXRpb24uc2VydmljZSB8fCB0cnVlXCIsXFxuICAgICAgXCJzeXN0ZW1jdGwgZGlzYWJsZSBtYXRlcmlhbC1yZWNvZ25pdGlvbi5zZXJ2aWNlIHx8IHRydWVcIixcXG4gICAgICBcInBraWxsIC1mIGd1bmljb3JuIHx8IHRydWVcIixcXG4gICAgICBcImRvY2tlciBwcyAtcSAtLWZpbHRlciBwdWJsaXNoPTUwMDAgfCB4YXJncyAtciBkb2NrZXIgcm0gLWYgfHwgdHJ1ZVwiLFxcbiAgICAgIFwiZnVzZXIgLWsgNTAwMC90Y3AgfHwgdHJ1ZVwiLFxcbiAgICAgIFwic2xlZXAgMVwiLFxcbiAgICAgIFwiZG9ja2VyIHJtIC1mIG1hdGVyaWFsLXJlY29nbml0aW9uIHx8IHRydWVcIixcXG4gICAgICBcImRvY2tlciBwdWxsICRJTUFHRV9VUklcIixcXG4gICAgICBcImRvY2tlciBjb250YWluZXIgcnVuIC1kIC0tbmFtZSBtYXRlcmlhbC1yZWNvZ25pdGlvbiAtLXB1Ymxpc2ggNTAwMDo1MDAwIC0tcmVzdGFydCBhbHdheXMgJElNQUdFX1VSSVwiXFxuICAgIF1cXG4gIH0sXFxuICBcIlRpbWVvdXRTZWNvbmRzXCI6IDkwMFxcbn1cXG5FT0YnLFxyXG4gICAgICAgICAgICAgICdhd3Mgc3NtIHNlbmQtY29tbWFuZCAtLWluc3RhbmNlLWlkcyAkSU5TVEFOQ0VfSUQgLS1jbGktaW5wdXQtanNvbiBmaWxlOi8vL3RtcC9zc20tc3RlcDMuanNvbiAtLXF1ZXJ5IFwiQ29tbWFuZC5Db21tYW5kSWRcIiAtLW91dHB1dCB0ZXh0ID4gY21kMy50eHQnLFxyXG4gICAgICAgICAgICAgICdmb3IgaSBpbiAkKHNlcSAxIDYwKTsgZG8gU1RBVFVTPSQoYXdzIHNzbSBnZXQtY29tbWFuZC1pbnZvY2F0aW9uIC0tY29tbWFuZC1pZCBcIiQoY2F0IGNtZDMudHh0KVwiIC0taW5zdGFuY2UtaWQgXCIkSU5TVEFOQ0VfSURcIiAtLXF1ZXJ5IFN0YXR1cyAtLW91dHB1dCB0ZXh0KTsgZWNobyAkU1RBVFVTOyBpZiBbIFwiJFNUQVRVU1wiID0gXCJTdWNjZXNzXCIgXTsgdGhlbiBleGl0IDA7IGVsaWYgWyBcIiRTVEFUVVNcIiA9IFwiRmFpbGVkXCIgXSB8fCBbIFwiJFNUQVRVU1wiID0gXCJDYW5jZWxsZWRcIiBdIHx8IFsgXCIkU1RBVFVTXCIgPSBcIlRpbWVkT3V0XCIgXTsgdGhlbiBhd3Mgc3NtIGdldC1jb21tYW5kLWludm9jYXRpb24gLS1jb21tYW5kLWlkIFwiJChjYXQgY21kMy50eHQpXCIgLS1pbnN0YW5jZS1pZCBcIiRJTlNUQU5DRV9JRFwiIC0tcXVlcnkgU3RhbmRhcmRFcnJvckNvbnRlbnQgLS1vdXRwdXQgdGV4dDsgZXhpdCAxOyBmaTsgc2xlZXAgNTsgZG9uZTsgZXhpdCAxJyxcclxuICAgICAgICAgICAgXSxcclxuICAgICAgICAgIH0sXHJcbiAgICAgICAgfSxcclxuICAgICAgICBhcnRpZmFjdHM6IHsgZmlsZXM6IFsnKiovKiddIH0sXHJcbiAgICAgIH0pLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gQWxsb3cgZGVwbG95IHByb2plY3QgdG8gdXNlIFNTTSBhbmQgRUNSXHJcbiAgICB0aGlzLmRlcGxveVByb2plY3QuYWRkVG9Sb2xlUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcclxuICAgICAgYWN0aW9uczogW1xyXG4gICAgICAgICdzc206U2VuZENvbW1hbmQnLFxyXG4gICAgICAgICdzc206R2V0Q29tbWFuZEludm9jYXRpb24nLFxyXG4gICAgICAgICdlYzI6RGVzY3JpYmVJbnN0YW5jZXMnLFxyXG4gICAgICAgICdlY3I6R2V0QXV0aG9yaXphdGlvblRva2VuJyxcclxuICAgICAgXSxcclxuICAgICAgcmVzb3VyY2VzOiBbJyonXSxcclxuICAgIH0pKTtcclxuXHJcbiAgICAvLyBDcmVhdGUgdGhlIHBpcGVsaW5lXHJcbiAgICB0aGlzLnBpcGVsaW5lID0gbmV3IGNvZGVwaXBlbGluZS5QaXBlbGluZSh0aGlzLCAnTWF0ZXJpYWxSZWNvZ25pdGlvblBpcGVsaW5lJywge1xyXG4gICAgICBwaXBlbGluZU5hbWU6ICdNYXRlcmlhbFJlY29nbml0aW9uU2VydmljZVBpcGVsaW5lJyxcclxuICAgICAgcm9sZTogcGlwZWxpbmVSb2xlLFxyXG4gICAgICBhcnRpZmFjdEJ1Y2tldDogdGhpcy5hcnRpZmFjdEJ1Y2tldCxcclxuICAgICAgc3RhZ2VzOiBbXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgc3RhZ2VOYW1lOiAnU291cmNlJyxcclxuICAgICAgICAgIGFjdGlvbnM6IFtcclxuICAgICAgICAgICAgbmV3IGNvZGVwaXBlbGluZV9hY3Rpb25zLkdpdEh1YlNvdXJjZUFjdGlvbih7XHJcbiAgICAgICAgICAgICAgYWN0aW9uTmFtZTogJ0dpdEh1Yl9Tb3VyY2UnLFxyXG4gICAgICAgICAgICAgIG93bmVyOiBwcm9wcy5naXRodWJPd25lcixcclxuICAgICAgICAgICAgICByZXBvOiBwcm9wcy5naXRodWJSZXBvLFxyXG4gICAgICAgICAgICAgIGJyYW5jaDogcHJvcHMuZ2l0aHViQnJhbmNoLFxyXG4gICAgICAgICAgICAgIG9hdXRoVG9rZW46IGNkay5TZWNyZXRWYWx1ZS5zZWNyZXRzTWFuYWdlcignZ2l0aHViLXRva2VuJyksXHJcbiAgICAgICAgICAgICAgb3V0cHV0OiBuZXcgY29kZXBpcGVsaW5lLkFydGlmYWN0KCdTb3VyY2VDb2RlJyksXHJcbiAgICAgICAgICAgICAgdmFyaWFibGVzTmFtZXNwYWNlOiAnU291cmNlVmFyaWFibGVzJyxcclxuICAgICAgICAgICAgfSksXHJcbiAgICAgICAgICBdLFxyXG4gICAgICAgIH0sXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgc3RhZ2VOYW1lOiAnQnVpbGQnLFxyXG4gICAgICAgICAgYWN0aW9uczogW1xyXG4gICAgICAgICAgICBuZXcgY29kZXBpcGVsaW5lX2FjdGlvbnMuQ29kZUJ1aWxkQWN0aW9uKHtcclxuICAgICAgICAgICAgICBhY3Rpb25OYW1lOiAnQnVpbGRJbWFnZScsXHJcbiAgICAgICAgICAgICAgcHJvamVjdDogdGhpcy5idWlsZFByb2plY3QsXHJcbiAgICAgICAgICAgICAgaW5wdXQ6IG5ldyBjb2RlcGlwZWxpbmUuQXJ0aWZhY3QoJ1NvdXJjZUNvZGUnKSxcclxuICAgICAgICAgICAgICBvdXRwdXRzOiBbbmV3IGNvZGVwaXBlbGluZS5BcnRpZmFjdCgnSW1hZ2VPdXRwdXQnKV0sXHJcbiAgICAgICAgICAgIH0pLFxyXG4gICAgICAgICAgXSxcclxuICAgICAgICB9LFxyXG4gICAgICAgIHtcclxuICAgICAgICAgIHN0YWdlTmFtZTogJ0RlcGxveScsXHJcbiAgICAgICAgICBhY3Rpb25zOiBbXHJcbiAgICAgICAgICAgIG5ldyBjb2RlcGlwZWxpbmVfYWN0aW9ucy5Db2RlQnVpbGRBY3Rpb24oe1xyXG4gICAgICAgICAgICAgIGFjdGlvbk5hbWU6ICdEZXBsb3lUb0VDMicsXHJcbiAgICAgICAgICAgICAgcHJvamVjdDogdGhpcy5kZXBsb3lQcm9qZWN0LFxyXG4gICAgICAgICAgICAgIGlucHV0OiBuZXcgY29kZXBpcGVsaW5lLkFydGlmYWN0KCdTb3VyY2VDb2RlJyksIC8vIG5vdCB1c2VkLCBmb3IgcGlwZWxpbmUgY29uc3RyYWludFxyXG4gICAgICAgICAgICB9KSxcclxuICAgICAgICAgIF0sXHJcbiAgICAgICAgfSxcclxuICAgICAgXSxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIFRhZyB0aGUgcGlwZWxpbmVcclxuICAgIGNkay5UYWdzLm9mKHRoaXMucGlwZWxpbmUpLmFkZCgnUHJvamVjdCcsICdNYXRlcmlhbFJlY29nbml0aW9uU2VydmljZScpO1xyXG4gICAgY2RrLlRhZ3Mub2YodGhpcy5waXBlbGluZSkuYWRkKCdFbnZpcm9ubWVudCcsICdEZXZlbG9wbWVudCcpO1xyXG4gIH1cclxufVxyXG5cclxuXHJcbiAgICAgICAgICAgICAgaW5wdXQ6IG5ldyBjb2RlcGlwZWxpbmUuQXJ0aWZhY3QoJ1NvdXJjZUNvZGUnKSxcclxuXHJcbiAgICAgICAgICAgICAgb3V0cHV0czogW25ldyBjb2RlcGlwZWxpbmUuQXJ0aWZhY3QoJ0ltYWdlT3V0cHV0JyldLFxyXG4gICAgICAgICAgICB9KSxcclxuXHJcbiAgICAgICAgICBdLFxyXG5cclxuICAgICAgICB9LFxyXG5cclxuICAgICAgICB7XHJcblxyXG4gICAgICAgICAgc3RhZ2VOYW1lOiAnRGVwbG95JyxcclxuXHJcbiAgICAgICAgICBhY3Rpb25zOiBbXHJcblxyXG4gICAgICAgICAgICBuZXcgY29kZXBpcGVsaW5lX2FjdGlvbnMuQ29kZUJ1aWxkQWN0aW9uKHtcclxuICAgICAgICAgICAgICBhY3Rpb25OYW1lOiAnRGVwbG95VG9FQzInLFxyXG4gICAgICAgICAgICAgIHByb2plY3Q6IHRoaXMuZGVwbG95UHJvamVjdCxcclxuICAgICAgICAgICAgICBpbnB1dDogbmV3IGNvZGVwaXBlbGluZS5BcnRpZmFjdCgnU291cmNlQ29kZScpLCAvLyBub3QgdXNlZCwgZm9yIHBpcGVsaW5lIGNvbnN0cmFpbnRcclxuICAgICAgICAgICAgfSksXHJcblxyXG4gICAgICAgICAgXSxcclxuXHJcbiAgICAgICAgfSxcclxuXHJcbiAgICAgIF0sXHJcblxyXG4gICAgfSk7XHJcblxyXG5cclxuXHJcbiAgICAvLyBUYWcgdGhlIHBpcGVsaW5lXHJcblxyXG4gICAgY2RrLlRhZ3Mub2YodGhpcy5waXBlbGluZSkuYWRkKCdQcm9qZWN0JywgJ01hdGVyaWFsUmVjb2duaXRpb25TZXJ2aWNlJyk7XHJcblxyXG4gICAgY2RrLlRhZ3Mub2YodGhpcy5waXBlbGluZSkuYWRkKCdFbnZpcm9ubWVudCcsICdEZXZlbG9wbWVudCcpO1xyXG5cclxuICB9XHJcblxyXG59XHJcblxyXG5cclxuIl19