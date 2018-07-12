'use strict';

import { AbstractCommand } from './AbstractCommand';
import { ProjectProperties } from '../Interfaces';
import { Utils } from '../lib/Utils';
import { Docker } from '../lib/Docker';

export class ServeCommand extends AbstractCommand {

  async run(): Promise<void> {
    try {
      const docker: Docker = new Docker();
      await docker.build(false);
      await docker.run();
    } catch (error) {
      this.log.error('That didn\'t go well... not well at all. You should look at this error log 👉', error);
      process.exit(-1);
    }
  }

  showHelp() {
    Utils.showHelp('serve', () => {});
  }

}