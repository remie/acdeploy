'use strict';

import { AbstractCommand } from './AbstractCommand';
import { ProjectProperties } from '../Interfaces';
import { Utils } from '../lib/Utils';
import * as fs from 'fs-extra';
import * as path from 'path';

export class ClearCommand extends AbstractCommand {

  async run(): Promise<void> {

    // Check for required parameters & turn them into properties
    const properties = await this.getProperties();

    // Remove the CI config file
    Utils.getCI().delete();

    // Remove YML file
    if (properties.ymlFile) {
      await fs.unlink(properties.ymlFile);
    }

    // Remove Dockerfile
    if (await fs.exists(path.join(properties.basedir, 'Dockerfile'))) {
      await fs.unlink(path.join(properties.basedir, 'Dockerfile'));
    }

    // Remove Dockerignore
    if (await fs.exists(path.join(properties.basedir, '.dockerignore'))) {
      await fs.unlink(path.join(properties.basedir, '.dockerignore'));
    }

    // Inform the user of our progress
    this.log.info(`ACDeploy is now completely removed for ${properties.options.name}`);
    return Promise.resolve();
  }

  showHelp() {
    Utils.showHelp('delete', () => {});
  }

}

