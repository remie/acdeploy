'use strict';

import AbstractCommand from './AbstractCommand';
import DefaultCommand from './DefaultCommand';
import { ProjectProperties, CommandLineArgs } from '../Interfaces';
import { Utils } from '../lib';

export default class InitCommand extends AbstractCommand {

  protected get requiredArguments(): Array<string> {
    return ['name'];
  }

  run(args: CommandLineArgs): Promise<void> {

    // Check for required parameters & turn them into properties
    this.validate(args);
    const properties = Utils.getProjectProperties(args);

    // Save the name to the properties
    properties.options.name = (typeof args.name === 'string') ? args.name : null;
    properties.options.ci = (typeof args.ci === 'string') ? args.ci : 'Travis';

    // Generate CI config file
    const CI = Utils.getCI(properties.options.ci);
    CI.create();

    // Generate YML file
    Utils.toYAML(properties);

    // Inform the user of our progress
    this.log.info(`ACDeploy is now enabled for ${properties.options.name}`);
    this.log.info(`I've added config files for ACDeploy and ${properties.options.ci} to your project. You SHOULD commit these files to source control.`);
    return Promise.resolve();
  }

  showHelp() {
    Utils.showHelp('init', this.commandHelp);
  }

  private commandHelp() {
    console.log('Supported options:');
    console.log('--name\tThe project name (will also be used as Docker image name)');
    console.log('--ci\tThe CI tool used for build/deploy');
    console.log();
    console.log('Currently supported values for --ci: \'travis\'');
  }

}

