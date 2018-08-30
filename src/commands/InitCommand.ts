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

    // Generate CI config file
    Utils.getCI().create();

    // Generate YML file
    Utils.toYAML(properties);

    // Inform the user of our progress
    this.log.info(`ACDeploy is now enabled for ${properties.options.name}`);
    this.log.info(`I've added config files for ACDeploy and ${properties.options.ci.name} to your project. You SHOULD commit these files to source control.`);
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
        name: 'options.ci.name',
        message: `Pick your Continuous Integration server`,
        choices: [ 'Travis' ],
        when: (answers) => !defaults.options.ci,
      }
    ];
  }

  showHelp() {
    Utils.showHelp('init', () => {});
  }

}

