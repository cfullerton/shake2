# AWS Web Hosting

This repo can publish the Expo web build to AWS as a static site:

- Expo exports `apps/mobile/dist/web`.
- GitHub Actions assumes an AWS role through GitHub OIDC.
- The workflow syncs static files to S3.
- CloudFront serves the site and falls back to `index.html` for client-side routes.
- Optionally, CloudFront serves a custom domain with an ACM certificate.

No AWS access keys should be stored in GitHub.

## Files

- `.github/workflows/deploy-web.yml` builds and deploys the web bundle.
- `infra/aws/web-hosting.yml` provisions an S3 bucket, CloudFront distribution, and least-privilege deploy role.
- `apps/mobile/package.json` provides `npm run build:web`.

## One-Time AWS Setup

1. Create or identify the GitHub OIDC provider in the AWS account:

   - Provider URL: `https://token.actions.githubusercontent.com`
   - Audience: `sts.amazonaws.com`

   Most AWS accounts should have one provider per account. If one already exists,
   reuse it instead of creating a duplicate.

2. Deploy the CloudFormation stack.

   For this repository, use:

   - `GitHubOwner=cfullerton`
   - `GitHubRepo=shake2`
   - `GitHubBranch=main`

   The owner must match the GitHub repository owner, not the local macOS user or
   AWS account name. GitHub OIDC trust policies are case-sensitive.

   Default CloudFront domain only:

   ```sh
   aws cloudformation deploy \
     --stack-name shake2-web \
     --template-file infra/aws/web-hosting.yml \
     --capabilities CAPABILITY_NAMED_IAM \
     --parameter-overrides \
       GitHubOwner=cfullerton \
       GitHubRepo=shake2 \
       GitHubBranch=main \
       GitHubOidcProviderArn=arn:aws:iam::<account-id>:oidc-provider/token.actions.githubusercontent.com
   ```

   Custom domain with a new ACM certificate:

   ```sh
   aws cloudformation deploy \
     --region us-east-1 \
     --stack-name shake2-web \
     --template-file infra/aws/web-hosting.yml \
     --capabilities CAPABILITY_NAMED_IAM \
     --parameter-overrides \
       GitHubOwner=cfullerton \
       GitHubRepo=shake2 \
       GitHubBranch=main \
       GitHubOidcProviderArn=arn:aws:iam::<account-id>:oidc-provider/token.actions.githubusercontent.com \
       CustomDomainName=play.example.com \
       HostedZoneId=<route53-hosted-zone-id>
   ```

   CloudFront requires ACM certificates for alternate domain names to live in
   `us-east-1`. The template can create and DNS-validate the certificate
   automatically only when the stack is deployed in `us-east-1` and the hosted
   zone is in Route 53 in the same AWS account.

   Custom domain with an existing ACM certificate:

   ```sh
   aws cloudformation deploy \
     --stack-name shake2-web \
     --template-file infra/aws/web-hosting.yml \
     --capabilities CAPABILITY_NAMED_IAM \
     --parameter-overrides \
       GitHubOwner=cfullerton \
       GitHubRepo=shake2 \
       GitHubBranch=main \
       GitHubOidcProviderArn=arn:aws:iam::<account-id>:oidc-provider/token.actions.githubusercontent.com \
       CustomDomainName=play.example.com \
       AcmCertificateArn=arn:aws:acm:us-east-1:<account-id>:certificate/<certificate-id> \
       HostedZoneId=<route53-hosted-zone-id>
   ```

   `HostedZoneId` is optional when using an existing certificate. If omitted,
   create the DNS record yourself as a CNAME or alias to the `CloudFrontDomainName`
   stack output.

3. Capture the stack outputs:

   ```sh
   aws cloudformation describe-stacks \
     --stack-name shake2-web \
     --query "Stacks[0].Outputs"
   ```

## GitHub Repository Variables

Set these repository variables in GitHub:

