import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecsPatterns from 'aws-cdk-lib/aws-ecs-patterns';

export class ContainerStack extends cdk.Stack {
	constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
		super(scope, id, props);

		const imageTag = this.node.tryGetContext('imageTag') as string | undefined;
		if (!imageTag || !/^[a-f0-9]{40}$/i.test(imageTag)) {
			throw new Error('Pass the 40-character Git commit SHA as CDK context: -c imageTag=<sha>');
		}

		const reactionsTable = new dynamodb.Table(this, 'ReactionsTable', {
			partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
			sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
			billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
			removalPolicy: cdk.RemovalPolicy.RETAIN,
		});

		const vpc = new ec2.Vpc(this, 'ContainerVpc', {
			maxAzs: 2,
			natGateways: 0,
			subnetConfiguration: [
				{
					name: 'Public',
					subnetType: ec2.SubnetType.PUBLIC,
					cidrMask: 24,
				},
			],
		});

		const cluster = new ecs.Cluster(this, 'ContainerCluster', { vpc });
		const repository = ecr.Repository.fromRepositoryName(this, 'BlogRepository', 'docker/astro-blog');
		const service = new ecsPatterns.ApplicationLoadBalancedFargateService(this, 'BlogService', {
			cluster,
			cpu: 256,
			memoryLimitMiB: 512,
			desiredCount: 1,
			publicLoadBalancer: true,
			assignPublicIp: true,
			taskSubnets: { subnetType: ec2.SubnetType.PUBLIC },
			taskImageOptions: {
				image: ecs.ContainerImage.fromEcrRepository(repository, imageTag),
				containerPort: 4321,
				environment: {
					AWS_REGION: this.region,
					REACTIONS_TABLE_NAME: reactionsTable.tableName,
				},
			},
			healthCheckGracePeriod: cdk.Duration.seconds(90),
			circuitBreaker: { rollback: true },
			minHealthyPercent: 100,
		});
		reactionsTable.grantReadWriteData(service.taskDefinition.taskRole);
		service.targetGroup.configureHealthCheck({
			path: '/api/health/live',
			healthyHttpCodes: '200',
		});

		new cdk.CfnOutput(this, 'BlogUrl', {
			value: `http://${service.loadBalancer.loadBalancerDnsName}`,
		});
		new cdk.CfnOutput(this, 'ReactionsTableName', {
			value: reactionsTable.tableName,
		});
	}
}
