'use strict';

// ------------------------------------------------------------------------------------------ Dependencies

import { ProjectProperties, AWSOptions, EnvironmentOptions, ECSOptions } from '../Interfaces';
import { Utils } from './Utils';
import { STS, EC2, ECR, ECS, ELBv2, CloudWatchLogs, Credentials, SharedIniFileCredentials } from 'aws-sdk';
import * as merge from 'lodash.merge';
import * as bunyan from 'bunyan';

// ------------------------------------------------------------------------------------------ Class

export class AWS {

  private sts: STS;
  private ec2: EC2;
  private ecr: ECR;
  private ecs: ECS;
  private elb: ELBv2;
  private cw: CloudWatchLogs;
  private properties: ProjectProperties;
  private log: bunyan = Utils.getLogger();

  constructor(environment?: EnvironmentOptions) {
    this.properties = this.getDefaultProperties(Utils.properties, environment);
    this.properties.options = Utils.replaceEnvironmentVariables(this.properties.options, false);

    // Also support credentials provided in the YML file
    let credentials: Credentials = new SharedIniFileCredentials({profile: this.properties.options.aws.profile});
    if (this.properties.options.aws.accessKeyId) {
      credentials = new Credentials({
        accessKeyId: this.properties.options.aws.accessKeyId,
        secretAccessKey: this.properties.options.aws.secretAccessKey
      });
    }

    this.ec2 = new EC2({
      credentials: credentials,
      region: this.properties.options.aws.region
    });

    this.ecr = new ECR({
      credentials: credentials,
      region: this.properties.options.aws.region
    });

    this.ecs = new ECS({
      credentials: credentials,
      region: this.properties.options.aws.region
    });

    this.elb = new ELBv2({
      credentials: credentials,
      region: this.properties.options.aws.region
    });

    this.cw = new CloudWatchLogs({
      credentials: credentials,
      region: this.properties.options.aws.region
    });
  }

  async getDockerLoginCommand(): Promise<Array<string>> {
    try {
      const result = await this.ecr.getAuthorizationToken().promise();
      const credentials = Buffer.from(result.authorizationData[0].authorizationToken, 'base64').toString('utf8').split(':');
      return [ 'login', '-u', credentials[0], '-p', credentials[1], result.authorizationData[0].proxyEndpoint];
    } catch (error) {
      this.errorHandler(error);
    }
  }

  async apply(): Promise<void> {
    // Make sure to check for missing environment variables
    this.properties.options = Utils.replaceEnvironmentVariables(this.properties.options, true);

    await this.createRepository();
    await this.createCluster();
    await this.createLoadbalancer();
    await this.createTargetGroup();
    await this.createListener();
    await this.createCloudWatchLogGroup();
    await this.createTaskDefinition();
    await this.createService();
  }

  async deploy(): Promise<void> {
    await this.redeployService();
  }

  async getVPCs(): Promise<Array<EC2.Vpc>> {
    try {
      const describeVpcsResult: EC2.DescribeVpcsResult = await this.ec2.describeVpcs().promise();
      return describeVpcsResult.Vpcs;
    } catch (error) {
      this.errorHandler(error);
    }
  }

  async getSubnets(vpcId?: string): Promise<Array<EC2.Subnet>> {
    try {
      if (!vpcId) {
        vpcId = (Utils.properties.options.aws && Utils.properties.options.aws.vpcId) ? Utils.properties.options.aws.vpcId : '';
      }

      const describeSubnetsRequest: EC2.DescribeSubnetsRequest = {
        Filters: [
          {
            Name: 'vpc-id',
            Values: [ vpcId ]
          }
        ]
      };

      const describeSubnetsResult: EC2.DescribeSubnetsResult = await this.ec2.describeSubnets(describeSubnetsRequest).promise();
      return describeSubnetsResult.Subnets;
    } catch (error) {
      this.errorHandler(error);
    }
  }

  async getRepository(): Promise<ECR.Repository|null> {
    try {
      const describeRepositoriesResponse: ECR.DescribeRepositoriesResponse = await this.ecr.describeRepositories().promise();
      const repositories = describeRepositoriesResponse.repositories.filter(repository => repository.repositoryName === this.properties.options.aws.ecr.repositoryName);
      return repositories.length === 1 ? repositories[0] : null;
    } catch (error) {
      this.errorHandler(error);
    }
  }

