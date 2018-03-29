'use strict';

// ------------------------------------------------------------------------------------------ Dependencies

import { ProjectProperties, AWSOptions } from '../Interfaces';
import Utils from './Utils';
import { ECR, ECS, ELBv2 } from 'aws-sdk';

// ------------------------------------------------------------------------------------------ Variables

const log = Utils.getLogger();

// ------------------------------------------------------------------------------------------ Class

export default class AWS {

  private ecr: ECR;
  private ecs: ECS;
  private elb: ELBv2;
  private options: AWSOptions;

  constructor(properties: ProjectProperties) {
    this.options = properties.options.aws;

    this.ecr = new ECR({
      accessKeyId: properties.options.aws.accessKeyId,
      secretAccessKey: properties.options.aws.secretAccessKey,
      region: properties.options.aws.region
    });

    this.ecs = new ECS({
      accessKeyId: properties.options.aws.accessKeyId,
      secretAccessKey: properties.options.aws.secretAccessKey,
      region: properties.options.aws.region
    });

    this.elb = new ELBv2({
      accessKeyId: properties.options.aws.accessKeyId,
      secretAccessKey: properties.options.aws.secretAccessKey,
      region: properties.options.aws.region
    });
  }

  updateOrCreateService() {
    return this.createCluster()
      .then(() => this.createTaskDefinition());
  }

  getRepositoryURI(name: string, createIfNotExists: boolean = true): Promise<AWS.ECR.Url> {
    return this.ecr.describeRepositories().promise().then(data => {
      const repositories = data.repositories.filter(repository => repository.repositoryName === name);
      const repository = repositories.length === 1 ? repositories[0] : null;
      return Promise.resolve(repository);
    }).then(repository => {
      if (!repository) {
        if (createIfNotExists) {
          return this.ecr.createRepository({
            repositoryName: name
          })
          .promise()
          .then(result => Promise.resolve(result.repository.repositoryUri))
          .catch(error => Promise.reject(error));
        } else {
          return Promise.reject(new Error('Repository does not exist'));
        }
      } else {
        return Promise.resolve(repository.repositoryUri);
      }
    }).catch(error => Promise.reject(error));
  }

  getDockerLoginCommand(): Promise<Array<string>> {
    return this.ecr.getAuthorizationToken().promise().then(result => {
      const credentials = Buffer.from(result.authorizationData[0].authorizationToken, 'base64').toString('utf8').split(':');
      return Promise.resolve([ 'login', '-u', credentials[0], '-p', credentials[1], result.authorizationData[0].proxyEndpoint]);
    }).catch(error => Promise.reject(error));
  }

  private createCluster(): Promise<AWS.ECS.Cluster> {
    // Get the name of the cluster
    const name = this.options.ecs.cluster.clusterName;
    log.info(`Creating ECS cluster ${name}`);

    // Check if the cluster already exists, if not: create!
    return this.ecs.describeClusters().promise().then(result => {
      const clusters = result.clusters.filter(cluster => cluster.clusterName === name);
      const cluster = (clusters.length === 0) ? clusters[0] : null;
      if (cluster) {
        return Promise.resolve(cluster);
      } else {
        return this.ecs.createCluster({ clusterName: name }).promise().then(result => Promise.resolve(result.cluster));
      }
    });
  }

  private createTaskDefinition(): Promise<boolean> {
    return this.ecs.registerTaskDefinition(this.options.ecs.taskDefinition).promise().then(() => Promise.resolve(true));
  }

  static isAuthenticated(): boolean {
    const ecr = new ECR();
    console.log(ecr.config.credentials);
    return ecr.config.credentials ? true : false;
  }

}
