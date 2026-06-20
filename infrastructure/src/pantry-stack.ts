import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as path from 'path';
import { Construct } from 'constructs';

export class PantryStack extends cdk.Stack {
  public readonly table: dynamodb.Table;
  public readonly storageBucket: s3.Bucket;
  public readonly websiteBucket: s3.Bucket;
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;
  public readonly api: apigateway.RestApi;
  public readonly cognitoAuthorizer: apigateway.CognitoUserPoolsAuthorizer;
  public readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ─── DynamoDB Single-Table ───────────────────────────────────────
    this.table = new dynamodb.Table(this, 'PantryAppTable', {
      tableName: 'PantryApp',
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      pointInTimeRecovery: true,
    });

    this.table.addGlobalSecondaryIndex({
      indexName: 'GSI1',
      partitionKey: { name: 'GSI1PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI1SK', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // ─── S3 Storage Bucket (receipts, item pictures, exports) ────────
    this.storageBucket = new s3.Bucket(this, 'StorageBucket', {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      cors: [
        {
          allowedMethods: [
            s3.HttpMethods.GET,
            s3.HttpMethods.PUT,
            s3.HttpMethods.POST,
          ],
          allowedOrigins: ['*'],
          allowedHeaders: ['*'],
          maxAge: 3600,
        },
      ],
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
    });

    // ─── S3 Website Bucket (frontend hosting) ────────────────────────
    this.websiteBucket = new s3.Bucket(this, 'WebsiteBucket', {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });

    // ─── Cognito User Pool ───────────────────────────────────────────
    this.userPool = new cognito.UserPool(this, 'PantryUserPool', {
      userPoolName: 'PantryAppUserPool',
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: {
        email: { required: true, mutable: true },
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    this.userPoolClient = this.userPool.addClient('PantryWebClient', {
      userPoolClientName: 'PantryWebClient',
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
      preventUserExistenceErrors: true,
    });

    // ─── API Gateway REST API ────────────────────────────────────────
    this.api = new apigateway.RestApi(this, 'PantryApi', {
      restApiName: 'PantryAppApi',
      description: 'Pantry Tracking App REST API',
      deployOptions: {
        stageName: 'prod',
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: [
          'Content-Type',
          'Authorization',
          'X-Amz-Date',
          'X-Api-Key',
        ],
      },
    });

    this.cognitoAuthorizer = new apigateway.CognitoUserPoolsAuthorizer(
      this,
      'PantryAuthorizer',
      {
        cognitoUserPools: [this.userPool],
        authorizerName: 'PantryCognitoAuthorizer',
        resultsCacheTtl: cdk.Duration.minutes(5),
      },
    );

    // Placeholder health endpoint (unauthenticated) ensures the API deploys.
    // A protected endpoint uses the authorizer so CDK validates it.
    const healthResource = this.api.root.addResource('health');
    healthResource.addMethod('GET', new apigateway.MockIntegration({
      integrationResponses: [{ statusCode: '200' }],
      requestTemplates: { 'application/json': '{"statusCode": 200}' },
    }), {
      methodResponses: [{ statusCode: '200' }],
      authorizer: this.cognitoAuthorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // ─── Auth Lambda ────────────────────────────────────────────────
    const authLambda = new NodejsFunction(this, 'AuthLambda', {
      functionName: 'PantryAuthFunction',
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'handler',
      entry: path.join(__dirname, '../../backend/src/handlers/auth/auth.ts'),
      environment: {
        USER_POOL_ID: this.userPool.userPoolId,
        USER_POOL_CLIENT_ID: this.userPoolClient.userPoolClientId,
      },
      timeout: cdk.Duration.seconds(10),
      memorySize: 256,
    });

    // API Gateway: POST /auth/verify (unauthenticated)
    const authResource = this.api.root.addResource('auth');
    const verifyResource = authResource.addResource('verify');
    verifyResource.addMethod(
      'POST',
      new apigateway.LambdaIntegration(authLambda),
      { authorizationType: apigateway.AuthorizationType.NONE },
    );

    // ─── Storage Location Lambda ────────────────────────────────────
    const storageLocationLambda = new NodejsFunction(this, 'StorageLocationLambda', {
      functionName: 'PantryStorageLocationFunction',
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'handler',
      entry: path.join(__dirname, '../../backend/src/handlers/storage-location/storage-location.ts'),
      environment: {
        TABLE_NAME: this.table.tableName,
      },
      timeout: cdk.Duration.seconds(10),
      memorySize: 256,
    });

    this.table.grantReadWriteData(storageLocationLambda);

    // API Gateway: /locations routes (authenticated)
    const locationsResource = this.api.root.addResource('locations');
    const authMethodOptions = {
      authorizer: this.cognitoAuthorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    };
    const locationIntegration = new apigateway.LambdaIntegration(storageLocationLambda);

    locationsResource.addMethod('GET', locationIntegration, authMethodOptions);
    locationsResource.addMethod('POST', locationIntegration, authMethodOptions);

    const locationIdResource = locationsResource.addResource('{locationId}');
    locationIdResource.addMethod('PUT', locationIntegration, authMethodOptions);
    locationIdResource.addMethod('DELETE', locationIntegration, authMethodOptions);

    // ─── Inventory Lambda ───────────────────────────────────────────
    const inventoryLambda = new NodejsFunction(this, 'InventoryLambda', {
      functionName: 'PantryInventoryFunction',
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'handler',
      entry: path.join(__dirname, '../../backend/src/handlers/inventory/inventory.ts'),
      environment: {
        TABLE_NAME: this.table.tableName,
        STORAGE_BUCKET: this.storageBucket.bucketName,
      },
      timeout: cdk.Duration.seconds(10),
      memorySize: 256,
    });

    this.table.grantReadWriteData(inventoryLambda);
    this.storageBucket.grantReadWrite(inventoryLambda);

    // API Gateway: /inventory routes (authenticated)
    const inventoryResource = this.api.root.addResource('inventory');
    const inventoryIntegration = new apigateway.LambdaIntegration(inventoryLambda);

    inventoryResource.addMethod('GET', inventoryIntegration, authMethodOptions);
    inventoryResource.addMethod('POST', inventoryIntegration, authMethodOptions);

    const lowStockResource = inventoryResource.addResource('low-stock');
    lowStockResource.addMethod('GET', inventoryIntegration, authMethodOptions);

    const searchResource = inventoryResource.addResource('search');
    searchResource.addMethod('GET', inventoryIntegration, authMethodOptions);

    const barcodeLookupResource = inventoryResource.addResource('barcode-lookup');
    barcodeLookupResource.addMethod('POST', inventoryIntegration, authMethodOptions);

    const inventoryItemIdResource = inventoryResource.addResource('{itemId}');
    inventoryItemIdResource.addMethod('PUT', inventoryIntegration, authMethodOptions);
    inventoryItemIdResource.addMethod('DELETE', inventoryIntegration, authMethodOptions);

    // ─── Recipe Lambda ──────────────────────────────────────────────
    const recipeLambda = new NodejsFunction(this, 'RecipeLambda', {
      functionName: 'PantryRecipeFunction',
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'handler',
      entry: path.join(__dirname, '../../backend/src/handlers/recipe/recipe.ts'),
      environment: {
        TABLE_NAME: this.table.tableName,
      },
      timeout: cdk.Duration.seconds(10),
      memorySize: 256,
    });

    this.table.grantReadWriteData(recipeLambda);

    // API Gateway: /recipes routes (authenticated)
    const recipesResource = this.api.root.addResource('recipes');
    const recipeIntegration = new apigateway.LambdaIntegration(recipeLambda);

    recipesResource.addMethod('GET', recipeIntegration, authMethodOptions);
    recipesResource.addMethod('POST', recipeIntegration, authMethodOptions);

    const recipeIdResource = recipesResource.addResource('{recipeId}');
    recipeIdResource.addMethod('GET', recipeIntegration, authMethodOptions);
    recipeIdResource.addMethod('PUT', recipeIntegration, authMethodOptions);
    recipeIdResource.addMethod('DELETE', recipeIntegration, authMethodOptions);

    // ─── Meal Plan Lambda ───────────────────────────────────────────
    const mealPlanLambda = new NodejsFunction(this, 'MealPlanLambda', {
      functionName: 'PantryMealPlanFunction',
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'handler',
      entry: path.join(__dirname, '../../backend/src/handlers/meal-plan/meal-plan.ts'),
      environment: {
        TABLE_NAME: this.table.tableName,
      },
      timeout: cdk.Duration.seconds(10),
      memorySize: 256,
    });

    this.table.grantReadWriteData(mealPlanLambda);

    // API Gateway: /meal-plans routes (authenticated)
    const mealPlansResource = this.api.root.addResource('meal-plans');
    const mealPlanIntegration = new apigateway.LambdaIntegration(mealPlanLambda);

    mealPlansResource.addMethod('GET', mealPlanIntegration, authMethodOptions);
    mealPlansResource.addMethod('POST', mealPlanIntegration, authMethodOptions);

    const mealPlanIdResource = mealPlansResource.addResource('{planId}');
    mealPlanIdResource.addMethod('PUT', mealPlanIntegration, authMethodOptions);
    mealPlanIdResource.addMethod('DELETE', mealPlanIntegration, authMethodOptions);

    // ─── CloudFront Distribution ─────────────────────────────────────
    const originAccessIdentity = new cloudfront.OriginAccessIdentity(
      this,
      'WebsiteOAI',
      { comment: 'OAI for Pantry App website bucket' },
    );

    this.websiteBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        actions: ['s3:GetObject'],
        resources: [this.websiteBucket.arnForObjects('*')],
        principals: [originAccessIdentity.grantPrincipal],
      }),
    );

    this.distribution = new cloudfront.Distribution(this, 'WebDistribution', {
      defaultBehavior: {
        origin: new origins.S3Origin(this.websiteBucket, {
          originAccessIdentity,
        }),
        viewerProtocolPolicy:
          cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      defaultRootObject: 'index.html',
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(5),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(5),
        },
      ],
    });

    // ─── CloudFormation Outputs ──────────────────────────────────────
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: this.api.url,
      description: 'API Gateway endpoint URL',
    });

    new cdk.CfnOutput(this, 'CloudFrontUrl', {
      value: `https://${this.distribution.distributionDomainName}`,
      description: 'CloudFront distribution URL',
    });

    new cdk.CfnOutput(this, 'UserPoolId', {
      value: this.userPool.userPoolId,
      description: 'Cognito User Pool ID',
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: this.userPoolClient.userPoolClientId,
      description: 'Cognito User Pool Client ID',
    });

    new cdk.CfnOutput(this, 'StorageBucketName', {
      value: this.storageBucket.bucketName,
      description: 'S3 storage bucket name',
    });

    new cdk.CfnOutput(this, 'TableName', {
      value: this.table.tableName,
      description: 'DynamoDB table name',
    });

    new cdk.CfnOutput(this, 'WebsiteBucketName', {
      value: this.websiteBucket.bucketName,
      description: 'S3 website bucket name (for frontend deployment)',
    });

    new cdk.CfnOutput(this, 'DistributionId', {
      value: this.distribution.distributionId,
      description: 'CloudFront distribution ID (for cache invalidation)',
    });
  }
}
