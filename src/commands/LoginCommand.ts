'use strict';

import { AbstractCommand } from './AbstractCommand';
import { ProjectProperties, AWSCredentials } from '../Interfaces';
import { Utils } from '../lib/Utils';
import * as fs from 'fs-extra';
import * as ini from 'ini';
import * as inquirer from 'inquirer';

export class LoginCommand extends AbstractCommand {

  async run(): Promise<void> {
    const properties: ProjectProperties & AWSCredentials = await this.getProperties();
    await this.setCredentials({
      aws_access_key_id: properties.aws_access_key_id,
      aws_secret_access_key: properties.aws_secret_access_key
    });
  }

  protected async questions(defaults: ProjectProperties): Promise<inquirer.Questions> {
    const args = Utils.getArgs();
    const config = await this.getCredentials();
    const properties = Utils.properties;
    const profile = properties.options.aws && properties.options.aws.profile ? properties.options.aws.profile : properties.options.name;
    config[profile] = config[profile] || {};

    return [
      {
        type: 'password',
        name: 'aws_access_key_id',
        message: `AWS Access Key ID`,
        when: (answers) => {
          if (!args.aws_access_key_id  && !config[profile].aws_access_key_id && !process.env.AWS_ACCESS_KEY_ID) return true;
          if (config[profile].aws_access_key_id) answers.aws_access_key_id = config[profile].aws_access_key_id;
          if (process.env.AWS_SECRET_ACCESS_KEY) answers.aws_access_key_id = process.env.AWS_SECRET_ACCESS_KEY;
          if (args.aws_access_key_id) answers.aws_access_key_id = args.aws_access_key_id;
          return false;
        }
      },
      {
        type: 'password',
        name: 'aws_secret_access_key',
        message: `AWS Secret Access Key`,
        when: (answers) => {
          if (!args.aws_secret_access_key && !config[profile].aws_secret_access_key && !process.env.AWS_SECRET_ACCESS_KEY) return true;
          if (config[profile].aws_secret_access_key) answers.aws_secret_access_key = config[profile].aws_secret_access_key;
          if (process.env.AWS_SECRET_ACCESS_KEY) answers.aws_secret_access_key = process.env.AWS_SECRET_ACCESS_KEY;
          if (args.aws_secret_access_key) answers.aws_secret_access_key = args.aws_secret_access_key;
          return false;
        }
      }
    ];
  }

  showHelp() {
    Utils.showHelp('login', this.commandHelp);
  }

  private async getCredentials() {
    const configFilePath = `${process.env.HOME}/.aws/credentials`;
    await fs.ensureFile(configFilePath);

    const config = ini.parse(await fs.readFile(configFilePath, 'utf-8'));
    return config;
  }

  private async setCredentials(credentials: AWSCredentials) {
    const configFilePath = `${process.env.HOME}/.aws/credentials`;
    await fs.ensureFile(configFilePath);

    const properties = Utils.properties;
    const profile = properties.options.aws && properties.options.aws.profile ? properties.options.aws.profile : properties.options.name;
    const config = await this.getCredentials();

    config[profile] = credentials;
    await fs.writeFile(configFilePath, ini.stringify(config), 'utf-8');
  }

  private commandHelp() {
    console.log('Supported options:');
    console.log('--aws_access_key_id\tThe Amazon Web Services API access key');
    console.log('--aws_secret_access_key\TThe Amazon Web Services API access secret');
    console.log();
  }

}