  async getRepositoryURI(): Promise<AWS.ECR.Url> {
    try {
      const repository = await this.getRepository();
      if (!repository) throw new Error('Repository does not exist');
      return repository.repositoryUri;
    } catch (error) {
      this.errorHandler(error);
    }
  }

  async createRepository(): Promise<ECR.Repository> {
    try {
      const repository = await this.getRepository();
      if (!repository) {
        const createRepositoryResponse: ECR.CreateRepositoryResponse = await this.ecr.createRepository(this.properties.options.aws.ecr).promise();
        return createRepositoryResponse.repository;
      }
    } catch (error) {
      this.errorHandler(error);
    }
  }

  private async getCluster(): Promise<ECS.Cluster> {
    try {
      const describeClustersResponse: ECS.DescribeClustersResponse = await this.ecs.describeClusters({ clusters: [ this.properties.options.aws.ecs.cluster.clusterName ] }).promise();
      const clusters = describeClustersResponse.clusters.filter(cluster => cluster.clusterName === this.properties.options.aws.ecs.cluster.clusterName);
      return clusters.length === 1 ? clusters[0] : null;
    } catch (error) {
      this.errorHandler(error);
    }
  }

  private async getClusterARN(): Promise<string> {
    try {
      const cluster = await this.getCluster();
      if (!cluster) throw new Error('Cluster does not exist');
      return cluster.clusterArn;
    } catch (error) {
      this.errorHandler(error);
    }
  }

  private async createCluster(): Promise<ECS.Cluster> {
    try {
      let cluster = await this.getCluster();

      // If the cluster is marked INACTIVE, delete it to avoid issues
      if (cluster && cluster.status === 'INACTIVE') {
        await this.ecs.deleteCluster({
          cluster: this.properties.options.aws.ecs.cluster.clusterName
        }).promise();
        cluster = null;
      }

      // Return the ARN if the cluster already exists
      if (cluster) return cluster;

      // Create the Cluster
      this.log.info(`ECS Cluster ${this.properties.options.aws.ecs.cluster.clusterName} does not yet exist, creating it!`);
      const createClustersResponse: ECS.CreateClusterResponse = await this.ecs.createCluster({ clusterName: this.properties.options.aws.ecs.cluster.clusterName }).promise();
      return createClustersResponse.cluster;
    } catch (error) {
      this.errorHandler(error);
    }
  }

  private async getLoadbalancer(): Promise<ELBv2.LoadBalancer> {
    try {
      const describeLoadBalancers: ELBv2.DescribeLoadBalancersOutput = await this.elb.describeLoadBalancers().promise();
      const loadbalancers = describeLoadBalancers.LoadBalancers.filter(loadbalancer => loadbalancer.LoadBalancerName === this.properties.options.aws.ecs.loadbalancer.Name);
      return loadbalancers.length === 1 ? loadbalancers[0] : null;
    } catch (error) {
      this.errorHandler(error);
    }
  }

  private async getLoadBalancerARN(): Promise<string> {
    try {
      const loadbalancer = await this.getLoadbalancer();
      if (!loadbalancer) throw new Error('Loadbalancer does not exist');
      return loadbalancer.LoadBalancerArn;
    } catch (error) {
      this.errorHandler(error);
    }
  }

  private async createLoadbalancer(): Promise<ELBv2.LoadBalancer> {
    try {
      const loadbalancer = await this.getLoadbalancer();

      // Return the LoadBalancer if it already exists
      if (loadbalancer) return loadbalancer;

      // Create the Loadbalancer
      if (!this.properties.options.aws.ecs.loadbalancer.Subnets) {
        this.log.info(`Oh my... this is embarrassing 😳. I would love to do things automatically for you, but I need you give me some pointers regarding the loadbalancer.`);
        this.log.info(`Please edit the .acdeploy.yml file and set the AWS > ECS > Loadbalancer > Subnets section with properties from https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/ELBv2.html#createLoadBalancer-property`);
        process.exit(-1);
      }

      this.log.info(`Creating Application Load Balancer for ${this.properties.options.name}`);
      const response = await this.elb.createLoadBalancer(this.properties.options.aws.ecs.loadbalancer).promise();
      return response.LoadBalancers[0];
    } catch (error) {
      this.errorHandler(error);
    }
  }

  private async getTargetGroup(): Promise<ELBv2.TargetGroup> {
    try {
      const describeTargetGroups: ELBv2.DescribeTargetGroupsOutput = await this.elb.describeTargetGroups().promise();
      const targetGroups = describeTargetGroups.TargetGroups.filter(targetGroup => targetGroup.TargetGroupName === this.properties.options.aws.ecs.targetGroup.Name);
      return targetGroups.length === 1 ? targetGroups[0] : null;
    } catch (error) {
      this.errorHandler(error);
    }
  }

