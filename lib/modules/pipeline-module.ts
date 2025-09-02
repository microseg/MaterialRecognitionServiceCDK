import * as cdk from 'aws-cdk-lib';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as codepipeline_actions from 'aws-cdk-lib/aws-codepipeline-actions';
// import * as codedeploy from 'aws-cdk-lib/aws-codedeploy';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import { EcrModule } from './ecr-module';
import { Construct } from 'constructs';

export interface PipelineModuleProps {
  githubTokenSecretArn: string;
  githubOwner: string;
  githubRepo: string;
  githubBranch: string;
  deploymentInstance: ec2.Instance;
  vpc: ec2.IVpc;
}

export class PipelineModule extends Construct {
  public readonly pipeline: codepipeline.Pipeline;
  public readonly artifactBucket: s3.Bucket;
  public readonly buildProject: codebuild.PipelineProject;
  public readonly deployProject: codebuild.PipelineProject;
  public readonly ecrRepository: ecr.IRepository;

  constructor(scope: Construct, id: string, props: PipelineModuleProps) {
    super(scope, id);

    // Create S3 bucket for pipeline artifacts
    this.artifactBucket = new s3.Bucket(this, 'PipelineArtifactBucket', {
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
    });

    // ECR repository (extracted into its own module)
    const ecrModule = new EcrModule(this, 'EcrModule', {
      repositoryName: 'material-recognition',
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
    pipelineRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'codedeploy:*',
        ],
        resources: ['*'],
      })
    );

    // Grant pipeline role access to Secrets Manager
    pipelineRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'secretsmanager:GetSecretValue',
        ],
        resources: [props.githubTokenSecretArn],
      })
    );

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
