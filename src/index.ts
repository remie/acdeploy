#!/usr/bin/env node
'use strict';

// ------------------------------------------------------------------------------------------ Dependencies

import { Utils, Docker } from './lib';
import * as fs from 'fs';
import * as path from 'path';
import * as bunyan from 'bunyan';
import * as logFormatter from 'bunyan-format';
import { Docker as DockerClient, Options as DockerOptions } from 'docker-cli-js';

// ------------------------------------------------------------------------------------------ Variables

const client = new DockerClient();

const log = bunyan.createLogger({
  name: 'acdeploy',
  stream: logFormatter({ outputMode: 'short' }),
  level: 'info'
});

// ------------------------------------------------------------------------------------------ Main applications

Utils.getProjectProperties().then(properties => {

  let dockerfile;

  if (properties.isMaven) {
    log.info('This is a Java/Maven project');
    dockerfile = new Docker('maven').toDockerfile();

  } else if (properties.isNodeJS) {
    log.info('This is a NodeJS project');
    dockerfile = new Docker('nodejs').toDockerfile();

  } else if (properties.isPHP) {
    log.info('This is a PHP project');
    dockerfile = new Docker('php').toDockerfile();

  } else {
    log.error('Failed to identify project');
    process.exit(-1);
  }

  // Write Dockerfile to disk
  fs.writeFileSync(path.join(properties.basedir, 'Dockerfile'), dockerfile);

  // Build the docker file
  log.info('Building docker image');
  client.command('build -t test .').then(data => {
    // We are ready here
    log.info('Done!');
  }).catch(error => {
    log.error(error);
  });

});
