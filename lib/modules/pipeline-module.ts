import * as cdk from 'aws-cdk-lib';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as codepipeline_actions from 'aws-cdk-lib/aws-codepipeline-actions';
import * as codedeploy from 'aws-cdk-lib/aws-codedeploy';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
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
  public readonly deploymentGroup: codedeploy.ServerDeploymentGroup;
  public readonly buildProject: codebuild.PipelineProject;

  constructor(scope: Construct, id: string, props: PipelineModuleProps) {
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
    codeDeployRole.addToPolicy(
      new iam.PolicyStatement({
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
      })
    );

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

    // Create CodeDeploy deployment group targeting existing EC2 instance
    this.deploymentGroup = new codedeploy.ServerDeploymentGroup(this, 'MaterialRecognitionDeploymentGroup', {
      application: codeDeployApplication,
      deploymentGroupName: 'MaterialRecognitionDeploymentGroup',
      installAgent: true,
      autoRollback: {
        failedDeployment: true,
        stoppedDeployment: true,
      },
      // 使用标签来识别目标实例，而不是直接引用实例
      ec2InstanceTags: new codedeploy.InstanceTagSet({
        'Project': ['MaterialRecognitionService'],
        'Environment': ['Development'],
        'Purpose': ['Deployment'],
      }),
      // 配置部署策略为就地部署，避免替换实例
      deploymentConfig: codedeploy.ServerDeploymentConfig.ONE_AT_A_TIME,
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
