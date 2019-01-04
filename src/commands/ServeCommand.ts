'use strict';

import { AbstractCommand } from './AbstractCommand';
import { ProjectProperties, ServeProperties, EnvironmentOptions } from '../Interfaces';
import { Utils } from '../lib/Utils';
import { Docker } from '../lib/Docker';
import * as inquirer from 'inquirer';

export class ServeCommand extends AbstractCommand {

  async run(): Promise<void> {
    try {
      const properties: ProjectProperties & ServeProperties = await this.getProperties();
      const environment = properties.options.environments[properties.environment];
      const docker: Docker = new Docker(environment);
      await docker.build(false);
      await docker.run();
    } catch (error) {
      this.log.error('That didn\'t go well... not well at all. You should look at this error log 👉', error);
      process.exit(-1);
    }
  }

  protected async questions(defaults: ProjectProperties): Promise<inquirer.Questions> {
    const args = Utils.getArgs();
    const properties = Utils.properties;

    if (!properties.options.environments || Object.keys(properties.options.environments).length <= 0) {
      return [];
    }

    return [
      {
        type: 'list',
        name: 'environment',
        message: `Please choose the environment configuration to apply`,
        choices: Object.keys(properties.options.environments),
        when: (answers) => {
          if (!args.environment && !process.env.ACDEPLOY_ENVIRONMENT) return true;
          if (process.env.ACDEPLOY_ENVIRONMENT) answers.environment = process.env.ACDEPLOY_ENVIRONMENT;
          if (args.environment) answers.environment = args.environment;
          return false;
        }
      }
    ];
  }

  showHelp() {
    Utils.showHelp('serve', this.commandHelp);
  }

  private commandHelp() {
    console.log('Supported options:');
    console.log('--environment\tThe environment configuration to apply');
    console.log();
  }


}