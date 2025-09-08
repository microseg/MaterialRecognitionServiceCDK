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

    // Use provided ECR repository or create one
    if (props.ecrRepository) {
      this.ecrRepository = props.ecrRepository;
    } else {
      // Create ECR repository if not provided
      const ecrModule = new EcrModule(this, 'EcrModule', {
        repositoryName: 'material-recognition',
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
              'echo "Searching for Dockerfile..."',
              'find . -maxdepth 4 -name Dockerfile -print || true',
              'DOCKERFILE_PATH=$(find . -maxdepth 4 -path "*/MaterialRecognitionService/MaterialRecognitionService/Dockerfile.cpu" | head -n1)',
              'if [ -z "$DOCKERFILE_PATH" ]; then DOCKERFILE_PATH=$(find . -maxdepth 2 -name Dockerfile.cpu | head -n1); fi',
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

    // Generate SSM deployment JSON configuration
    // const writeDeployJson = [
    //   'cat >/tmp/deploy.json <<EOF',
    //   '{',
    //   ' "DocumentName": "AWS-RunShellScript",',
    //   ' "Parameters": {',
    //   ' "commands": [',
    //   ' "set -euo pipefail",',
    //   ' "sudo systemctl enable --now amazon-ssm-agent || true",',
    //   ' "sudo systemctl enable --now docker || true",',
    //   ' "ACCOUNT_REGISTRY=$(echo $ECR_REPO_URI | cut -d/ -f1)",',
    //   ' "aws ecr get-login-password --region $AWS_DEFAULT_REGION | docker login --username AWS --password-stdin $ACCOUNT_REGISTRY",',
    //   ' "docker pull $ECR_REPO_URI:latest",',
    //   ' "test -f /etc/systemd/system/matsight.service || (echo \'matsight.service missing\' >&2; exit 2)"',
    //   ' "sudo systemctl stop matsight || true",',
    //   ' "sudo sed -i s#${this.ecrRepository.repositoryUri}:[^ ]\\+#$FULL_IMAGE#g /etc/systemd/system/matsight.service",',
    //   ' "sudo systemctl daemon-reload"',
    //   ' "sudo systemctl restart matsight",',
    //   ' "sleep 3",',
    //   ' "curl -fsS http://127.0.0.1:5000/health || (journalctl -u matsight -n 100 --no-pager >&2; exit 1)"',
    //   ' ]',
    //   ' },',
    //   ' "TimeoutSeconds": 1800,',
    //   ' "CloudWatchOutputConfig": { "CloudWatchLogGroupName": "/matsight/deploy", "CloudWatchOutputEnabled": true }',
    //   '}',
    //   'EOF'
    // ].join('\n');
    const repoUri = this.ecrRepository.repositoryUri;
    const writeDeployJson = `
cat >/tmp/deploy.json <<EOF
{
 "DocumentName": "AWS-RunShellScript",
 "Parameters": {
  "commands": [
   "set -euo pipefail",
   "sudo systemctl enable --now amazon-ssm-agent || true",
   "sudo systemctl enable --now docker || true",
   "ACCOUNT_REGISTRY=$(echo $ECR_REPO_URI | cut -d/ -f1)",
   "aws ecr get-login-password --region $AWS_DEFAULT_REGION | docker login --username AWS --password-stdin $ACCOUNT_REGISTRY",
   "docker pull $FULL_IMAGE",
   "test -f /etc/systemd/system/matsight.service || (echo \\"matsight.service missing\\" >&2; exit 2)",
   "sudo systemctl stop matsight || true",
   "sudo sed -E -i s#${repoUri}:[^ ]+#$FULL_IMAGE#g /etc/systemd/system/matsight.service",
   "sudo systemctl daemon-reload",
   "sudo systemctl restart matsight",
   "sleep 3",
   "curl -fsS http://127.0.0.1:5000/health || (journalctl -u matsight -n 100 --no-pager >&2; exit 1)"
  ]
 },
 "TimeoutSeconds": 1800,
 "CloudWatchOutputConfig": { "CloudWatchOutputEnabled": true, "CloudWatchLogGroupName": "/matsight/deploy" }
}
EOF
`;


    // Deploy project: use SSM to pull and run the container on EC2 (no scripts generated)
    this.deployProject = new codebuild.PipelineProject(this, 'MaterialRecognitionDeployProject', {
      projectName: 'MaterialRecognitionDeployProject',
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
        computeType: codebuild.ComputeType.SMALL,
        privileged: false,
      },
      environmentVariables: {
        SSM_TARGET_TAG:   { value: 'SSMTarget' },
        SSM_TARGET_VALUE: { value: 'MaterialRecognitionService' },
        ECR_REPO_URI:     { value: this.ecrRepository.repositoryUri },
      },
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        env: { shell: 'bash' },
        phases: {
          build: {
            commands: [
              'set -euo pipefail',

              'IMAGE_TAG=$(jq -r .imageTag imageDetail.json 2>/dev/null || python3 -c \'import json;print(json.load(open("imageDetail.json"))["imageTag"])\' 2>/dev/null || echo latest)',
              'FULL_IMAGE="$ECR_REPO_URI:$IMAGE_TAG"',
              'echo "Deploying $FULL_IMAGE to $SSM_TARGET_TAG=$SSM_TARGET_VALUE"',
              writeDeployJson,
              'CMD_ID=$(aws ssm send-command --targets "Key=tag:$SSM_TARGET_TAG,Values=$SSM_TARGET_VALUE" --cli-input-json file:///tmp/deploy.json --query "Command.CommandId" --output text)',
              'echo "SSM CommandId: $CMD_ID"',
              'for i in $(seq 1 120); do ' +
                'STATUSES=$(aws ssm list-command-invocations --command-id "$CMD_ID" --details --query "commandInvocations[].Status" --output text | tr "\\n" " "); ' +
                'echo "[$i/120] $STATUSES"; ' +
                'if [ -n "$STATUSES" ] && ! echo "$STATUSES" | grep -qE "(InProgress|Pending|Delayed)"; then ' +
                  'if echo "$STATUSES" | grep -q "Failed"; then ' +
                    'aws ssm list-command-invocations --command-id "$CMD_ID" --details --query "commandInvocations[].CommandPlugins[].{Status:Status,StdOut:Output,StdErr:StandardErrorUrl}" --output table || true; ' +
                    'exit 1; ' +
                  'fi; ' +
                  'break; ' +
                'fi; ' +
                'sleep 5; ' +
              'done',
            ],
          },
        },
        artifacts: { files: ['imageDetail.json'] },
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
          stageName: 'Deploy',
          actions: [
            new codepipeline_actions.CodeBuildAction({
              actionName: 'DeployToEC2',
              project: this.deployProject,
              input: buildOutput,
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
