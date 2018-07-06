'use strict';

// ------------------------------------------------------------------------------------------ Dependencies

import { ProjectProperties, AWSOptions } from '../Interfaces';
import Utils from './Utils';
import { ECR, ECS, ELBv2, CloudWatchLogs, SharedIniFileCredentials } from 'aws-sdk';
import * as merge from 'lodash.merge';

// ------------------------------------------------------------------------------------------ Variables

const log = Utils.getLogger();

// ------------------------------------------------------------------------------------------ Class

export default class AWS {

  private ecr: ECR;
  private ecs: ECS;
  private elb: ELBv2;
  private cw: CloudWatchLogs;
  private properties: ProjectProperties;

  constructor(properties: ProjectProperties) {
    this.properties = this.getDefaultProperties(properties);
    const credentials = new SharedIniFileCredentials({profile: this.properties.options.aws.profile});

    this.ecr = new ECR({
      credentials: credentials,
      region: this.properties.options.aws.region,
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

  async updateOrCreateService(): Promise<void> {
    await this.createTaskDefinition();
    await this.createListener();
    await this.createService();
  }

  async getRepositoryURI(name: string, createIfNotExists: boolean = true): Promise<AWS.ECR.Url> {
    try {
      const describeRepositoriesResponse: ECR.DescribeRepositoriesResponse = await this.ecr.describeRepositories().promise();
      const repositories = describeRepositoriesResponse.repositories.filter(repository => repository.repositoryName === name);
      const repository = repositories.length === 1 ? repositories[0] : null;

      if (repository) return repository.repositoryUri;
      if (!createIfNotExists) return Promise.reject(new Error('Repository does not exist'));

      const createRepositoryResponse: ECR.CreateRepositoryResponse = await this.ecr.createRepository({ repositoryName: name }).promise();
      return createRepositoryResponse.repository.repositoryUri;
    } catch (error) {
      this.errorHandler(error);
    }
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

  private async createTaskDefinition(): Promise<void> {
    try {
      const repositoryUri = await this.getRepositoryURI(this.properties.options.docker.repository.name);
      const taskDefinition: ECS.RegisterTaskDefinitionRequest = merge({
        containerDefinitions: [
          {
            image: `${repositoryUri}:latest`,
          }
        ]
      }, this.properties.options.aws.ecs.taskDefinition);

      // Make sure the CloudWatch log group is available
      await this.createCloudWatchLogGroup();

      // Register the task definition
      log.info('Registering ECS task definition 📄');
      await this.ecs.registerTaskDefinition(taskDefinition).promise();
    } catch (error) {
      this.errorHandler(error);
    }
  }

  private async createService(): Promise<void> {
    try {
      // Get the ARN for cluster and target group and add them to the service definition
      const clusterARN = await this.getClusterARN();
      const targetGroupARN = await this.getTargetGroupARN();
      const serviceDefinition: AWS.ECS.CreateServiceRequest = merge({
        cluster: clusterARN,
        loadBalancers: [
          {
            targetGroupArn: targetGroupARN
          }
        ]
      }, this.properties.options.aws.ecs.service);

      // Check if the service already exists
      const describeServiceResponse: ECS.DescribeServicesResponse = await this.ecs.describeServices({
        services: [ serviceDefinition.serviceName ],
        cluster: clusterARN
      }).promise();
      const services = describeServiceResponse.services.filter(service => service.serviceName === serviceDefinition.serviceName);
      let service = services.length === 1 ? services[0] : null;

      // If the service is marked INACTIVE, delete it to avoid issues
      if (service && service.status === 'INACTIVE') {
        await this.ecs.deleteService({
          cluster: serviceDefinition.cluster,
          service: serviceDefinition.serviceName
        }).promise();
        service = null;
      }

      if (!service) {
        log.info(`Creating service ${serviceDefinition.serviceName} on cluster ${this.properties.options.aws.ecs.cluster.clusterName} for task definition ${serviceDefinition.taskDefinition} 🚀`);
        await this.ecs.createService(serviceDefinition).promise();
      } else {
        log.info(`Forcing redeployment to service ${serviceDefinition.serviceName} on cluster ${this.properties.options.aws.ecs.cluster.clusterName} for task definition ${serviceDefinition.taskDefinition} 🚀`);
        await this.ecs.updateService({
          cluster: serviceDefinition.cluster,
          service: serviceDefinition.serviceName,
          desiredCount: serviceDefinition.desiredCount,
          taskDefinition: serviceDefinition.taskDefinition,
          deploymentConfiguration: serviceDefinition.deploymentConfiguration,
          networkConfiguration: serviceDefinition.networkConfiguration,
          platformVersion: serviceDefinition.platformVersion,
          healthCheckGracePeriodSeconds: serviceDefinition.healthCheckGracePeriodSeconds,
          forceNewDeployment: true
        }).promise();
      }
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

        log.info(`Adding listener to loadbalancer ${loadBalancerARN} for target group ${targetGroupARN} 👂`);
        await this.elb.createListener(listenerDefinition).promise();
      }
    } catch (error) {
      this.errorHandler(error);
    }
  }

  private async getClusterARN(): Promise<string> {
    try {
      const describeClustersResponse: ECS.DescribeClustersResponse = await this.ecs.describeClusters({ clusters: [ this.properties.options.aws.ecs.cluster.clusterName ] }).promise();
      const clusters = describeClustersResponse.clusters.filter(cluster => cluster.clusterName === this.properties.options.aws.ecs.cluster.clusterName);
      let cluster = clusters.length === 1 ? clusters[0] : null;

      // If the cluster is marked INACTIVE, delete it to avoid issues
      if (cluster && cluster.status === 'INACTIVE') {
        await this.ecs.deleteCluster({
          cluster: this.properties.options.aws.ecs.cluster.clusterName
        }).promise();
        cluster = null;
      }

      // Return the ARN if the cluster already exists
      if (cluster) return cluster.clusterArn;

      // Create the Cluster
      log.info(`ECS Cluster ${this.properties.options.aws.ecs.cluster.clusterName} does not yet exist, creating it!`);
      const createClustersResponse: ECS.CreateClusterResponse = await this.ecs.createCluster({ clusterName: this.properties.options.aws.ecs.cluster.clusterName }).promise();
      return createClustersResponse.cluster.clusterArn;
    } catch (error) {
      this.errorHandler(error);
    }
  }

  private async getLoadBalancerARN(): Promise<string> {
    try {
      const describeLoadBalancers: ELBv2.DescribeLoadBalancersOutput = await this.elb.describeLoadBalancers().promise();
      const loadbalancers = describeLoadBalancers.LoadBalancers.filter(loadbalancer => loadbalancer.LoadBalancerName === this.properties.options.aws.ecs.loadbalancer.Name);
      const loadbalancer = loadbalancers.length === 1 ? loadbalancers[0] : null;

      // Return the ARN if the loadbalancer already exists
      if (loadbalancer) return loadbalancer.LoadBalancerArn;

      // Create the Loadbalancer
      if (!this.properties.options.aws.ecs.loadbalancer.Subnets) {
        log.info(`Oh my... this is embarrassing 😳. I would love to do things automatically for you, but I need you give me some pointers regarding the loadbalancer.`);
        log.info(`Please edit the .acdeploy.yml file and set the AWS > ECS > Loadbalancer > Subnets section with properties from https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/ELBv2.html#createLoadBalancer-property`);
        process.exit(-1);
      }

      log.info(`Creating Application Load Balancer for ${this.properties.options.name}`);
      const response = await this.elb.createLoadBalancer(this.properties.options.aws.ecs.loadbalancer).promise();
      return response.LoadBalancers[0].LoadBalancerArn;
    } catch (error) {
      this.errorHandler(error);
    }
  }

  private async getTargetGroupARN(): Promise<string> {
    try {
      const describeTargetGroups: ELBv2.DescribeTargetGroupsOutput = await this.elb.describeTargetGroups().promise();
      const targetGroups = describeTargetGroups.TargetGroups.filter(targetGroup => targetGroup.TargetGroupName === this.properties.options.aws.ecs.targetGroup.Name);
      const targetGroup = targetGroups.length === 1 ? targetGroups[0] : null;

      // Return the ARN if the target group already exists
      if (targetGroup) return targetGroup.TargetGroupArn;

      // Create the TargetGroup
      if (!this.properties.options.aws.ecs.targetGroup.VpcId) {
        log.info(`Oh my... this is embarrassing 😳. I would love to do things automatically for you, but I need you give me some pointers regarding the target group.`);
        log.info(`Please edit the .acdeploy.yml file and set the AWS > ECS > TargetGroup > VpcId property (see https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/ELBv2.html#createTargetGroup-property)`);
        process.exit(-1);
      }

      log.info(`Creating Target Group for ${this.properties.options.name}`);
      const response = await this.elb.createTargetGroup(this.properties.options.aws.ecs.targetGroup).promise();
      return response.TargetGroups[0].TargetGroupArn;
    } catch (error) {
      this.errorHandler(error);
    }
  }

  private async createCloudWatchLogGroup(): Promise<void> {
    try {
      const name = this.properties.options.name;
      const describeLogGroupsResponse: CloudWatchLogs.DescribeLogGroupsResponse = await this.cw.describeLogGroups({ logGroupNamePrefix: name }).promise();
      const loggroups = describeLogGroupsResponse.logGroups.filter(loggroup => loggroup.logGroupName === name);
      const loggroup = loggroups.length === 1 ? loggroups[0] : null;

      // Only create the log group if it doesn't exist
      if (!loggroup) {
        log.info(`Creating CloudWatch log group ${this.properties.options.name}`);
        await this.cw.createLogGroup({ logGroupName: this.properties.options.name }).promise();
      }
    } catch (error) {
      this.errorHandler(error);
    }
  }

  private errorHandler(error) {
    if (error.code === 'AccessDeniedException' || error.code === 'InvalidSignatureException') {
      log.error(`Err... this is embarrassing. You don't have the required permissions to perform this operation 👇`);
      log.error(error.message);
      process.exit(-1);
    } else {
      throw error;
    }
  }

  private getDefaultProperties(properties: ProjectProperties) {
    const defaults = merge({
      options: {
        aws: {
          region: 'us-east-1',
          ecs: {
            cluster: {
              clusterName: properties.options.name
            },
            listener: {
              Port: 80,
              Protocol: 'HTTP'
            },
            loadbalancer: {
              Name: properties.options.name
            },
            service: {
              desiredCount: 1,
              serviceName: properties.options.name,
              loadBalancers: [
                {
                  containerName: properties.options.name,
                  containerPort: 80
                }
              ]
            },
            targetGroup: {
              Name: properties.options.name,
              Protocol: 'HTTP',
              Port: 80,
            },
            taskDefinition: {
              family: properties.options.name,
              containerDefinitions: [
                {
                  name: properties.options.name,
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
                      'awslogs-region': properties.options.aws.region,
                      'awslogs-group': properties.options.name
                    }
                  },
                }
              ]
            }
          }
        }
      }
    }, properties);

    defaults.options.aws.ecs.service.taskDefinition = defaults.options.aws.ecs.service.taskDefinition || defaults.options.aws.ecs.taskDefinition.family;
    defaults.options.aws.ecs.service.loadBalancers.forEach((loadBalancer) => loadBalancer.containerName = defaults.options.aws.ecs.taskDefinition.containerDefinitions[0].name);
    return defaults;
  }

}
