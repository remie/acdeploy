'use strict';

// ------------------------------------------------------------------------------------------ Dependencies

import * as path from 'path';
import { ProjectProperties, BuildPack } from '../Interfaces';
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
      const maxVersion = semver.maxSatisfying([ '6.0.0', '7.0.0', '8.0.0', '9.0.0', '10.0.0', '11.0.0' ], pkg.engines.node) || `${version}.0.0`;
      version = semver.major(maxVersion);
    }
    return version.toString();
  }

  get body() {
    return `

WORKDIR /opt
COPY ./package.json package.json
COPY ./package-lock.json package-lock.json
RUN npm install

COPY . ./
RUN npm run postinstall
    `;
  }

  get command() {
    return 'CMD ["npm", "start"]';
  }

  toString(): string {
    return NodeJS.toString();
  }

  static toString(): string {
    return 'NodeJS';
  }

}
