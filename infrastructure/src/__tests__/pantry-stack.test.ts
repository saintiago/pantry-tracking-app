import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { Code } from 'aws-cdk-lib/aws-lambda';

// Assert the real stack's synthesized resource relationships without running esbuild
// or Docker in unit tests. Production builds/synth still bundle the real handlers.
jest.mock('aws-cdk-lib/aws-lambda-nodejs', () => {
  const { Function: LambdaFunction } = jest.requireActual('aws-cdk-lib/aws-lambda');
  return {
    NodejsFunction: class extends LambdaFunction {
      constructor(scope: unknown, id: string, props: Record<string, unknown>) {
        super(scope, id, {
          ...props,
          code: Code.fromInline('exports.handler = async () => ({ statusCode: 200 });'),
        });
      }
    },
  };
});

import { PantryStack } from '../pantry-stack';

const template = Template.fromStack(new PantryStack(new App(), 'TestPantryStack'));

test('retains user data and identity on deletion or replacement', () => {
  for (const resourceType of ['AWS::DynamoDB::Table', 'AWS::Cognito::UserPool']) {
    template.hasResource(resourceType, { DeletionPolicy: 'Retain', UpdateReplacePolicy: 'Retain' });
  }
  template.hasResource('AWS::S3::Bucket', {
    DeletionPolicy: 'Retain',
    UpdateReplacePolicy: 'Retain',
    Properties: Match.objectLike({ BucketEncryption: Match.anyValue() }),
  });
  template.hasResourceProperties('AWS::DynamoDB::Table', {
    PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: true },
  });
});

test('all application Lambdas use Node 24 with bounded execution', () => {
  const functions = Object.values(template.findResources('AWS::Lambda::Function')).filter(
    (resource) => resource.Properties.FunctionName?.startsWith('Pantry'),
  );
  expect(functions).toHaveLength(5);
  for (const resource of functions) {
    expect(resource.Properties.Runtime).toBe('nodejs24.x');
    expect(resource.Properties.Timeout).toBe(
      resource.Properties.FunctionName === 'PantryRecipeFunction' ? 28 : 10,
    );
  }
});

test('every data method is authenticated; only token verification and preflight are public', () => {
  const methods = Object.values(template.findResources('AWS::ApiGateway::Method'));
  const publicMethods = methods.filter((method) => method.Properties.AuthorizationType === 'NONE');
  expect(publicMethods.filter((method) => method.Properties.HttpMethod !== 'OPTIONS')).toHaveLength(
    1,
  );
  for (const method of methods.filter((entry) => entry.Properties.AuthorizationType !== 'NONE')) {
    expect(method.Properties.AuthorizationType).toBe('COGNITO_USER_POOLS');
    expect(method.Properties.AuthorizerId).toBeDefined();
  }
  template.hasResourceProperties('AWS::ApiGateway::Resource', { PathPart: 'inventory' });
  template.hasResourceProperties('AWS::ApiGateway::Resource', { PathPart: 'meal-plans' });
  template.hasResourceProperties('AWS::CloudFront::Distribution', {
    DistributionConfig: Match.objectLike({
      DefaultCacheBehavior: Match.objectLike({ ViewerProtocolPolicy: 'redirect-to-https' }),
    }),
  });
});