  private async getTargetGroupARN(): Promise<string> {
    try {
      const targetGroup = await this.getTargetGroup();
      if (!targetGroup) throw new Error('Targetgroup does not exist');
      return targetGroup.TargetGroupArn;
    } catch (error) {
      this.errorHandler(error);
    }
  }

  private async createTargetGroup(): Promise<ELBv2.TargetGroup> {
    try {
      const targetGroup = await this.getTargetGroup();

      // Return the TargetGroup if it already exists
      if (targetGroup) return targetGroup;

      // Create the TargetGroup
      if (!this.properties.options.aws.ecs.targetGroup.VpcId) {
        this.log.info(`Oh my... this is embarrassing 😳. I would love to do things automatically for you, but I need you give me some pointers regarding the target group.`);
        this.log.info(`Please edit the .acdeploy.yml file and set the AWS > ECS > TargetGroup > VpcId property (see https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/ELBv2.html#createTargetGroup-property)`);
        process.exit(-1);
      }

      this.log.info(`Creating Target Group for ${this.properties.options.name}`);
      const response = await this.elb.createTargetGroup(this.properties.options.aws.ecs.targetGroup).promise();
      return response.TargetGroups[0];
    } catch (error) {
      this.errorHandler(error);
    }
  }

  public async createListener(): Promise<void> {
    try {
      // Get the ARN for load balancer and target group
      const loadBalancerARN = await this.getLoadBalancerARN();
      const targetGroupARN = await this.getTargetGroupARN();

      // Only create a new listener if it does not already exist for the load balancer
      const describeListenersResponse: ELBv2.DescribeListenersOutput = await this.elb.describeListeners({ LoadBalancerArn: loadBalancerARN }).promise();
      if (describeListenersResponse.Listeners.length === 0) {
        const listenerDefinition: ELBv2.CreateListenerInput = merge({
          LoadBalancerArn: loadBalancerARN,
          DefaultActions: [
            {
             TargetGroupArn: targetGroupARN,
             Type: 'forward'
            }
          ]
        }, this.properties.options.aws.ecs.listener);

        this.log.info(`Adding listener to loadbalancer ${loadBalancerARN} for target group ${targetGroupARN} 👂`);
        await this.elb.createListener(listenerDefinition).promise();
      }
    } catch (error) {
      this.errorHandler(error);
    }
  }

  private async createCloudWatchLogGroup(): Promise<void> {
    try {
      const name = this.properties.options.aws.ecs.service.serviceName;
      const describeLogGroupsResponse: CloudWatchLogs.DescribeLogGroupsResponse = await this.cw.describeLogGroups({ logGroupNamePrefix: name }).promise();
      const loggroups = describeLogGroupsResponse.logGroups.filter(loggroup => loggroup.logGroupName === name);
      const loggroup = loggroups.length === 1 ? loggroups[0] : null;

      // Only create the log group if it doesn't exist
      if (!loggroup) {
        this.log.info(`Creating CloudWatch log group ${this.properties.options.name}`);
        await this.cw.createLogGroup({ logGroupName: this.properties.options.name }).promise();
      }
    } catch (error) {
      this.errorHandler(error);
    }
  }

  private async createTaskDefinition(): Promise<void> {
    try {
      const repositoryUri = await this.getRepositoryURI();
      const taskDefinition: ECS.RegisterTaskDefinitionRequest = merge({
        containerDefinitions: [
          {
            image: `${repositoryUri}:latest`,
          }
        ]
      }, this.properties.options.aws.ecs.taskDefinition);

      // Register the task definition
      this.log.info('Registering ECS task definition 📄');
      await this.ecs.registerTaskDefinition(taskDefinition).promise();
    } catch (error) {
      this.errorHandler(error);
    }
  }

  private async getService(): Promise<ECS.Service> {
    try {
      const clusterARN = await this.getClusterARN();
      const describeServiceResponse: ECS.DescribeServicesResponse = await this.ecs.describeServices({
        services: [ this.properties.options.aws.ecs.service.serviceName ],
        cluster: clusterARN
      }).promise();
      const services = describeServiceResponse.services.filter(service => service.serviceName === this.properties.options.aws.ecs.service.serviceName);
      return services.length === 1 ? services[0] : null;
    } catch (error) {
      this.errorHandler(error);
    }
  }

