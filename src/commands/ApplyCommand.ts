'use strict';

import { AbstractCommand } from './AbstractCommand';
import { ProjectProperties } from '../Interfaces';
import { Utils } from '../lib/Utils';
import { AWS } from '../lib/AWS';
import * as inquirer from 'inquirer';

export class ApplyCommand extends AbstractCommand {

  async run(): Promise<void> {
    // Make sure to save the properties to persist answers
    const properties = await this.getProperties();

    this.log.info(`Creating Amazon Web Services infrastructure for ${properties.options.name} 🤞`);
    if (properties.options.environments && Object.keys(properties.options.environments).length > 0) {
      await Object.keys(properties.options.environments).reduce((previousTask, name) => {
        return previousTask.then(async () => {
          const environment = properties.options.environments[name];
          if (environment.enabled) {
            this.log.info(`Provisioning ${name} environment...`);
            await new AWS(environment).apply();
          }
        });
      }, Promise.resolve());
    } else {
      await new AWS().apply();
    }
    this.log.info(`Successfully provisioned AWS infrastructure for ${properties.options.name} 🏆`);
  }

  protected async questions(defaults: ProjectProperties): Promise<inquirer.Questions> {
    const aws = new AWS();

    return [
      {
        type: 'list',
        name: 'options.aws.vpcId',
        message: `Pick the default VPC`,
        suffix: `\n  VPC not in this list? Specify the correct region in 'acdeploy.tml > aws > region'`,
        when: (answers) => !(defaults.options.aws && defaults.options.aws.vpcId),
        choices: async () => {
          const vpcs = await aws.getVPCs();
          return vpcs.map((vpc) => {
            const name = vpc.Tags.reduce((prev: string, next) => {
              if (next.Key === 'Name') return next.Value;
              return prev;
            }, vpc.VpcId);
            return {
              name: name,
              value: vpc.VpcId
            };
          });
        }
      },
      {
        type: 'checkbox',
        name: 'options.aws.ecs.loadbalancer.Subnets',
        message: `Pick the subnets for the application load balancer`,
        when: (answers) => !(defaults.options.aws && defaults.options.aws.ecs && defaults.options.aws.ecs.loadbalancer.Subnets),
        choices: async (answers) => {
          const availableSubnets = await aws.getSubnets(answers.options.aws.vpcId);
          return availableSubnets.map((subnet) => {
            const name = subnet.Tags.reduce((prev: string, next) => {
              if (next.Key === 'Name') return next.Value;
              return prev;
            }, subnet.SubnetId);
            return {
              name: `${name} (${subnet.AvailabilityZone})`,
              value: subnet.SubnetId
            };
          });
        }
      }
    ];
  }

  showHelp() {
    Utils.showHelp();
  }

}