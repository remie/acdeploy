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
  private options: AWSOptions;
  private properties: ProjectProperties;

  constructor(properties: ProjectProperties) {
    this.properties = properties;
    this.options = properties.options.aws;
    const credentials = new SharedIniFileCredentials({profile: properties.options.aws.profile});

    this.ecr = new ECR({
      credentials: credentials,
      region: properties.options.aws.region,
    });

    this.ecs = new ECS({
      credentials: credentials,
      region: properties.options.aws.region
    });

    this.elb = new ELBv2({
      credentials: credentials,
      region: properties.options.aws.region
    });

    this.cw = new CloudWatchLogs({
      credentials: credentials,
      region: properties.options.aws.region
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

      if (!repository) {
        if (createIfNotExists) {
          const createRepositoryResponse: ECR.CreateRepositoryResponse = await this.ecr
            .createRepository({ repositoryName: name })
            .promise();
          return createRepositoryResponse.repository.repositoryUri;
        } else {
          return Promise.reject(new Error('Repository does not exist'));
        }
      } else {
        return repository.repositoryUri;
      }
    } catch (error) {
      if (error.code === 'AccessDeniedException' || error.code === 'InvalidSignatureException') {
        log.error(`Err... this is embarrassing. You don't have the required permissions to perform this operation 👇`);
        log.error(error.message);
        process.exit(-1);
      } else {
        throw error;
      }
    }
  }

  async getDockerLoginCommand(): Promise<Array<string>> {
    try {
      const result = await this.ecr.getAuthorizationToken().promise();
      const credentials = Buffer.from(result.authorizationData[0].authorizationToken, 'base64').toString('utf8').split(':');
      return [ 'login', '-u', credentials[0], '-p', credentials[1], result.authorizationData[0].proxyEndpoint];
    } catch (error) {
      if (error.code === 'AccessDeniedException' || error.code === 'InvalidSignatureException') {
        log.error(`Err... this is embarrassing. You don't have the required permissions to perform this operation 👇`);
        log.error(error.message);
        process.exit(-1);
      } else {
        throw error;
      }
    }
  }

  private async createTaskDefinition(): Promise<void> {
    try {
      const repositoryUri = await this.getRepositoryURI(this.properties.options.docker.repository.name);
      const taskDefinition: ECS.RegisterTaskDefinitionRequest = this.options.ecs.taskDefinition;

      taskDefinition.containerDefinitions = merge(taskDefinition.containerDefinitions, [
        {
          name: this.properties.options.name,
          image: `${repositoryUri}:latest`,
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
              'awslogs-region': this.options.region,
              'awslogs-group': this.properties.options.name
            }
          },
        }
      ]);

      // Make sure the CloudWatch log group is available
      await this.createCloudWatchLogGroup();

      log.info('Registering ECS task definition 📄');
      await this.ecs.registerTaskDefinition(taskDefinition).promise();
    } catch (error) {
      if (error.code === 'AccessDeniedException' || error.code === 'InvalidSignatureException') {
        log.error(`Err... this is embarrassing. You don't have the required permissions to perform this operation 👇`);
        log.error(error.message);
        process.exit(-1);
      } else {
        throw error;
      }
    }
  }

  private async createService(): Promise<void> {
    try {
      const clusterARN = await this.getClusterARN();
      const targetGroupARN = await this.getTargetGroupARN();

      const serviceDefinition: ECS.CreateServiceRequest = this.options.ecs.service || {} as ECS.CreateServiceRequest;
      serviceDefinition.serviceName = serviceDefinition.serviceName || this.properties.options.name;
      serviceDefinition.taskDefinition = serviceDefinition.taskDefinition || this.options.ecs.taskDefinition.family;
      serviceDefinition.cluster = serviceDefinition.cluster || clusterARN;
      serviceDefinition.desiredCount = serviceDefinition.desiredCount !== undefined ? serviceDefinition.desiredCount :  1;
      serviceDefinition.loadBalancers = serviceDefinition.loadBalancers && serviceDefinition.loadBalancers.length > 0 ? serviceDefinition.loadBalancers : [
        {
          containerName: this.properties.options.name,
          containerPort: 80,
          targetGroupArn: targetGroupARN
        }
      ];

      const describeServiceResponse: ECS.DescribeServicesResponse = await this.ecs.describeServices({
        services: [ serviceDefinition.serviceName ],
        cluster: clusterARN
      }).promise();
      const services = describeServiceResponse.services.filter(service => service.serviceName === serviceDefinition.serviceName);
      let service = services.length === 1 ? services[0] : null;

      if (service && service.status === 'INACTIVE') {
        await this.ecs.deleteService({
          service: serviceDefinition.serviceName,
          cluster: clusterARN
        }).promise();
        service = null;
      }

      if (!service) {
        log.info(`Creating service ${serviceDefinition.serviceName} on cluster ${this.options.ecs.cluster.clusterName}`);
        await this.ecs.createService(serviceDefinition).promise();
      } else {
        log.info(`Forcing redeployment to service ${serviceDefinition.serviceName} on cluster ${this.options.ecs.cluster.clusterName}`);
        await this.ecs.updateService({
          service: serviceDefinition.serviceName,
          taskDefinition: serviceDefinition.taskDefinition,
          cluster: clusterARN,
          forceNewDeployment: true
        }).promise();
      }
    } catch (error) {
      if (error.code === 'AccessDeniedException' || error.code === 'InvalidSignatureException') {
        log.error(`Err... this is embarrassing. You don't have the required permissions to perform this operation 👇`);
        log.error(error.message);
        process.exit(-1);
      } else {
        throw error;
      }
    }
  }

  public async createListener(): Promise<void> {
    try {
      const loadBalancerARN = await this.getLoadBalancerARN();
      const targetGroupARN = await this.getTargetGroupARN();

      const describeListenersResponse: ELBv2.DescribeListenersOutput = await this.elb.describeListeners({ LoadBalancerArn: loadBalancerARN }).promise();
      if (describeListenersResponse.Listeners.length === 0) {

        const listenerDefinition: ELBv2.CreateListenerInput = this.options.ecs.listener;
        if (!listenerDefinition) {
          log.info(`Oh my... this is embarrassing 😳. I would love to do things automatically for you, but I need you give me some pointers regarding the loadbalancer.`);
          log.info(`Please edit the .acdeploy.yml file and set the AWS > ECS > Listener section with properties from https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/ELBv2.html#createListener-property`);
          process.exit(-1);
        }

        listenerDefinition.LoadBalancerArn = loadBalancerARN;
        if (!listenerDefinition.DefaultActions || listenerDefinition.DefaultActions.length === 0) {
           listenerDefinition.DefaultActions = [{
             TargetGroupArn: targetGroupARN,
             Type: 'forward'
           }];
        } else {
          listenerDefinition.DefaultActions.forEach((action) => action.TargetGroupArn = targetGroupARN);
        }



        log.info(`Adding listener to loadbalancer ${loadBalancerARN} for target group ${targetGroupARN}`);
        await this.elb.createListener(listenerDefinition).promise();

      }
    } catch (error) {
      if (error.code === 'AccessDeniedException' || error.code === 'InvalidSignatureException') {
        log.error(`Err... this is embarrassing. You don't have the required permissions to perform this operation 👇`);
        log.error(error.message);
        process.exit(-1);
      } else {
        throw error;
      }
    }
  }

  private async getClusterARN(): Promise<string> {
    try {
      if (!this.options.ecs.cluster.clusterArn) {
        const name = this.options.ecs.cluster.clusterName;
        const describeClustersResponse: ECS.DescribeClustersResponse = await this.ecs.describeClusters({ clusters: [ name ] }).promise();
        const clusters = describeClustersResponse.clusters.filter(cluster => cluster.clusterName === name);
        const cluster = clusters.length === 1 ? clusters[0] : null;
        if (cluster) {
          return cluster.clusterArn;
        } else {
          const createClustersResponse: ECS.CreateClusterResponse = await this.ecs.createCluster({ clusterName: name }).promise();
          return createClustersResponse.cluster.clusterArn;
        }
      } else {
        return this.options.ecs.cluster.clusterArn;
      }
    } catch (error) {
      if (error.code === 'AccessDeniedException' || error.code === 'InvalidSignatureException') {
        log.error(`Err... this is embarrassing. You don't have the required permissions to perform this operation 👇`);
        log.error(error.message);
        process.exit(-1);
      } else {
        throw error;
      }
    }
  }

  private async getLoadBalancerARN(): Promise<string> {
    try {
      const name = this.options.ecs.loadbalancer.Name;
      const describeLoadBalancers: ELBv2.DescribeLoadBalancersOutput = await this.elb.describeLoadBalancers().promise();
      const loadbalancers = describeLoadBalancers.LoadBalancers.filter(loadbalancer => loadbalancer.LoadBalancerName === name);
      const loadbalancer = loadbalancers.length === 1 ? loadbalancers[0] : null;

      if (!loadbalancer) {
        if (!this.options.ecs.loadbalancer.Subnets) {
          log.info(`Oh my... this is embarrassing 😳. I would love to do things automatically for you, but I need you give me some pointers regarding the loadbalancer.`);
          log.info(`Please edit the .acdeploy.yml file and set the AWS > ECS > Loadbalancer > Subnets section with properties from https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/ELBv2.html#createLoadBalancer-property`);
          process.exit(-1);
        }

        log.info(`Creating Application Load Balancer for ${this.properties.options.name}`);
        const response = await this.elb.createLoadBalancer(this.options.ecs.loadbalancer).promise();
        return response.LoadBalancers[0].LoadBalancerArn;
      } else {
        return loadbalancer.LoadBalancerArn;
      }
    } catch (error) {
      if (error.code === 'AccessDeniedException' || error.code === 'InvalidSignatureException') {
        log.error(`Err... this is embarrassing. You don't have the required permissions to perform this operation 👇`);
        log.error(error.message);
        process.exit(-1);
      } else {
        throw error;
      }
    }
  }

  private async getTargetGroupARN(): Promise<string> {
    try {
      const name = this.options.ecs.targetGroup.Name;
      const describeTargetGroups: ELBv2.DescribeTargetGroupsOutput = await this.elb.describeTargetGroups().promise();
      const targetGroups = describeTargetGroups.TargetGroups.filter(targetGroup => targetGroup.TargetGroupName === name);
      const targetGroup = targetGroups.length === 1 ? targetGroups[0] : null;

      if (!targetGroup) {
        if (!this.options.ecs.targetGroup.VpcId) {
          log.info(`Oh my... this is embarrassing 😳. I would love to do things automatically for you, but I need you give me some pointers regarding the target group.`);
          log.info(`Please edit the .acdeploy.yml file and set the AWS > ECS > TargetGroup > VpcId property (see https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/ELBv2.html#createTargetGroup-property)`);
          process.exit(-1);
        }

        log.info(`Creating Target Group for ${this.properties.options.name}`);
        const response = await this.elb.createTargetGroup(this.options.ecs.targetGroup).promise();
        return response.TargetGroups[0].TargetGroupArn;
      } else {
        return targetGroup.TargetGroupArn;
      }
    } catch (error) {
      if (error.code === 'AccessDeniedException' || error.code === 'InvalidSignatureException') {
        log.error(`Err... this is embarrassing. You don't have the required permissions to perform this operation 👇`);
        log.error(error.message);
        process.exit(-1);
      } else {
        throw error;
      }
    }
  }

  private async createCloudWatchLogGroup(): Promise<void> {
    try {
      const name = this.properties.options.name;
      const describeLogGroupsResponse: CloudWatchLogs.DescribeLogGroupsResponse = await this.cw.describeLogGroups({ logGroupNamePrefix: name }).promise();
      const loggroups = describeLogGroupsResponse.logGroups.filter(loggroup => loggroup.logGroupName === name);
      const loggroup = loggroups.length === 1 ? loggroups[0] : null;

      if (!loggroup) {
        log.info(`Creating CloudWatch log group ${this.properties.options.name}`);
        await this.cw.createLogGroup({ logGroupName: this.properties.options.name }).promise();
      }
    } catch (error) {
      if (error.code === 'AccessDeniedException' || error.code === 'InvalidSignatureException') {
        log.error(`Err... this is embarrassing. You don't have the required permissions to perform this operation 👇`);
        log.error(error.message);
        process.exit(-1);
      } else {
        throw error;
      }
    }
  }

}
