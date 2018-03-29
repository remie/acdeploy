#!/usr/bin/env node
'use strict';

// ------------------------------------------------------------------------------------------ Dependencies

import { Command } from './Interfaces';
import { Utils, CommandLine } from './lib';

// ------------------------------------------------------------------------------------------ Variables

const log = Utils.getLogger();
const cli: CommandLine = new CommandLine();
const command: Command = Utils.getCommand(cli);

// ------------------------------------------------------------------------------------------ Main applications

if (cli.args.help) {
  command.showHelp();
} else {
  command.run(cli.args);
}
