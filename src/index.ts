#!/usr/bin/env node
'use strict';

// ------------------------------------------------------------------------------------------ Dependencies

require('@gdn/envify-nconf').load(process.cwd());
import { Command, CommandLineArgs } from './Interfaces';
import { Utils } from './lib/Utils';

// ------------------------------------------------------------------------------------------ Variables

const log = Utils.getLogger();
const command: Command = Utils.getCommand();
const args: CommandLineArgs = Utils.getArgs();

// ------------------------------------------------------------------------------------------ Main applications

if (args.help) {
  command.showHelp();
} else if (args.version) {
  const pkg = require('../package.json');
  console.log(`ACDeploy version ${pkg.version}`);
} else {
  command.run(args).catch((error) => {
    log.error('Oh my, something went really wrong here. Please check the error message 👇');
    console.error(error);
    process.exit(-1);
  });
}
