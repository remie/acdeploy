'use strict';

import { AbstractCommand } from './AbstractCommand';
import { ProjectProperties, EnvironmentOptions } from '../Interfaces';
import { Utils } from '../lib/Utils';
import { AWS } from '../lib/AWS';
import * as inquirer from 'inquirer';
import * as merge from 'lodash.merge';

export class InitCommand extends AbstractCommand {

  async run(): Promise<void> {

    // Check for required parameters & turn them into properties
    const properties: ProjectProperties = await this.getProperties();

    // @ts-ignore we need to transform the output of the environments questions
    if (properties.environments) {
      // @ts-ignore
      const environments = properties.environments.slice();
      properties.options.environments = properties.options.environments || {};
      properties.options.environments.development = merge(properties.options.environments.development, { enabled: environments.indexOf('development') >= 0 });
      properties.options.environments.staging = merge(properties.options.environments.staging, { enabled: environments.indexOf('staging') >= 0 });
      properties.options.environments.production = merge(properties.options.environments.production, { enabled: environments.indexOf('production') >= 0 });
    }

    // Generate CI config file
    Utils.getCI().create();

    // Generate YML file
    Utils.toYAML(properties);

    // Inform the user of our progress
    this.log.info(`ACDeploy is now enabled for ${properties.options.name}`);
    this.log.info(`I've added config files for ACDeploy and ${properties.options.ci} to your project. You SHOULD commit these files to source control.`);
    return Promise.resolve();
  }

  protected async questions(defaults: ProjectProperties): Promise<inquirer.Questions> {
    return [
      {
        type: 'input',
        name: 'options.name',
        message: `Pick a name for your application`,
        when: (answers) => !defaults.options.name,
      },
      {
        type: 'list',
        name: 'options.ci',
        message: `Pick your Continuous Integration server`,
        choices: [ 'Travis' ],
        when: (answers) => !defaults.options.ci,
      },
      {
        type: 'checkbox',
        name: 'environments',
        message: `Which environments do you want to deploy to AWS?`,
        choices: [
          {
            name: 'Development',
            value: 'development'
          },
          {
            name: 'Staging',
            value: 'staging'
          },
          {
            name: 'Production',
            value: 'production'
          }
        ],
        when: (answers) => !defaults.options.environments,
        filter: (val) => {
          console.log(val);
          return val;
        }
      },
      {
        type: 'input',
        name: 'options.environments.development.suffix',
        message: `Pick the suffix for the development environment`,
        default: 'dev',
        when: (answers) => answers.environments && answers.environments.indexOf('development') >= 0
      },
      {
        type: 'input',
        name: 'options.environments.development.branch',
        message: `Pick the branch from which code should be deployed to development environment (string|regexp|*)`,
        default: '*',
        when: (answers) => answers.environments && answers.environments.indexOf('development') >= 0
      },
      {
        type: 'input',
        name: 'options.environments.staging.suffix',
        message: `Pick the suffix for the staging environment`,
        default: 'staging',
        when: (answers) => answers.environments && answers.environments.indexOf('staging') >= 0
      },
      {
        type: 'input',
        name: 'options.environments.staging.branch',
        message: `Pick the branch from which code should be deployed to staging environment (string|regexp|*)`,
        default: 'develop',
        when: (answers) => answers.environments && answers.environments.indexOf('staging') >= 0
      },
      {
        type: 'input',
        name: 'options.environments.production.branch',
        message: `Pick the branch from which code should be deployed to production environment (string|regexp|*)`,
        default: 'master',
        when: (answers) => answers.environments && answers.environments.indexOf('production') >= 0
      }
    ];
  }

  showHelp() {
    Utils.showHelp('init', () => {});
  }

}

