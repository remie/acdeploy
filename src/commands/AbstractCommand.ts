'use strict';

import { Utils } from '../lib/Utils';
import { Command, ProjectProperties, EnvironmentOptions } from '../Interfaces';
import * as bunyan from 'bunyan';
import * as inquirer from 'inquirer';
import merge from 'lodash.merge';

export abstract class AbstractCommand implements Command {

  protected log: bunyan;

  constructor() {
    this.log = Utils.getLogger();
  }

  abstract async run(): Promise<void>;

  protected async getProperties(): Promise<ProjectProperties> {
    const answers = await inquirer.prompt(await this.questions(Utils.properties));
    Utils.properties = merge(Utils.properties, answers);
    return Utils.properties;
  }

  protected async questions(defaults: ProjectProperties): Promise<inquirer.Questions> {
    return [];
  }

  protected async getEnvironments(): Promise<Array<EnvironmentOptions>> {
    const properties = await this.getProperties();

    let branch: string;
    switch (properties.options.ci.name.toLowerCase()) {
      case 'travis':
        if (process.env.TRAVIS_PULL_REQUEST_BRANCH !== undefined && process.env.TRAVIS_PULL_REQUEST_BRANCH !== '') {
          branch = process.env.TRAVIS_PULL_REQUEST_BRANCH;
        } else {
          branch = process.env.TRAVIS_BRANCH;
        }
        break;
      case 'circleci':
        branch = process.env.CIRCLE_BRANCH;
        break;
    }

    const environments: Array<EnvironmentOptions> = Object.keys(properties.options.environments).map((name: string) => properties.options.environments[name]);
    return environments.filter((environment) => environment.enabled && this.isEnvironmentBranch(branch, environment.branch));
  }

  private isEnvironmentBranch(current: string, required: string|RegExp): boolean {
    if (typeof required === 'string') {
      return current === required;
    } else {
      return required.test(current);
    }
  }

  showHelp() {
    Utils.showHelp();
  }

}