| Variable | Value |
| --- | --- |
| `AWS_REGION` | AWS region where the stack was deployed, for example `us-east-1`. |
| `AWS_ROLE_TO_ASSUME` | `GitHubActionsRoleArn` stack output. |
| `AWS_S3_BUCKET` | `BucketName` stack output. |
| `AWS_CLOUDFRONT_DISTRIBUTION_ID` | `CloudFrontDistributionId` stack output. Optional but recommended. |
| `EXPO_PUBLIC_SHAKE2_AWS_REGION` | AWS region where the multiplayer stack was deployed. |
| `EXPO_PUBLIC_SHAKE2_APPSYNC_GRAPHQL_URL` | `GraphqlApiUrl` output from the multiplayer stack. |
| `EXPO_PUBLIC_SHAKE2_COGNITO_USER_POOL_ID` | `UserPoolId` output from the multiplayer stack. |
| `EXPO_PUBLIC_SHAKE2_COGNITO_USER_POOL_CLIENT_ID` | `UserPoolClientId` output from the multiplayer stack. |
| `EXPO_PUBLIC_SHAKE2_APPSYNC_REALTIME_URL` | Optional AppSync realtime URL override. If omitted, the app derives it from the GraphQL URL. |

If a custom domain is configured, the stack also outputs `CustomDomainUrl` and
`CertificateArn`.

The `EXPO_PUBLIC_SHAKE2_*` values are public client configuration, not secrets.
Expo bakes them into the web JavaScript bundle at build time, so changing one of
these GitHub variables requires a new workflow run and redeploy. Do not store
smoke usernames, smoke passwords, AWS access keys, or other credentials in
`EXPO_PUBLIC_*` variables.

The workflow deploys on pushes to `main` and can also be run manually.

## OIDC Troubleshooting

If the workflow fails at `Configure AWS credentials` with an assume-role or
`AssumeRoleWithWebIdentity` access denied error, compare these two values:

1. The workflow log line from `Print OIDC trust context`:

   ```text
   Expected IAM subject: repo:cfullerton/shake2:ref:refs/heads/main
   ```

2. The CloudFormation stack output named `GitHubOidcSubject`.

They must match exactly. If they do not, update the CloudFormation stack with the
correct `GitHubOwner`, `GitHubRepo`, or `GitHubBranch` parameter.

Common causes:

- `GitHubOwner` was set to `connerfullerton` instead of `cfullerton`.
- The workflow was manually run from a branch other than `main`.
- The `AWS_ROLE_TO_ASSUME` variable points to a role from a different AWS account
  or older stack.
- The IAM OIDC provider does not exist in the target AWS account, or its audience
  is not exactly `sts.amazonaws.com`. Watch for accidental whitespace when
  creating the provider.

You can inspect the stack values with:

```sh
aws cloudformation describe-stacks \
  --stack-name shake2-web \
  --query "Stacks[0].Outputs"
```

You can inspect the IAM OIDC provider audience with:

```sh
aws iam get-open-id-connect-provider \
  --open-id-connect-provider-arn arn:aws:iam::<account-id>:oidc-provider/token.actions.githubusercontent.com \
  --query "ClientIDList"
```

## Local Build Check

Run this before the first deployment:

```sh
npm run build:web
```

Expected output is written to:

```text
apps/mobile/dist/web
```

## Cache Behavior

The workflow uploads hashed assets with long immutable caching and uploads
`index.html` plus `metadata.json` with no-cache headers. If a CloudFront
distribution ID is configured, the workflow invalidates `/*` after upload.

## Notes

- The CloudFormation stack can use the default CloudFront domain or a custom
  domain with ACM and optional Route 53 alias records.
- The CloudFront distribution maps 403 and 404 responses to `index.html` so native
  navigation URLs like `/LocalGameStart` continue to load after refresh.
- This is static web hosting only. It does not add Cognito, AppSync, DynamoDB,
  multiplayer, or any game backend.

## References

- [Expo web deployment](https://docs.expo.dev/deploy/web/)
- [GitHub OIDC for AWS](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws)
- [AWS configure-aws-credentials action](https://github.com/aws-actions/configure-aws-credentials)
