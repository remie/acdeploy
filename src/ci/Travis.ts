'use strict';

// ------------------------------------------------------------------------------------------ Dependencies

import { ProjectProperties, CI } from '../Interfaces';
import { Utils } from '../lib/Utils';
import * as fs from 'fs';
import * as path from 'path';
import * as yamljs from 'yamljs';

// ------------------------------------------------------------------------------------------ Class

export class Travis implements CI {

  private log;
  private commands: any;

  constructor(commands?: any) {
    this.log = Utils.getLogger();
    this.commands = commands || {};
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

    const custom: string = yamljs.stringify(this.commands, 10);

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

${custom}

deploy:
- provider: script
  script: acdeploy
`;
  }



}
