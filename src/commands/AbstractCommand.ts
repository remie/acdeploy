'use strict';

import { Utils } from '../lib/Utils';
import { Command, ProjectProperties, CommandLineArgs } from '../interfaces';
import * as bunyan from 'bunyan';
import * as inquirer from 'inquirer';
import * as merge from 'lodash.merge';

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

  showHelp() {
    Utils.showHelp();
  }

}