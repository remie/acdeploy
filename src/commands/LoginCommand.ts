'use strict';

import * as fs from 'fs-extra';
import * as ini from 'ini';
import slugify from 'slugify';
import AbstractCommand from './AbstractCommand';
import DefaultCommand from './DefaultCommand';
import { ProjectProperties, CommandLineArgs } from '../Interfaces';
import { Utils } from '../lib';

export default class LoginCommand extends AbstractCommand {

  protected get requiredArguments(): Array<string> {
    return ['aws_access_key_id', 'aws_secret_access_key'];
  }

  async run(args: CommandLineArgs): Promise<void> {

    // Also support AWS credentials from environment variables
    args.aws_access_key_id = args.aws_access_key_id || process.env.AWS_ACCESS_KEY_ID;
    args.aws_secret_access_key = args.aws_secret_access_key || process.env.AWS_SECRET_ACCESS_KEY;

    // Check for required parameters & turn them into properties
    this.validate(args);
    const properties = Utils.getProjectProperties(args);

    // Make sure that we have all required options available
    if (!properties.options.name) {
      this.log.warn('It looks like ACDeploy has not yet been enabled for this project. Please run `acdeploy init` first');
      process.exit(-1);
    }

    const configFilePath = `${process.env.HOME}/.aws/credentials`;
    await fs.ensureFile(configFilePath);

    const config = ini.parse(await fs.readFile(configFilePath, 'utf-8'));
    config[properties.options.aws.profile] = {
      aws_access_key_id: args.aws_access_key_id,
      aws_secret_access_key: args.aws_secret_access_key
    };

    await fs.writeFile(configFilePath, ini.stringify(config), 'utf-8');
  }

  showHelp() {
    Utils.showHelp('init', this.commandHelp);
  }

  private commandHelp() {
    console.log('Supported options:');
    console.log('--aws_access_key_id\tThe Amazon Web Services API access key');
    console.log('--aws_secret_access_key\TThe Amazon Web Services API access secret');
    console.log();
  }

}

