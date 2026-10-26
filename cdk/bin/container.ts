#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import { ContainerStack } from '../lib/container-stack';

const app = new cdk.App();
new ContainerStack(app, 'AstroBlogContainerStack', {
	env: { account: '456774513196', region: 'eu-north-1' },
});
