#!/usr/bin/env node
'use strict';

// ------------------------------------------------------------------------------------------ Dependencies

import { load } from '@gdn/envify-nconf';
load(process.cwd());

import { Command } from './Interfaces';
import { Utils, CommandLine } from './lib';
const pkg = require('../package.json');

// ------------------------------------------------------------------------------------------ Variables

const log = Utils.getLogger();
const cli: CommandLine = new CommandLine();
const command: Command = Utils.getCommand(cli);

// ------------------------------------------------------------------------------------------ Main applications

if (cli.args.help) {
  command.showHelp();
} else if (cli.args.version) {
  console.log(`ACDeploy version ${pkg.version}`);
} else {
  command.run(cli.args).catch((error) => {
    log.error('Oh my, something went really wrong here. Please check the error message 👇');
    console.error(error);
    process.exit(-1);
  });
}