  private async redeployService(): Promise<void> {
    try {
      this.log.info(`Forcing redeployment to service ${this.properties.options.aws.ecs.service.serviceName} on cluster ${this.properties.options.aws.ecs.cluster.clusterName} for task definition ${this.properties.options.aws.ecs.service.taskDefinition} 🚀`);
      const service = await this.getService();
      if (service) {
        await this.ecs.updateService({
          cluster: service.clusterArn,
          service: service.serviceName,
          desiredCount: this.properties.options.aws.ecs.service.desiredCount,
          taskDefinition: this.properties.options.aws.ecs.service.taskDefinition,
          deploymentConfiguration: this.properties.options.aws.ecs.service.deploymentConfiguration,
          networkConfiguration: this.properties.options.aws.ecs.service.networkConfiguration,
          platformVersion: this.properties.options.aws.ecs.service.platformVersion,
          healthCheckGracePeriodSeconds: this.properties.options.aws.ecs.service.healthCheckGracePeriodSeconds,
          forceNewDeployment: true
        }).promise();
      } else {
        this.log.warn(`Oh my... this is embarrassing 😳. I think you forgot to provision the ECS environment. Please run 'acdeploy apply' first`);
        process.exit(-1);
      }
    } catch (error) {
      this.errorHandler(error);
    }
  }

  private async createService(): Promise<ECS.Service> {
    try {
      let service = await this.getService();

      // If the service is marked INACTIVE, delete it to avoid issues
      if (service && service.status === 'INACTIVE') {
        await this.ecs.deleteService({
          cluster: service.clusterArn,
          service: service.serviceName
        }).promise();
        service = null;
      }

      if (!service) {
        this.log.info(`Creating service ${this.properties.options.aws.ecs.service.serviceName} on cluster ${this.properties.options.aws.ecs.cluster.clusterName} for task definition ${this.properties.options.aws.ecs.service.taskDefinition} 🚀`);
        const createServiceResponse = await this.ecs.createService(merge({
            cluster: await this.getClusterARN(),
            loadBalancers: [
              {
                targetGroupArn: await this.getTargetGroupARN()
              }
            ]
          }, this.properties.options.aws.ecs.service)
        ).promise();
        return createServiceResponse.service;
      } else {
        this.log.info(`Updating service ${this.properties.options.aws.ecs.service.serviceName} on cluster ${this.properties.options.aws.ecs.cluster.clusterName} for task definition ${this.properties.options.aws.ecs.service.taskDefinition} 🚀`);
        const updateServiceResponse = await this.ecs.updateService({
          cluster: service.clusterArn,
          service: service.serviceName,
          desiredCount: this.properties.options.aws.ecs.service.desiredCount,
          taskDefinition: this.properties.options.aws.ecs.service.taskDefinition,
          deploymentConfiguration: this.properties.options.aws.ecs.service.deploymentConfiguration,
          networkConfiguration: this.properties.options.aws.ecs.service.networkConfiguration,
          platformVersion: this.properties.options.aws.ecs.service.platformVersion,
          healthCheckGracePeriodSeconds: this.properties.options.aws.ecs.service.healthCheckGracePeriodSeconds,
          forceNewDeployment: false
        }).promise();
        return updateServiceResponse.service;
      }
    } catch (error) {
      this.errorHandler(error);
    }
  }

  private errorHandler(error) {
    if (error.code === 'AccessDeniedException' || error.code === 'InvalidSignatureException' || error.code === 'UnauthorizedOperation' || error.code === 'UnrecognizedClientException') {
      this.log.error(`Err... this is embarrassing. You don't have the required permissions to perform this operation 👇`);
      this.log.error(error.message);
      process.exit(-1);
    } else {
      throw error;
    }
  }

