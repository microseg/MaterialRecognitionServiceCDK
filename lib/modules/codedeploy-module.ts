import * as cdk from 'aws-cdk-lib';
import * as codedeploy from 'aws-cdk-lib/aws-codedeploy';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface CodeDeployModuleProps {
  ec2Instance: ec2.Instance;
  applicationName?: string;
  deploymentGroupName?: string;
}

export class CodeDeployModule extends Construct {
  public readonly application: codedeploy.ServerApplication;
  public readonly deploymentGroup: codedeploy.ServerDeploymentGroup;

  constructor(scope: Construct, id: string, props: CodeDeployModuleProps) {
    super(scope, id);

    // Create CodeDeploy application
    this.application = new codedeploy.ServerApplication(this, 'MaskTerialApplication', {
      applicationName: props.applicationName || 'MaskTerial-Application',
    });

    // EC2 instance already has necessary permissions via its role
    // CodeDeploy agent will use the instance role to download deployment bundles

    // Create deployment group
    this.deploymentGroup = new codedeploy.ServerDeploymentGroup(this, 'MaskTerialDeploymentGroup', {
      application: this.application,
      deploymentGroupName: props.deploymentGroupName || 'MaskTerial-Production',
      ec2InstanceTags: new codedeploy.InstanceTagSet({
        'SSMTarget': ['MaterialRecognitionService'],
        'Environment': ['Production'],
      }),
      installAgent: true,
      deploymentConfig: codedeploy.ServerDeploymentConfig.ALL_AT_ONCE,
      autoRollback: {
        failedDeployment: true,
        stoppedDeployment: true,
      },
    });

    // Output deployment information
    new cdk.CfnOutput(this, 'DeploymentGroupName', {
      value: this.deploymentGroup.deploymentGroupName,
      description: 'CodeDeploy Deployment Group Name',
    });

    new cdk.CfnOutput(this, 'ApplicationName', {
      value: this.application.applicationName,
      description: 'CodeDeploy Application Name',
    });

    // Tag resources
    cdk.Tags.of(this.application).add('Project', 'MaskTerial');
    cdk.Tags.of(this.deploymentGroup).add('Project', 'MaskTerial');
  }
}

