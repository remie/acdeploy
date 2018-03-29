'use strict';

// ------------------------------------------------------------------------------------------ Dependencies

import Utils from './Utils';
import AWS from './AWS';
import { ProjectProperties, DockerOptions, BuildPack } from '../Interfaces';
import * as fs from 'fs';
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

  constructor(properties: ProjectProperties) {
    this.basedir = properties.basedir;
    this.verbose = properties.verbose;
    this.buildPack = properties.options.buildPack;
    this.options = properties.options.docker;
  }

  build(forDeployment: boolean = true): Promise<void> {
    log.info('Creating Dockerfile. This file SHOULD NOT be committed to version control');

    // Write Dockerfile to disk
    fs.writeFileSync(path.join(this.basedir, 'Dockerfile'), this.toDockerfile());

    // Only write .dockerignore to disk when deploying
    // Some of the ignored local files will probably be needed when running `acdeploy --serve`
    if (forDeployment) {
      fs.writeFileSync(path.join(this.basedir, '.dockerignore'), this.getDockerIgnore());
    } else if (fs.existsSync(path.join(this.basedir, '.dockerignore'))) {
      fs.unlinkSync(path.join(this.basedir, '.dockerignore'));
    }

    // Build the docker file
    log.info('Building Docker image. You can get something to drink ☕, play some guitar 🎸 or do your chores 💪, \'cause this can take a whale 🐋');
    return this.exec(['build', '-t', this.options.name, '.']);
  }

  tag(name: string, tag: string = 'latest'): Promise<string> {
    log.info(`Tagging Docker image '${this.options.name}:latest' as '${name}:${tag}' 💪`);
    return this.exec(['tag', `${this.options.name}:latest`, `${name}:${tag}`]).then(() => Promise.resolve(`${name}:${tag}`));
  }

  push(): Promise<void> {
    log.info('Retrieving/creating Amazon Web Service ECR repository 🗄️');
    const aws = new AWS(this.properties);
    return aws.getRepositoryURI(this.options.repository.name)
      .then(repositoryUri => this.tag(repositoryUri))
      .then(name => {
        log.info('Retrieving docker credentials for Amazon Web Service ECR repository 🔐');
        return aws.getDockerLoginCommand()
          .then(parameters => this.exec(parameters))
          .then(() => {
              log.info('Pushing docker image to for Amazon Web Service ECR repository 📦');
              return this.exec(['push', name]);
          });
        });
  }

  run(): Promise<void> {
    log.info(`Starting docker container ${this.options.name} with ports 8000->80 and 8443->443. To stop, press ^C`);
    return this.exec(['run', '--rm', '--name', this.options.name, '-p', '8000:80', '-p', '8443:443', this.options.name], true);
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
Dockerfile
.travis.yml
`;

    dockerIgnore += this.buildPack.dockerignore;
    return dockerIgnore;
  }

  private exec(parameters: Array<string>, verbose: boolean = this.verbose): Promise<void> {
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

