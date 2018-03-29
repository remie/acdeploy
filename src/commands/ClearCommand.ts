'use strict';

import * as fs from 'fs';
import * as path from 'path';
import AbstractCommand from './AbstractCommand';
import DefaultCommand from './DefaultCommand';
import { ProjectProperties, CommandLineArgs } from '../Interfaces';
import { Utils } from '../lib';

export default class ClearCommand extends AbstractCommand {

  protected get requiredArguments(): Array<string> {
    return [];
  }

  run(args: CommandLineArgs): Promise<void> {

    // Check for required parameters & turn them into properties
    this.validate(args);
    const properties = Utils.getProjectProperties(args);

    // Remove the CI config file
    const CI = Utils.getCI(properties.options.ci);
    CI.delete();

    // Remove YML file
    if (properties.ymlFile) {
      fs.unlinkSync(properties.ymlFile);
    }

    // Remove Dockerfile
    if (fs.existsSync(path.join(process.cwd(), 'Dockerfile'))) {
      fs.unlinkSync(path.join(process.cwd(), 'Dockerfile'));
    }

    // Inform the user of our progress
    this.log.info(`ACDeploy is now completely removed for ${properties.options.name}`);
    return Promise.resolve();
  }

  showHelp() {
    Utils.showHelp('delete', () => {});
  }

}

