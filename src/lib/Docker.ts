'use strict';

// ------------------------------------------------------------------------------------------ Dependencies

import { ProjectProperties, DockerOptions, BuildPack, EnvironmentOptions, ACDeployOptions } from '../Interfaces';
import { Utils } from './Utils';
import { AWS } from './AWS';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as bunyan from 'bunyan';
import * as merge from 'lodash.merge';
import { spawn } from 'child_process';

// ------------------------------------------------------------------------------------------ Class

export class Docker {

  private aws: AWS;
  private log: bunyan;
  private properties: ProjectProperties;

  constructor(environment?: EnvironmentOptions) {
    let suffix = environment && environment.suffix ? environment.suffix : '';
    suffix = (suffix === '' || suffix.startsWith('-')) ? suffix : '-' + suffix;

    // Set the default Docker properties
    this.properties = merge(Utils.properties, {
      options: {
        docker: {
          name: Utils.properties.options.name + suffix
        }
      }
    });

    this.log = Utils.getLogger();
    this.aws = new AWS(environment);
  }

  async login() {
    const parameters = await this.aws.getDockerLoginCommand();
    this.log.info('Retrieving docker credentials for Amazon Web Service ECR repository 🔐');
    await this.exec(parameters);
  }

  async build(forDeployment: boolean = true): Promise<void> {
    this.log.info('Creating Dockerfile 🐳. This file SHOULD NOT be committed to version control ⛔');

    // Write Dockerfile to disk
    await fs.writeFile(path.join(this.properties.basedir, 'Dockerfile'), this.toDockerfile());

    // Only write .dockerignore to disk when deploying
    // Some of the ignored local files will probably be needed when running `acdeploy --serve`
    await fs.writeFile(path.join(this.properties.basedir, '.dockerignore'), this.getDockerIgnore());

    const buildCmd = ['build'];
    try {
      const repositoryUri = await this.aws.getRepositoryURI();
      if (repositoryUri) {
        this.log.info('Pulling existing Docker image to speed up the build 🏃💨');
        await this.login();
        await this.exec(['pull', repositoryUri]);
        buildCmd.push('--cache-from');
        buildCmd.push(repositoryUri);
      }
    } catch (error) {}

    const options = Utils.replaceEnvironmentVariables(<any>{
      docker: this.properties.options.docker
    }, true);

    if (options.docker && options.docker.buildArgs) {
      options.docker.buildArgs.forEach((buildArg) => {
        buildCmd.push('--build-arg');
        buildCmd.push(`${buildArg.name}=${buildArg.value}`);
      });
    }

    // Build the docker file
    this.log.info('Building Docker image. You can get something to drink ☕, play some guitar 🎸 or do your chores 💪, \'cause this can take a whale 🐋');
    await this.exec(buildCmd.concat(['-t', this.properties.options.docker.name, '.']), true);
  }

  async tag(name: string, tag: string = 'latest'): Promise<string> {
    this.log.info(`Tagging Docker image '${this.properties.options.docker.name}:latest' as '${name}:${tag}' 💪`);
    await this.exec(['tag', `${this.properties.options.docker.name}:latest`, `${name}:${tag}`]);
    return `${name}:${tag}`;
  }

  async push(): Promise<void> {
    try {
      this.log.info('Retrieving/creating Amazon Web Service ECR repository 🗄️');
      const repositoryUri = await this.aws.getRepositoryURI();
      const name = await this.tag(repositoryUri);
      await this.login();

      this.log.info('Pushing docker image to Amazon Web Service ECR repository 📦');
      await this.exec(['push', name]);
    } catch (error) {
      if (error.message === 'Repository does not exist') {
        this.log.warn('It looks like AWS has not yet been provisioned for this application. Please run `acdeploy apply` first');
        process.exit(-1);
      } else {
        throw error;
      }
    }
  }

  async run(): Promise<void> {
    this.log.info(`Starting docker container ${this.properties.options.docker.name} with ports 8000->80 and 8443->443. To stop, press ^C`);

    // Stop running containers to avoid conflict
    try {
      await this.exec([ 'stop', this.properties.options.docker.name ], false);
      await new Promise((resolve) => setTimeout(() => resolve(), 2000));
    } catch {}

    const env = [];
    const options = Utils.replaceEnvironmentVariables(this.properties.options, false);
    if (options.aws &&
      options.aws.ecs &&
      options.aws.ecs.taskDefinition &&
      options.aws.ecs.taskDefinition.containerDefinitions &&
      options.aws.ecs.taskDefinition.containerDefinitions[0] &&
      options.aws.ecs.taskDefinition.containerDefinitions[0].environment) {
      env.push(...options.aws.ecs.taskDefinition.containerDefinitions[0].environment);
    }

    const args = ['run', '--rm', '--name', this.properties.options.docker.name, '-p', '8000:80', '-p', '8443:443'];
    env.forEach((entry) => {
      args.push(...['-e', `${entry.name}=${entry.value}`]);
    });
    args.push(this.properties.options.docker.name);

    await this.exec(args, true);
  }

  private toDockerfile() {
    if (this.properties.options.docker.dockerFile) {
      return this.properties.options.docker.dockerFile;
    }

    const buildPack: BuildPack = Utils.getBuildPack();
    if (buildPack) {
      return `
FROM ${buildPack.image}:${buildPack.tag}

${this.buildArgs}

${buildPack.body}

${buildPack.command}
`.trim();
    } else {
      throw new Error('Oh my... I could not detect a valid predefined build pack, nor do you have a custom Dockerfile in your YML. Not sure what you want me to do here? 😕');
    }
  }

  private get buildArgs() {
    let args = '';

    const options = Utils.replaceEnvironmentVariables(<any>{
      docker: this.properties.options.docker
    }, true);

    if (options.docker && options.docker.buildArgs) {
      options.docker.buildArgs.forEach((buildArg) => {
        args += `
ARG ${buildArg.name}
ENV ${buildArg.name}=\$\{${buildArg.name}\}
`;
      });
    }

    return args;
  }

  private getDockerIgnore() {
    let dockerIgnore = `
.acdeploy
.acdeploy.yml
.acdeploy.yaml
acdeploy.yml
acdeploy.yaml
.circleci
.travis.yml
.git
.dockerignore
Dockerfile
`;

    const buildPack: BuildPack = Utils.getBuildPack();
    if (buildPack) {
      dockerIgnore += buildPack.dockerignore;
    }
    return dockerIgnore;
  }

  private async exec(parameters: Array<string>, verbose: boolean = this.properties.verbose): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const docker = spawn('docker', parameters);
      if (verbose) {
        docker.stdout.on('data', (lines: Buffer) => { console.log(lines.toString('utf-8').trim()); });
      }
      docker.stderr.on('data', (lines: Buffer) => { console.log(lines.toString('utf-8').trim()); });
      docker.on('exit', (code) => (code === 0) ? resolve() : reject(new Error(`Docker exited with code ${code}`)));
    });
  }

}

