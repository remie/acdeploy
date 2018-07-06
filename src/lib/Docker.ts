'use strict';

// ------------------------------------------------------------------------------------------ Dependencies

import Utils from './Utils';
import AWS from './AWS';
import { ProjectProperties, DockerOptions, BuildPack } from '../Interfaces';
import * as fs from 'fs-extra';
import * as path from 'path';
import { spawn } from 'child_process';

// ------------------------------------------------------------------------------------------ Variables

const log = Utils.getLogger();

// ------------------------------------------------------------------------------------------ Class

export default class Docker {

  private basedir: string;
  private buildPack: BuildPack;
  private properties: ProjectProperties;
  private options: DockerOptions;
  private verbose: boolean;
  private aws: AWS;


  constructor(properties: ProjectProperties) {
    this.basedir = properties.basedir;
    this.verbose = properties.verbose;
    this.buildPack = properties.options.buildPack;
    this.options = properties.options.docker;
    this.properties = properties;
    this.aws = new AWS(properties);
  }

  async login() {
    const parameters = await this.aws.getDockerLoginCommand();
    log.info('Retrieving docker credentials for Amazon Web Service ECR repository 🔐');
    await this.exec(parameters);
  }

  async build(forDeployment: boolean = true): Promise<void> {
    log.info('Creating Dockerfile 🐳. This file SHOULD NOT be committed to version control ⛔');

    // Write Dockerfile to disk
    await fs.writeFile(path.join(this.basedir, 'Dockerfile'), this.toDockerfile());

    // Only write .dockerignore to disk when deploying
    // Some of the ignored local files will probably be needed when running `acdeploy --serve`
    await fs.writeFile(path.join(this.basedir, '.dockerignore'), this.getDockerIgnore());

    const buildCmd = ['build'];
    try {
      const repositoryUri = await this.aws.getRepositoryURI(this.options.repository.name);
      if (repositoryUri) {
        log.info('Pulling existing Docker image to speed up the build 🏃💨');
        await this.login();
        await this.exec(['pull', repositoryUri]);
        buildCmd.push('--cache-from');
        buildCmd.push(repositoryUri);
      }
    } catch (error) {}

    // Build the docker file
    log.info('Building Docker image. You can get something to drink ☕, play some guitar 🎸 or do your chores 💪, \'cause this can take a whale 🐋');
    await this.exec(buildCmd.concat(['-t', this.options.name, '.']), true);
  }

  async tag(name: string, tag: string = 'latest'): Promise<string> {
    log.info(`Tagging Docker image '${this.options.name}:latest' as '${name}:${tag}' 💪`);
    await this.exec(['tag', `${this.options.name}:latest`, `${name}:${tag}`]);
    return `${name}:${tag}`;
  }

  async push(): Promise<void> {
    log.info('Retrieving/creating Amazon Web Service ECR repository 🗄️');
    const repositoryUri = await this.aws.getRepositoryURI(this.options.repository.name);
    const name = await this.tag(repositoryUri);
    await this.login();

    log.info('Pushing docker image to Amazon Web Service ECR repository 📦');
    await this.exec(['push', name]);
  }

  async run(): Promise<void> {
    log.info(`Starting docker container ${this.options.name} with ports 8000->80 and 8443->443. To stop, press ^C`);
    await this.exec(['run', '--rm', '--name', this.options.name, '-p', '8000:80', '-p', '8443:443', this.options.name], true);
  }

  private toDockerfile() {
    return `
FROM ${this.buildPack.image}:${this.buildPack.tag}

${this.buildPack.body}

${this.buildPack.command}
`.trim();
  }

  private getDockerIgnore() {
    let dockerIgnore = `
.acdeploy
.acdeploy.yml
.acdeploy.yaml
acdeploy.yml
acdeploy.yaml
.travis.yml
.git
.dockerignore
Dockerfile
`;

    dockerIgnore += this.buildPack.dockerignore;
    return dockerIgnore;
  }

  private async exec(parameters: Array<string>, verbose: boolean = this.verbose): Promise<void> {
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

