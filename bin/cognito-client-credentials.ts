#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { CognitoClientCredentialsStack } from '../lib/cognito-client-credentials-stack';

const app = new cdk.App();
new CognitoClientCredentialsStack(app, 'CognitoClientCredentialsStack', {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION }
});