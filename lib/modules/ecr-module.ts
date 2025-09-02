import * as cdk from 'aws-cdk-lib';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import { Construct } from 'constructs';

export interface EcrModuleProps {
  repositoryName: string;
  // If true (default), import existing repository by name; if false, create a new one
  importExisting?: boolean;
  imageScanOnPush?: boolean;
  removalPolicy?: cdk.RemovalPolicy;
}

export class EcrModule extends Construct {
  public readonly repository: ecr.IRepository;

  constructor(scope: Construct, id: string, props: EcrModuleProps) {
    super(scope, id);

    if (props.importExisting !== false) {
      // Import an existing repository by name to avoid CFN conflicts
      this.repository = ecr.Repository.fromRepositoryName(this, 'Repository', props.repositoryName);
    } else {
      // Create a new repository
      this.repository = new ecr.Repository(this, 'Repository', {
        repositoryName: props.repositoryName,
        imageScanOnPush: props.imageScanOnPush ?? true,
        removalPolicy: props.removalPolicy ?? cdk.RemovalPolicy.RETAIN,
      });
    }
  }
}


