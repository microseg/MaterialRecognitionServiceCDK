import * as cdk from 'aws-cdk-lib';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as iam from 'aws-cdk-lib/aws-iam';
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
  public readonly isImported: boolean;

  constructor(scope: Construct, id: string, props: EcrModuleProps) {
    super(scope, id);

    if (props.importExisting !== false) {
      // Import an existing repository by name to avoid CFN conflicts
      this.repository = ecr.Repository.fromRepositoryName(this, 'Repository', props.repositoryName);
      this.isImported = true;
      console.log(`Importing existing ECR repository: ${props.repositoryName}`);
    } else {
      // Create a new repository
      this.repository = this.createNewRepository(props);
      this.isImported = false;
      console.log(`Creating new ECR repository: ${props.repositoryName}`);
    }
  }

  /**
   * Create a new ECR repository with the specified configuration
   */
  private createNewRepository(props: EcrModuleProps): ecr.Repository {
    return new ecr.Repository(this, 'Repository', {
      repositoryName: props.repositoryName,
      imageScanOnPush: props.imageScanOnPush ?? true,
      removalPolicy: props.removalPolicy ?? cdk.RemovalPolicy.RETAIN,
    });
  }
}


