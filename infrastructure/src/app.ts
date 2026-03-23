#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { PantryStack } from './pantry-stack';

const app = new cdk.App();

new PantryStack(app, 'PantryStack', {
  env: {
    account: '698643713254',
    region: 'eu-north-1',
  },
});

app.synth();
