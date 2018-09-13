'use strict';

// ------------------------------------------------------------------------------------------ Dependencies

import { ProjectProperties, CI } from '../Interfaces';
import { Utils } from '../lib/Utils';
import * as fs from 'fs';
import * as path from 'path';
import * as yamljs from 'yamljs';

import { PHPBuildPack, MavenBuildPack, NodeJSBuildPack } from '../buildpacks';

// ------------------------------------------------------------------------------------------ Class

export class Travis implements CI {

  private log;
  private jobs: any;

  constructor(jobs?: Array<any>) {
    this.log = Utils.getLogger();
    this.jobs = jobs || [];
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

  private get language(): string {
    if (Utils.properties.options.buildPack instanceof MavenBuildPack) {
      return 'java';
    } else if (Utils.properties.options.buildPack instanceof PHPBuildPack) {
      return 'php';
    } else if (Utils.properties.options.buildPack instanceof NodeJSBuildPack) {
      return 'node_js';
    }
  }

  private get yml(): string {
    let jobs: string = '';
    this.jobs.forEach((job) => {
      let yml = yamljs.stringify(this.jobs, 4, 2) + '\n';
      yml = yml.split('\n').slice(1).join('\n    ');
      jobs += '- ' + yml.trim();
    });

  return `
sudo: required
language: ${this.language}

jobs:
  include:
    ${jobs}
    - stage: deploy
      node_js: 8
      services:
        - docker
      script:
        - sudo apt-get update
        - sudo apt-get -y -o Dpkg::Options::="--force-confnew" install docker-ce
        - export AWS_ACCESS_KEY_ID=\${AWS_ACCESS_KEY_ID}
        - export AWS_SECRET_ACCESS_KEY=\${AWS_SECRET_ACCESS_KEY}
        - npm install -g @remie/acdeploy
        - acdeploy login
        - acdeploy
`;
  }



}
