# AWS Web Hosting

This repo can publish the Expo web build to AWS as a static site:

- Expo exports `apps/mobile/dist/web`.
- GitHub Actions assumes an AWS role through GitHub OIDC.
- The workflow syncs static files to S3.
- CloudFront serves the site and falls back to `index.html` for client-side routes.

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

2. Deploy the CloudFormation stack:

   ```sh
   aws cloudformation deploy \
     --stack-name shake2-web \
     --template-file infra/aws/web-hosting.yml \
     --capabilities CAPABILITY_NAMED_IAM \
     --parameter-overrides \
       GitHubOwner=<github-owner> \
       GitHubRepo=shake2 \
       GitHubBranch=main \
       GitHubOidcProviderArn=arn:aws:iam::<account-id>:oidc-provider/token.actions.githubusercontent.com
   ```

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

The workflow deploys on pushes to `main` and can also be run manually.

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

- The CloudFormation stack uses the default CloudFront domain. Add custom domain,
  ACM certificate, and Route 53 records later when the production hostname is known.
- The CloudFront distribution maps 403 and 404 responses to `index.html` so native
  navigation URLs like `/LocalGameStart` continue to load after refresh.
- This is static web hosting only. It does not add Cognito, AppSync, DynamoDB,
  multiplayer, or any game backend.

## References

- [Expo web deployment](https://docs.expo.dev/deploy/web/)
- [GitHub OIDC for AWS](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws)
- [AWS configure-aws-credentials action](https://github.com/aws-actions/configure-aws-credentials)
