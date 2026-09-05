# GitHub Actions production deployment

`.github/workflows/deploy.yml` deploys the infrastructure and frontend on pushes to `main`. You can also run it manually from the Actions tab on `main`. Other branches cannot deploy. It checks types, builds the frontend, and runs the meal-planner browser suite before obtaining AWS credentials. These checks are not the entire test suite. Deployments run one at a time and wait for CloudFront invalidation to finish.

## One-time activation by an AWS/GitHub administrator

The target is the existing `PantryStack` in AWS account `698643713254`, region `eu-north-1`. Confirm this is the intended production account. The role below can update its infrastructure and publish/delete website objects. CDK's bootstrap CloudFormation execution role determines infrastructure privileges; standard bootstrapping grants it administrator permissions. Protect `main` with reviews and restrict who can push or change workflows.

1. Install AWS CLI v2 and authenticate to this account, preferably with AWS SSO. Confirm `aws sts get-caller-identity` reports the intended account. Never put AWS access keys in the repository.
2. Bootstrap CDK if the target environment has not already been bootstrapped:

   ```sh
   cd infrastructure
   npx cdk bootstrap aws://698643713254/eu-north-1
   cd ..
   ```

3. In AWS IAM, check whether the OIDC provider `token.actions.githubusercontent.com` already exists. If absent, create it with provider URL `https://token.actions.githubusercontent.com` and audience `sts.amazonaws.com`:

   ```sh
   aws iam create-open-id-connect-provider \
     --url https://token.actions.githubusercontent.com \
     --client-id-list sts.amazonaws.com
   ```

4. Create the deployment role with the supplied trust and permissions policies:

   ```sh
   aws iam create-role \
     --role-name PantryGitHubDeploy \
     --assume-role-policy-document file://docs/github-oidc-trust.json
   aws iam put-role-policy \
     --role-name PantryGitHubDeploy \
     --policy-name PantryDeployment \
     --policy-document file://docs/github-deploy-permissions.json
   ```

   If the role already exists, review it before using `update-assume-role-policy` instead of `create-role`. The trust policy accepts only this repository's `main` branch. The permissions assume the standard CDK bootstrap qualifier `hnb659fds` and default generated `pantrystack-websitebucket*` bucket name. If the existing bootstrap/bucket differs, use its actual names. Once provisioned, narrow the S3 bucket and CloudFront distribution resources to their exact ARNs.

5. In GitHub **Settings → Secrets and variables → Actions → Variables**, add the repository variable:

   ```text
   AWS_DEPLOY_ROLE_ARN = arn:aws:iam::698643713254:role/PantryGitHubDeploy
   ```

   No AWS access-key secrets are required. This workflow deliberately uses branch-based OIDC trust, with no GitHub Environment. Adding an Environment later changes the OIDC subject and requires updating the trust policy and configuring environment deployment branch restrictions.

6. Commit and push the workflow, `.nvmrc`, deployment-script changes, and documentation to `main` (or merge a reviewed PR). This activates the automatic deployment. Check **Actions → Deploy production** for results and the published URL. A manual run also requires selecting `main`.

## Deployment behavior

The script uses `--ci` to disable interactive CDK approval in Actions; ordinary local invocation still prompts for IAM broadening. CDK outputs configure the frontend automatically. The job fails if the role variable is missing, AWS authentication fails, infrastructure deployment fails, or publishing/invalidation fails. A failed frontend upload does not automatically roll back a successful infrastructure deployment; inspect the run before retrying.

The current infrastructure still uses Node.js 18 Lambda runtimes and destructive removal policies for stored data and Cognito. Review those and the dependency audit findings before introducing production user data. This workflow does not change those policies.

References: [GitHub OIDC with AWS](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws), [CDK bootstrapping](https://docs.aws.amazon.com/cdk/v2/guide/bootstrapping.html).
