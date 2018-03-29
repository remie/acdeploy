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
  isPHP: boolean;
  isNodeJS: boolean;
  isMaven: boolean;
  isDockerized: boolean;
  isBower: boolean;
  options: ACDeployOptions;
  ymlFile: string;
  verbose: boolean;
}

export interface YMLOptions {
  name: string;
  ci: SupportedCI;
  buildPack: string|BuildPack;
  docker: DockerOptions;
  aws: AWSOptions;
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
  accessKeyId?: string;
  secretAccessKey?: string;
  region: string;
  ecs: ECSOptions;
}

export interface ECSOptions {
  cluster: AWS.ECS.CreateClusterRequest;
  service: AWS.ECS.CreateServiceRequest;
  taskDefinition: AWS.ECS.RegisterTaskDefinitionRequest;
  loadbalancer?: AWS.ELBv2.CreateLoadBalancerInput;
  targetGroup?: AWS.ELBv2.CreateTargetGroupInput;
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
