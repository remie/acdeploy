'use strict';

import * as fs from 'fs-extra';
import * as ini from 'ini';
import AbstractCommand from './AbstractCommand';
import { CommandLineArgs } from '../Interfaces';
import { Utils, AWS, Docker } from '../lib';

export default class DefaultCommand extends AbstractCommand {

  protected get requiredArguments(): Array<string> {
    return [];
  }

  async run(args: CommandLineArgs): Promise<void> {

    // Check for required parameters & turn them into properties
    this.validate(args);
    const properties = Utils.getProjectProperties(args);

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
      if (!credentials[properties.options.aws.profile]) throw new Error('AWS credentials missing');
    } catch (error) {
      this.log.warn('It looks like ACDeploy has not yet been authorized to deploy this application. Please run `acdeploy login` first');
      process.exit(-1);
    }

    // Initialize AWS & Docker
    const aws: AWS = new AWS(properties);
    const docker: Docker = new Docker(properties);

    // Start deployment of this project
    await docker.build();
    await docker.push();
    await aws.updateOrCreateService();
    this.log.info(`Successfully deployed ${properties.options.name} 🏆`);
  }

  showHelp() {
    Utils.showHelp();
  }

}