  private getDefaultProperties(properties: ProjectProperties, environment?: EnvironmentOptions): ProjectProperties {
    let suffix = environment && environment.suffix ? environment.suffix : '';
    suffix = suffix.startsWith('-') ? suffix : '-' + suffix;
    const name = environment && environment.suffix ? properties.options.name + suffix : properties.options.name;

    const env: AWSOptions = environment && environment.aws ? Object.assign({}, environment.aws) : <AWSOptions>{};
    const fromYml: AWSOptions = properties.options && properties.options.aws ? Object.assign({}, properties.options.aws) : <AWSOptions>{};
    // @ts-ignore
    const defaults: AWSOptions = {
      region: 'us-east-1',
      profile: name,
      ecr: {
        repositoryName: name
      },
      ecs: {
        cluster: {
          clusterName: name
        },
        // @ts-ignore because we do not know the LoadbalancerARN yet
        listener: {
          Port: 80,
          Protocol: 'HTTP'
        },
        loadbalancer: {
          Name: name
        },
        // @ts-ignore because the taskDefinition needs to be registered first
        service: {
          desiredCount: 1,
          serviceName: name,
          loadBalancers: [
            {
              containerName: name,
              containerPort: 80
            }
          ]
        },
        // @ts-ignore because we don't know the VpcID yet
        targetGroup: {
          Name: name,
          Protocol: 'HTTP',
          Port: 80,
        },
        taskDefinition: {
          family: name,
          containerDefinitions: [
            {
              name: name,
              memoryReservation: 128,
              portMappings: [
                {
                  containerPort: 80,
                  hostPort: 0
                }
              ],
              logConfiguration: {
                logDriver: 'awslogs',
                options: {
                  'awslogs-region': 'us-east-1',
                  'awslogs-group': name
                }
              },
            }
          ]
        }
      }
    };

    const result: AWSOptions = this.mergeAWSOptions(env, fromYml, defaults);

    if (result.ecs && result.ecs.taskDefinition) {
      // Make sure the cloudwatch region is set to the default region
      result.ecs.taskDefinition.containerDefinitions.forEach((containerDefinition) => {
        containerDefinition.logConfiguration.options['awslogs-region'] = result.region;
      });

      // Set the service taskDefinition
      result.ecs.service.taskDefinition = result.ecs.taskDefinition.family;
    }

    if (result.ecs && result.ecs.targetGroup) {
      // Set the TargetGroup VpcId to the YML VpcId
      result.ecs.targetGroup.VpcId = result.vpcId;
    }

    return Object.assign(properties, {
      options: Object.assign(properties.options, {
        aws: result
      })
    });
  }

  private mergeAWSOptions(...args: Array<AWSOptions>): AWSOptions {
    const result: AWSOptions = <AWSOptions>{};

    const keys = new Set();
    args.forEach((item: AWSOptions) => {
      Object.keys(item).forEach((key) => keys.add(key));
    });


    keys.forEach((key) => {
      const items = args.filter((arg) => arg[key]).map((arg) => arg[key]);
      if (typeof items[0] === 'string' || typeof items[0] === 'number') {
        result[key] = items[0];
      } else if (items[0] instanceof Array) {
        result[key] = merge(...items);
      } else {
        result[key] = this.mergeRecursive(...items);
      }
    });

    return result;
  }

  private mergeRecursive(...args): any|Array<any> {
    const result = {};

    const keys = new Set();
    args.forEach((item: any) => {
      Object.keys(item).forEach((key) => keys.add(key));
    });


    keys.forEach((key) => {
      const items = args.filter((arg) => arg[key] !== undefined && arg[key] !== null).map((arg) => arg[key]);
      const type = this.nestedType(items);

      if (type === 'string' || type === 'number') {
        result[key] = items.reduce((previous, next) => {
          if (previous !== undefined && previous !== null) return previous;
          return next;
        });
      } else if (type === 'array') {
        if (this.nestedType(items[0]) === 'object') {
          if (key === 'environment') {
            const merged = [];
            items.forEach((entries) => merged.push(...entries));
            result[key] = merged;
          } else {
            const entries = [];
            const length = items.reduce((previous, next) => (next.length >= previous.length) ? next : previous).length;
            for (let i = 0; i < length; i++) {
              const objects = items.filter((item) => item[i] !== undefined && item[i] !== null).map((item) => item[i]);
              entries[i] = this.mergeRecursive(...objects);
            }
            result[key] = entries;
          }
        } else {
          // We need to reverse the items to ensure the right order is applied by lodash.merge
          result[key] = merge(...items.reverse());
        }
      } else {
        result[key] = this.mergeRecursive(...items);
      }
    });

    return result;
  }

  private nestedType(items: Array<any>): 'string'|'number'|'boolean'|'symbol'|'undefined'|'function'|'array'|'object' {
    if (items instanceof Array) {
      let item = null;
      if (items.length === 1) {
        item = items[0];
      } else if (items.length > 1) {
        item = items.reduce((previous, next) => {
          if (typeof previous !== typeof next) throw new Error('Types of nested objects do not match');
          return previous;
        });
      }

      if (Array.isArray(item)) return 'array';
      return typeof item;
    } else {
      return typeof items;
    }
  }

}
