'use strict';

// ------------------------------------------------------------------------------------------ Dependencies

import * as fs from 'fs';
import * as path from 'path';
import { Utils } from '../lib/Utils';
import AbstractBuildPack from './AbstractBuildPack';
import * as semver from 'semver';

// ------------------------------------------------------------------------------------------ Class

export default class NodeJS extends AbstractBuildPack {

  get image() {
    return 'node';
  }

  get tag() {
    let version = 8;
    const pkg = require(path.join(process.cwd(), 'package.json'));
    if (pkg.engines && pkg.engines.node) {
      version = semver.major(semver.coerce(pkg.engines.node));
    }
    return version.toString();
  }

  get hasPostInstall(): boolean {
    const pkg = require(path.join(process.cwd(), 'package.json'));
    return (pkg.scripts && pkg.scripts.postinstall);
  }

  get isYarn(): boolean {
    return fs.existsSync(path.join(process.cwd(), 'yarn.lock'));
  }

  get isMeteor(): boolean {
    return fs.existsSync(path.join(process.cwd(), '.meteor'));
  }

  get hasNpmToken(): boolean {
    return (Utils.properties.options.docker
      && Utils.properties.options.docker.buildArgs
      && Utils.properties.options.docker.buildArgs.filter((arg) => arg.name === 'NPM_TOKEN').length > 0);
  }

  get body() {
    let body = '';

    if (this.isMeteor) {
      body += `
ENV METEOR_ALLOW_SUPERUSER=true
ENV TOOL_NODE_FLAGS=--max-old-space-size=2048

## Install prerequisites
RUN apt-get update -y; \
  apt-get install -y \
  curl;

## Install Meteor
RUN curl https://install.meteor.com | /bin/sh

`;
    } else if (this.isYarn) {
      body += `
RUN npm install -g yarn;
`;
    }

    body += `
WORKDIR /opt
COPY ./package.json package.json
`;

    if (this.isYarn) {
      body += `COPY ./yarn.lock yarn.lock`;
    } else {
      body += `COPY ./package-lock.json package-lock.json`;
    }

    if (this.hasNpmToken) {
      body += `
RUN echo "//registry.npmjs.org/:_authToken=\$\{NPM_TOKEN\}" > .npmrc
`;
    }

    if (this.isMeteor) {
      body += `
RUN meteor npm install
`;
    } else if (this.isYarn) {
      body += `
RUN yarn install
`;
    } else {
      body += `
RUN npm install
`;
    }

    body += `
COPY . ./
`;

    if (this.hasPostInstall) {
      body += `
RUN npm run postinstall
`;
    }

    return body;
  }

  get dockerignore() {
    return `
node_modules
.npmrc
`;
  }

  get command() {
    if (this.isMeteor) {
      return 'CMD ["meteor", "run", "--production"]';
    }
    return 'CMD ["npm", "start"]';
  }

  toString(): string {
    return NodeJS.toString();
  }

  static toString(): string {
    return 'NodeJS';
  }

}
