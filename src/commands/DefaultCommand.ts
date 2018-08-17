'use strict';

import { EnvironmentOptions } from '../Interfaces';
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

    // Start deployment of this project
    const environment = await this.getEnvironment();
    const docker: Docker = new Docker(environment);
    await docker.build();
    await docker.push();
    await new AWS(environment).deploy();
    this.log.info(`Successfully deployed ${properties.options.name} 🏆`);
  }

  showHelp() {
    Utils.showHelp();
  }

  private async getEnvironment(): Promise<EnvironmentOptions> {
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
    const environments: Array<EnvironmentOptions> = Object.keys(properties.options.environments).map((name: string) => properties.options.environments[name]);
    return environments.reduce((selected: EnvironmentOptions, environment: EnvironmentOptions) => {
      if (environment.enabled && this.isEnvironmentBranch(branch, environment.branch)) {
        return environment;
      } else {
        return selected;
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