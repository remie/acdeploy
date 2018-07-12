'use strict';

import { ECS } from 'aws-sdk';

// ------------------------------------------------------------------------------------------ Interfaces

export interface Command {
  run: (args: CommandLineArgs) => Promise<void>;
  showHelp(): void;
}

export type CommandLineArgs = {
    [key: string]: string|number|boolean;
};

export interface ProjectProperties {
  basedir: string;
  verbose: boolean;
  ymlFile: string;
  options?: ACDeployOptions;
}

export interface ACDeployOptions {
  name: string;
  ci: SupportedCI;
  buildPack: BuildPack;
  docker: DockerOptions;
  aws: AWSOptions;
}

export interface DockerOptions {
  name: string;
  repository: DockerRepositoryOptions;
}

export interface DockerRepositoryOptions {
  type: SupportedDockerRepositories;
  name: string;
}

export interface AWSOptions {
  region: string;
  profile: string;
  vpcId: string;
  ecs: ECSOptions;
  ecr: AWS.ECR.CreateRepositoryRequest;
}

export interface ECSOptions {
  cluster: AWS.ECS.Cluster;
  service: AWS.ECS.CreateServiceRequest;
  taskDefinition: AWS.ECS.RegisterTaskDefinitionRequest;
  loadbalancer?: AWS.ELBv2.CreateLoadBalancerInput;
  targetGroup?: AWS.ELBv2.CreateTargetGroupInput;
  listener?: AWS.ELBv2.CreateListenerInput;
}

export interface AWSCredentials {
  aws_access_key_id?: string;
  aws_secret_access_key?: string;
}

export interface BuildPack {
  image: string;
  tag: string;
  body: string;
  command: string;
  dockerignore: string;
}

export interface CI {
  create: () => void;
  delete: () => void;
}

export type SupportedCI = 'travis' | string;
export type SupportedDockerRepositories = 'aws-ecr';
