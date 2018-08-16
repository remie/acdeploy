'use strict';

import { AbstractCommand } from './AbstractCommand';
import { Utils } from '../lib/Utils';
import { Docker } from '../lib/Docker';
import { AWS } from '../lib/AWS';
import * as fs from 'fs-extra';
import * as ini from 'ini';

export class DefaultCommand extends AbstractCommand {

  async run(): Promise<void> {

    // Check for required parameters & turn them into properties
    const properties = await this.getProperties();

    // Make sure that we have all required options available
    if (!properties.options.name) {
      this.log.warn('It looks like ACDeploy has not yet been enabled for this project. Please run `acdeploy init` first');
      process.exit(-1);
    }

    this.log.info(`Starting deployment of ${properties.options.name} 🤞`);

    // Check if acdeploy login was executed
    try {
      const credentialsFilePath = `${process.env.HOME}/.aws/credentials`;
      const credentialsFileAvailable = await fs.pathExists(credentialsFilePath);
      if (!credentialsFileAvailable) throw new Error('AWS credentials file not found');
      const credentials = ini.parse(await fs.readFile(credentialsFilePath, 'utf-8'));
      const profile = properties.options.aws && properties.options.aws.profile ? properties.options.aws.profile : properties.options.name;
      if (!credentials[profile]) throw new Error('AWS credentials missing');
    } catch (error) {
      console.log(error);
      this.log.warn('It looks like ACDeploy has not yet been authorized to deploy this application. Please run `acdeploy login` first');
      process.exit(-1);
    }

    const suffix = await this.getSuffix();

    // Start deployment of this project
    const docker: Docker = new Docker(suffix);
    await docker.build();
    await docker.push();
    await new AWS(suffix).deploy();
    this.log.info(`Successfully deployed ${properties.options.name} 🏆`);
  }

  showHelp() {
    Utils.showHelp();
  }

  private async getSuffix(): Promise<string> {
    const properties = await this.getProperties();

    let branch: string;
    switch (properties.options.ci.toLowerCase()) {
      case 'travis':
        if (process.env.TRAVIS_PULL_REQUEST_BRANCH !== '') {
          branch = process.env.TRAVIS_PULL_REQUEST_BRANCH;
        } else {
          branch = process.env.TRAVIS_BRANCH;
        }
        break;
    }

    let test: string|RegExp;
    return ['development', 'staging', 'production'].reduce((previous, next) => {
      if (properties.options.environments[next].enabled && this.isEnvironmentBranch(branch, properties.options.environments[next].branch)) {
        return properties.options.environments[next].suffix;
      } else {
        return previous;
      }
    });
  }

  private isEnvironmentBranch(current: string, required: string|RegExp): boolean {
    if (typeof required === 'string') {
      return current === required;
    } else {
      return required.test(current);
    }
  }

}