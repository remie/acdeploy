'use strict';

// ------------------------------------------------------------------------------------------ Dependencies

import { ProjectProperties, CommandLineArgs } from '../Interfaces';
import * as minimist from 'minimist';

// ------------------------------------------------------------------------------------------ Variables

// ------------------------------------------------------------------------------------------ Class

export default class CommandLine {

  private _args: CommandLineArgs;
  private _commands: Array<string>;

  constructor() {
    const args = minimist(process.argv.slice(2));
    this._commands = args._.slice();

    delete args._;
    this._args = Object.assign({}, args);
  }

  get commands() {
    return this._commands;
  }

  get args() {
    return this._args;
  }

}
