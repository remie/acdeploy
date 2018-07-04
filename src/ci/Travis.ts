'use strict';

// ------------------------------------------------------------------------------------------ Dependencies

import { ProjectProperties, CI } from '../Interfaces';
import * as fs from 'fs';
import * as path from 'path';

// ------------------------------------------------------------------------------------------ Class

export default class Travis implements CI {

  private log;

  constructor(logger) {
    this.log = logger;
  }

  create() {
    fs.writeFileSync(path.join(process.cwd(), this.filename), this.yml);
  }

  delete() {
    fs.unlinkSync(path.join(process.cwd(), this.filename));
  }

  private get filename(): string {
    return '.travis.yml';
  }

  private get yml(): string {
  return `
sudo: required
language: node_js
node_js: 8

services:
- docker

before_install:
- sudo apt-get update
- sudo apt-get -y -o Dpkg::Options::="--force-confnew" install docker-ce
- export AWS_ACCESS_KEY_ID=\${AWS_ACCESS_KEY_ID}
- export AWS_SECRET_ACCESS_KEY=\${AWS_SECRET_ACCESS_KEY}
- npm install -g @remie/acdeploy
- acdeploy login

script:
- acdeploy
`;
  }



}
