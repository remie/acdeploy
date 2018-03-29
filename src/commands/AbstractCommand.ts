'use strict';

import { Utils, CommandLine } from '../lib';
import { Command, ProjectProperties, CommandLineArgs } from '../interfaces';
import * as bunyan from 'bunyan';

export default abstract class AbstractCommand implements Command {

  protected cli: CommandLine;
  protected log: bunyan;

  constructor(cli: CommandLine) {
    this.cli = cli;
    this.log = Utils.getLogger();
  }

  abstract run(args: CommandLineArgs): Promise<void>;
  abstract showHelp();

  validate(args: CommandLineArgs) {
    const missingArguments = this.requiredArguments.filter((arg: string) => !args[arg]);
    if (missingArguments.length > 0) {
      console.log(`${missingArguments[0]} is a required parameter`);
      this.showHelp();
    }
  }

  protected abstract get requiredArguments(): Array<string>;

}