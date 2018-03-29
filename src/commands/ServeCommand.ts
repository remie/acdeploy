'use strict';

import AbstractCommand from './AbstractCommand';
import { ProjectProperties, CommandLineArgs } from '../Interfaces';
import { Utils, Docker } from '../lib';

export default class ServeCommand extends AbstractCommand {

  protected get requiredArguments(): Array<string> {
    return [];
  }

  run(args: CommandLineArgs): Promise<void> {
    // Check for required parameters & turn them into properties
    this.validate(args);
    const properties = Utils.getProjectProperties(args);

    // Initialize Docker
    const docker: Docker = new Docker(properties);

    // Execute docker build/run command
    return docker.build(false).then(() => docker.run()).catch(error => {
      this.log.error('That didn\'t go well... not well at all. You should look at this error log.', error);
      process.exit(-1);
    });
  }

  showHelp() {
    Utils.showHelp('serve', () => {});
  }

}