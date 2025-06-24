import * as cdk from 'aws-cdk-lib';
import { OAuthScope, ResourceServerScope, UserPool, UserPoolDomain } from 'aws-cdk-lib/aws-cognito';
import { Peer, Port, Vpc } from 'aws-cdk-lib/aws-ec2';
import { ApplicationLoadBalancer, ListenerAction, ListenerCondition } from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { LambdaTarget } from 'aws-cdk-lib/aws-elasticloadbalancingv2-targets';
import { FunctionUrlAuthType, Runtime, Tracing } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import path = require('path');

export class CognitoClientCredentialsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    //  IDP - Cognito
    const identifier = 'rest-api';
    const scopeName = 'read:api';
    const domainPrefix = 'my-auth-724';

    const vpc = new Vpc(this, 'app-vpc', {});

    const userPool = new UserPool(this, 'user-pool', {
      userPoolName: 'SystemToSystemPool',      
      selfSignUpEnabled: false,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    const invokeScope = new ResourceServerScope({
      scopeName,
      scopeDescription: 'Call protected with Read Scope'
    });

    const resourceServer = userPool.addResourceServer('resource-server', {
      identifier,
      scopes: [ invokeScope ]
    });
    resourceServer.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY);

    const userPoolClient = userPool.addClient('my-client', {          
      generateSecret: true,
      oAuth: {
        flows: {
          clientCredentials: true
        }, 
        scopes: [ OAuthScope.resourceServer(resourceServer, invokeScope) ],
      },
      preventUserExistenceErrors: true,
      enableTokenRevocation: true
    });
    userPoolClient.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY);

    //Create a Secrets Manager secret out of usePoolSecret. Currently Secrets are't assignable in CDK
    const client_secret = new Secret(this, 'client-secret', {
      secretName: 'client-secret',
      secretStringValue: userPoolClient.userPoolClientSecret,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });
    
    // Using Cognito domain.  We should really use custom domain in Route 53 and subdomain
    const userPoolDomain = new UserPoolDomain(this, 'user-pool-domain', {
      userPool,
      cognitoDomain: {
        domainPrefix
      }
    });
    userPoolDomain.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY);

    const apiLambda = new NodejsFunction(this, 'my-api', {
      vpc,
      handler: 'handler',
      runtime: Runtime.NODEJS_LATEST,
      entry: path.join(__dirname, '/../lambda/api.ts'),   
      logRetention: RetentionDays.ONE_DAY,
      tracing: Tracing.ACTIVE,
      environment: {
        USER_POOL_ID: userPool.userPoolId,
        CLIENT_ID: userPoolClient.userPoolClientId,
        SCOPE: `${identifier}/${scopeName}`
      }
    });

    const apiUrl = apiLambda.addFunctionUrl({
      authType: FunctionUrlAuthType.NONE
    })

    // CLIENT 
    const clientLambda = new NodejsFunction(this, 'client-api', {
      vpc,
      handler: 'handler',
      runtime: Runtime.NODEJS_LATEST,
      entry: path.join(__dirname, '/../lambda/client.ts'),   
      logRetention: RetentionDays.ONE_DAY,
      tracing: Tracing.ACTIVE,
      environment: {
        DOMAIN_NAME: userPoolDomain.domainName,     
        CLIENT_ID: userPoolClient.userPoolClientId,
        CLIENT_SECRET_NAME: client_secret.secretFullArn!,
        SCOPE: `${identifier}/${scopeName}`,
        API_URL: apiUrl.url
      },
      timeout: cdk.Duration.seconds(5) // Adding more time.  Some requests timing out...
    });
    client_secret.grantRead(clientLambda);

    const alb = new ApplicationLoadBalancer(this, 'alb', {
      vpc,
      internetFacing: true,
    });

    const listener = alb.addListener('listener', {
      port: 80,
      defaultAction: ListenerAction.fixedResponse(404, {
        contentType: 'application/json',
        messageBody: 'Not found'
      })
    });

    listener.addTargets('api-lambda-target', {
      priority: 1,
      conditions: [
        ListenerCondition.pathPatterns(['/api'])
      ],
      targets: [new LambdaTarget(apiLambda)]
    });

    listener.addTargets('client-target', {
      priority: 2,
      conditions: [
        ListenerCondition.pathPatterns(['/client'])
      ],
      targets: [new LambdaTarget(clientLambda)]
    });

    new cdk.CfnOutput(this, 'auth-url', {
      value: `https://${userPoolDomain.domainName}.auth.${cdk.Aws.REGION}.amazoncognito.com/oauth2/token`,
      exportName: 'loadBalancerDnsName'
    });
    new cdk.CfnOutput(this, 'api-url', {
      value: `http://${alb.loadBalancerDnsName}/api`,
      exportName: 'loadBalancerDnsName'
    });
    new cdk.CfnOutput(this, 'client-url', {
      value: `http://${alb.loadBalancerDnsName}/client`,
      exportName: 'loadBalancerDnsName'
    });

  }
}
