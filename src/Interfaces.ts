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
  ci: CIOptions;
  buildPack: SupportedBuildPacks|string;
  environments: Environments;
  docker: DockerOptions;
  aws: AWSOptions;
}

export interface Environments {
  [key: string]: EnvironmentOptions;
}

export interface EnvironmentOptions {
  enabled: boolean;
  suffix: string;
  branch?: string|RegExp;
  docker?: DockerOptions;
  aws?: AWSOptions;
}

export interface CIOptions {
  name: SupportedCI;
  predeploy?: Array<any>;
  postdeploy?: Array<any>;
}

export interface DockerOptions {
  name: string;
  dockerFile: string;
  buildArgs: Array<DockerBuildArguments>;
  repository: DockerRepositoryOptions;
}

export interface DockerBuildArguments {
  name: string;
  value: string;
}

export interface DockerRepositoryOptions {
  type: SupportedDockerRepositories;
  name: string;
}

export interface AWSOptions {
  region: string;
  profile: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  vpcId: string;
  ecs: ECSOptions;
  ecr: AWS.ECR.CreateRepositoryRequest;
}

export interface ECSOptions {
  cluster: AWS.ECS.CreateClusterRequest;
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

export interface ServeProperties {
  environment?: string;
}

export type SupportedCI = 'travis' | 'circleci' | string;
export type SupportedDockerRepositories = 'aws-ecr';
export type SupportedBuildPacks = 'PHP' | 'NodeJS' | 'Maven';
