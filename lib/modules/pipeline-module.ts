import * as cdk from 'aws-cdk-lib';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as codepipeline_actions from 'aws-cdk-lib/aws-codepipeline-actions';
import * as codedeploy from 'aws-cdk-lib/aws-codedeploy';
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
  ecrRepository?: ecr.IRepository;
  codeDeployApplication?: codedeploy.IServerApplication;
  codeDeployDeploymentGroup?: codedeploy.IServerDeploymentGroup;
}

export class PipelineModule extends Construct {
  public readonly pipeline: codepipeline.Pipeline;
  public readonly artifactBucket: s3.Bucket;
  public readonly buildProject: codebuild.PipelineProject;
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
              "echo \"Logging into ECR\"",
              "ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)",
              "aws ecr get-login-password --region $AWS_DEFAULT_REGION | docker login --username AWS --password-stdin $ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com",
              "COMMIT_ID=$(echo $CODEBUILD_RESOLVED_SOURCE_VERSION | cut -c 1-7)",
              "IMAGE_TAG=${COMMIT_ID:-latest}",
              "echo Using tag $IMAGE_TAG"
            ],
          },
          build: {
            commands: [
              "echo \"PWD=$(pwd)\"",
              "rm -rf MaskTerialSource",
              "git clone https://github.com/microseg/MaskTerial.git MaskTerialSource",
              "echo \"Using existing Dockerfile.cpu from MaskTerial repository...\"",
              "echo \"Building MaskTerial CPU image $ECR_REPO_URI:$IMAGE_TAG\"",
              "docker build -f MaskTerialSource/Dockerfile.cpu -t $ECR_REPO_URI:$IMAGE_TAG MaskTerialSource",
              "docker tag $ECR_REPO_URI:$IMAGE_TAG $ECR_REPO_URI:latest",
              "docker push $ECR_REPO_URI:$IMAGE_TAG",
              "docker push $ECR_REPO_URI:latest",
              "printf \"{\"imageTag\":\"%s\"}\" \"${IMAGE_TAG}\" > imageDetail.json",
              "echo \"imageDetail.json:\" && cat imageDetail.json"
            ],
          },
          post_build: {
            commands: [
              'echo "Build stage completed. Image pushed to ECR."',
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


    const sourceOutput = new codepipeline.Artifact('SourceCode');
    const buildOutput  = new codepipeline.Artifact('BuildOutput');

    // Build pipeline stages
    const stages: codepipeline.StageProps[] = [
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
            trigger: codepipeline_actions.GitHubTrigger.WEBHOOK,
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
    ];

    // Add CodeDeploy stage if available
    if (props.codeDeployDeploymentGroup) {
      stages.push({
        stageName: 'Deploy',
        actions: [
          new codepipeline_actions.CodeDeployServerDeployAction({
            actionName: 'DeployToEC2',
            input: sourceOutput,
            deploymentGroup: props.codeDeployDeploymentGroup,
          }),
        ],
      });
    }

    // Create the pipeline
    this.pipeline = new codepipeline.Pipeline(this, 'MaterialRecognitionPipeline', {
      pipelineName: 'MaterialRecognitionServicePipeline',
      role: pipelineRole,
      artifactBucket: this.artifactBucket,
      stages: stages,
    });

    // Tag the pipeline
    cdk.Tags.of(this.pipeline).add('Project', 'MaterialRecognitionService');
  }
}











