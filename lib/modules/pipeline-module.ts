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
  ecrRepository?: ecr.IRepository; // Add optional ECR repository
  prodEnv?: { [key: string]: string };
  betaEnv?: { [key: string]: string };
}

export class PipelineModule extends Construct {
  public readonly pipeline: codepipeline.Pipeline;
  public readonly artifactBucket: s3.Bucket;
  public readonly buildProject: codebuild.PipelineProject;
  public readonly deployProject: codebuild.PipelineProject;
  public readonly deployProjectBeta: codebuild.PipelineProject;
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

    // Use provided ECR repository or create one
    if (props.ecrRepository) {
      this.ecrRepository = props.ecrRepository;
    } else {
      // Create ECR repository if not provided
      const ecrModule = new EcrModule(this, 'EcrModule', {
        repositoryName: 'material-recognition-service',
        importExisting: true,
        removalPolicy: cdk.RemovalPolicy.RETAIN,
        imageScanOnPush: true,
      });
      this.ecrRepository = ecrModule.repository;
    }

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
        env: { shell: 'bash' },
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
              'DOCKERFILE_PATH=MaterialRecognitionService/Dockerfile',
              'if [ ! -f "$DOCKERFILE_PATH" ]; then DOCKERFILE_PATH=$(find . -maxdepth 4 -path "*/MaterialRecognitionService/Dockerfile" -print | head -n1); fi',
              'if [ -z "$DOCKERFILE_PATH" ] || [ ! -f "$DOCKERFILE_PATH" ]; then DOCKERFILE_PATH=$(find . -maxdepth 5 -name Dockerfile -print | head -n1); fi',
              'if [ -z "$DOCKERFILE_PATH" ] || [ ! -f "$DOCKERFILE_PATH" ]; then echo "Dockerfile not found"; find . -maxdepth 6 -name Dockerfile -print; exit 1; fi',
              'CONTEXT_DIR=$(dirname "$DOCKERFILE_PATH")',
              'echo "Using DOCKERFILE_PATH=$DOCKERFILE_PATH"',
              'echo "CONTEXT_DIR=$CONTEXT_DIR"',
              'ls -la "$CONTEXT_DIR" || true',
              'echo "Building image $ECR_REPO_URI:$IMAGE_TAG"',
              'docker build --pull -f "$DOCKERFILE_PATH" -t $ECR_REPO_URI:$IMAGE_TAG "$CONTEXT_DIR"',
            ],
          },
          post_build: {
            commands: [
              'docker push $ECR_REPO_URI:$IMAGE_TAG',
              'docker tag  $ECR_REPO_URI:$IMAGE_TAG $ECR_REPO_URI:latest',
              'docker push $ECR_REPO_URI:latest',
              'printf \'{"imageTag":"%s"}\' "$IMAGE_TAG" > imageDetail.json',
              'echo "imageDetail.json:" && cat imageDetail.json',
            ],
          },
        },
        artifacts: {
          files: ['imageDetail.json'],
        },
      }),
    });

    // Allow build project to push/pull the ECR repository
    this.ecrRepository.grantPullPush(this.buildProject);
    this.buildProject.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'ecr:GetAuthorizationToken',
        'ecr:BatchCheckLayerAvailability',
        'ecr:GetDownloadUrlForLayer',
        'ecr:BatchGetImage',
        'ecr:InitiateLayerUpload',
        'ecr:UploadLayerPart',
        'ecr:CompleteLayerUpload',
        'ecr:PutImage',
        'sts:GetCallerIdentity',
      ],
      resources: ['*'],
    }));

    const account = cdk.Stack.of(this).account;
    const region = cdk.Stack.of(this).region;

    this.deployProject = new codebuild.PipelineProject(this, 'Production_Deploy', {
      projectName: 'MaterialRecognitionProductionDeploy',
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_5_0,
      },
      environmentVariables: {
        ENVIRONMENT:  { value: "Production" },
        SSM_TARGET:   { value: "MaterialRecognitionService" },
        ECR_REPO_URI:     { value: this.ecrRepository.repositoryUri },
      },
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        env: { shell: 'bash' },
        phases: {
          build: {
            commands: [
              'set -euo pipefail',
              // Send SSM command and capture CommandId
              `CMD_ID=$(aws ssm send-command \
                --targets "Key=tag:SSMTarget,Values=$SSM_TARGET" \
                          "Key=tag:Environment,Values=$ENVIRONMENT" \
                --document-name "AWS-RunShellScript" \
                --comment "Deploy latest container" \
                --parameters 'commands=[
                  "set -euo pipefail",
                  "ACCOUNT=${account}",
                  "REGION=${region}",
                  "REPO=${this.ecrRepository.repositoryUri}",
                  "aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin ${account}.dkr.ecr.${region}.amazonaws.com",
                  "docker system prune -af --volumes || true",
                  "docker pull $REPO:latest",
                  "for c in $(docker ps -q --filter publish=5000); do docker rm -f $c; done",
                  "docker rm -f material-recognition || true",
                  "mkdir -p /opt/maskterial",
                  "if docker run --rm $REPO:latest test -f /app/config/.env.production; then docker run --rm $REPO:latest cat /app/config/.env.production > /opt/maskterial/.env; else echo APP_ENV=production > /opt/maskterial/.env; fi",
                  "mkdir -p /opt/maskterial/data",
                  "docker run -d --restart unless-stopped -p 5000:5000 --name material-recognition --env APP_ENV=production --env-file /opt/maskterial/.env -v /opt/maskterial/data:/opt/maskterial/data $REPO:latest",
                  "for i in $(seq 1 20); do curl -fsS http://127.0.0.1:5000/health && exit 0; echo waiting...; sleep 2; done",
                  "echo FAIL: service not healthy; docker logs --tail 200 material-recognition >&2; exit 1"
                ]' \
                --query 'Command.CommandId' --output text)`,
              'echo "SSM CommandId: $CMD_ID"',
              // Wait for command completion and fail build on error
              'for i in $(seq 1 60); do STATUSES=$(aws ssm list-command-invocations --command-id "$CMD_ID" --details --query "CommandInvocations[*].Status" --output text); echo "Statuses: $STATUSES"; if [ -n "$STATUSES" ] && ! echo "$STATUSES" | tr " " "\n" | grep -qE "^(Pending|InProgress|Delayed)$"; then break; fi; sleep 5; done',
              'if echo "$STATUSES" | tr " " "\n" | grep -qE "(Failed|Cancelled|TimedOut)"; then echo "SSM command failed" >&2; aws ssm list-command-invocations --command-id "$CMD_ID" --details --output table || true; exit 1; fi',
              'aws ssm list-command-invocations --command-id "$CMD_ID" --details --query "CommandInvocations[*].{InstanceId:InstanceId,Status:Status,StatusDetails:StatusDetails}" --output table || true',
            ],
          },
        },
      }),
    });

    // Beta deploy project
    this.deployProjectBeta = new codebuild.PipelineProject(this, 'Beta_Deploy', {
      projectName: 'MaterialRecognitionBetaDeploy',
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_5_0,
      },
      environmentVariables: {
        ENVIRONMENT:  { value: "Beta" },
        SSM_TARGET:   { value: "MaterialRecognitionService-Beta" },
        ECR_REPO_URI:     { value: this.ecrRepository.repositoryUri },
      },
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        env: { shell: 'bash' },
        phases: {
          build: {
            commands: [
              'set -euo pipefail',
              `CMD_ID=$(aws ssm send-command \
                  --targets "Key=tag:SSMTarget,Values=$SSM_TARGET" \
                            "Key=tag:Environment,Values=$ENVIRONMENT" \
                  --document-name "AWS-RunShellScript" \
                  --comment "Deploy latest container (Beta)" \
                  --parameters 'commands=[
                    "set -euo pipefail",
                    "ACCOUNT=${account}",
                    "REGION=${region}",
                    "REPO=${this.ecrRepository.repositoryUri}",
                    "aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin ${account}.dkr.ecr.${region}.amazonaws.com",
                    "docker system prune -af --volumes || true",
                    "docker pull $REPO:latest",
                    "for c in $(docker ps -q --filter publish=5000); do docker rm -f $c; done",
                    "docker rm -f material-recognition || true",
                    "mkdir -p /opt/maskterial",
                    "if docker run --rm $REPO:latest test -f /app/config/.env.beta; then docker run --rm $REPO:latest cat /app/config/.env.beta > /opt/maskterial/.env; fi",
                    "if [ ! -s /opt/maskterial/.env ]; then echo APP_ENV=beta > /opt/maskterial/.env; echo S3_BUCKET_NAME=matsight-customer-images-dev >> /opt/maskterial/.env; echo DYNAMODB_TABLE_NAME=CustomerImages-dev >> /opt/maskterial/.env; echo AWS_DEFAULT_REGION=$REGION >> /opt/maskterial/.env; echo MODELS_S3_BUCKET=matsight-maskterial-models-v2 >> /opt/maskterial/.env; echo PORT=5000 >> /opt/maskterial/.env; fi",
                    "mkdir -p /opt/maskterial/data",
                    "docker rm -f material-recognition || true",
                    "docker run -d --restart unless-stopped -p 5000:5000 --name material-recognition --env APP_ENV=beta --env-file /opt/maskterial/.env -v /opt/maskterial/data:/opt/maskterial/data $REPO:latest",
                    "for i in $(seq 1 20); do curl -fsS http://127.0.0.1:5000/health && exit 0; echo waiting...; sleep 2; done",
                    "echo FAIL: service not healthy; docker logs --tail 200 material-recognition >&2; exit 1"
                ]' \
                --query 'Command.CommandId' --output text)`,
              'echo "SSM CommandId: $CMD_ID"',
              'for i in $(seq 1 60); do STATUSES=$(aws ssm list-command-invocations --command-id "$CMD_ID" --details --query "CommandInvocations[*].Status" --output text); echo "Statuses: $STATUSES"; if [ -n "$STATUSES" ] && ! echo "$STATUSES" | tr " " "\n" | grep -qE "^(Pending|InProgress|Delayed)$"; then break; fi; sleep 5; done',
              'if echo "$STATUSES" | tr " " "\n" | grep -qE "(Failed|Cancelled|TimedOut)"; then echo "SSM command failed" >&2; aws ssm list-command-invocations --command-id "$CMD_ID" --details --output table || true; exit 1; fi',
              'aws ssm list-command-invocations --command-id "$CMD_ID" --details --query "CommandInvocations[*].{InstanceId:InstanceId,Status:Status,StatusDetails:StatusDetails}" --output table || true',
            ],
          },
        },
      }),
    });

    // Allow deploy project to use SSM and ECR
    this.deployProject.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'ssm:SendCommand',
        'ssm:GetCommandInvocation',
        'ssm:ListCommandInvocations',
        'ec2:DescribeInstances',
        'ecr:GetAuthorizationToken',
        'ecr:BatchCheckLayerAvailability',
        'ecr:GetDownloadUrlForLayer',
        'ecr:BatchGetImage',
        'sts:GetCallerIdentity',
      ],
      resources: ['*'],
    }));

    this.deployProjectBeta.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'ssm:SendCommand',
        'ssm:GetCommandInvocation',
        'ssm:ListCommandInvocations',
        'ec2:DescribeInstances',
        'ecr:GetAuthorizationToken',
        'ecr:BatchCheckLayerAvailability',
        'ecr:GetDownloadUrlForLayer',
        'ecr:BatchGetImage',
        'sts:GetCallerIdentity',
      ],
      resources: ['*'],
    }));


    const sourceOutput = new codepipeline.Artifact('SourceCode');
    const buildOutput  = new codepipeline.Artifact('BuildOutput');

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
              output: sourceOutput,
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
              input: sourceOutput,
              outputs: [buildOutput],
            }),
          ],
        },
        {
          stageName: 'Beta',
          actions: [
            new codepipeline_actions.CodeBuildAction({
              actionName: 'Beta_Deploy',
              project: this.deployProjectBeta,
              input: buildOutput,
            }),
          ],
        },
        {
          stageName: 'Approval',
          actions: [
            new codepipeline_actions.ManualApprovalAction({
              actionName: 'Manual_Approval',
              // You can optionally add notification options here, e.g. externalEntityLink/additionalInformation
            }),
          ],
        },
        {
          stageName: 'Production',
          actions: [
            new codepipeline_actions.CodeBuildAction({
              actionName: 'Production_Deploy',
              project: this.deployProject,
              input: buildOutput,
            }),
          ],
        },
      ],
    });

    // Tag the pipeline
    cdk.Tags.of(this.pipeline).add('Project', 'MaterialRecognitionService');
  }
}
