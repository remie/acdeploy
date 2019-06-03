'use strict';

import { AbstractCommand } from './AbstractCommand';
import { Utils } from '../lib/Utils';
import * as fs from 'fs';
import * as path from 'path';

export class ClearCommand extends AbstractCommand {

  async run(): Promise<void> {

    // Check for required parameters & turn them into properties
    const properties = await this.getProperties();

    // Remove the CI config file
    Utils.getCI().delete();

    // Remove YML file
    if (properties.ymlFile) {
      fs.unlinkSync(properties.ymlFile);
    }

    // Remove Dockerfile
    if (fs.existsSync(path.join(properties.basedir, 'Dockerfile'))) {
      fs.unlinkSync(path.join(properties.basedir, 'Dockerfile'));
    }

    // Remove Dockerignore
    if (fs.existsSync(path.join(properties.basedir, '.dockerignore'))) {
      fs.unlinkSync(path.join(properties.basedir, '.dockerignore'));
    }

    // Inform the user of our progress
    this.log.info(`ACDeploy is now completely removed for ${properties.options.name}`);
    return Promise.resolve();
  }

  showHelp() {
    Utils.showHelp('delete', () => {});
  }

}

