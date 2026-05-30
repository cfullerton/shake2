import { RemovalPolicy } from "aws-cdk-lib";
import {
  AccountRecovery,
  UserPool,
  UserPoolClient,
  VerificationEmailStyle
} from "aws-cdk-lib/aws-cognito";
import { Construct } from "constructs";

export interface MultiplayerAuthConstructProps {
  readonly removalPolicy: RemovalPolicy;
  readonly userPoolClientName: string;
  readonly userPoolName: string;
}

export class MultiplayerAuthConstruct extends Construct {
  readonly userPool: UserPool;
  readonly userPoolClient: UserPoolClient;

  constructor(scope: Construct, id: string, props: MultiplayerAuthConstructProps) {
    super(scope, id);

    this.userPool = new UserPool(this, "UserPool", {
      accountRecovery: AccountRecovery.EMAIL_ONLY,
      autoVerify: {
        email: true
      },
      removalPolicy: props.removalPolicy,
      selfSignUpEnabled: true,
      signInAliases: {
        email: true,
        username: true
      },
      standardAttributes: {
        email: {
          mutable: true,
          required: true
        }
      },
      userPoolName: props.userPoolName,
      userVerification: {
        emailStyle: VerificationEmailStyle.CODE
      }
    });

    this.userPoolClient = this.userPool.addClient("AppClient", {
      authFlows: {
        userPassword: true,
        userSrp: true
      },
      disableOAuth: true,
      generateSecret: false,
      preventUserExistenceErrors: true,
      userPoolClientName: props.userPoolClientName
    });
  }
}
