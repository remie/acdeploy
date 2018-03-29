'use strict';

import AbstractCommand from './AbstractCommand';
import { CommandLineArgs } from '../Interfaces';
import { Utils, AWS, Docker } from '../lib';

export default class DefaultCommand extends AbstractCommand {

  protected get requiredArguments(): Array<string> {
    return [];
  }

  run(args: CommandLineArgs): Promise<void> {
    // Check for required parameters & turn them into properties
    this.validate(args);
    const properties = Utils.getProjectProperties(args);

    // Make sure that we have all required options available
    if (!properties.options.name) {
      this.log.warn('It looks like ACDeploy has not yet been enabled for this project. Please run `acdeploy init` first');
      process.exit(-1);
    }

    // Initialize AWS & Docker
    const aws: AWS = new AWS(properties);
    const docker: Docker = new Docker(properties);

    // Start deployment of this project
    this.log.info(`Starting deployment of ${properties.options.name} 🤞`);
    return docker.build()
      .then(() => docker.push())
      .then(() => aws.updateOrCreateService())
      .then(() => { this.log.info(`Successfully deployed ${properties.options.name} 🏆`); })
      .catch(error => { this.log.error(error); });
  }

  showHelp() {
    Utils.showHelp();
  }

}