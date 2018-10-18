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

  constructor() {
    this.log = Utils.getLogger();
  }

  create() {
    fs.writeFileSync(path.join(process.cwd(), this.filename), this.yml);
  }

  delete() {
    fs.unlinkSync(path.join(process.cwd(), this.filename));
  }

  private get predeployStages() {
    let result = '';
    const stages = Utils.properties.options.ci.predeploy || [];
    stages.forEach((stage) => {
      let yml = yamljs.stringify(stage, 4, 2) + '\n';
      const firstline = yml.split('\n')[0];
      result += `- ${firstline}\n`;
      yml = yml.split('\n').slice(1).join('\n      ');
      result += '      ' + yml.trim();
    });
    return result;
  }

  private get postdeployStages() {
    let result = '';
    const stages = Utils.properties.options.ci.postdeploy || [];
    stages.forEach((stage) => {
      let yml = yamljs.stringify(stage, 4, 2) + '\n';
      const firstline = yml.split('\n')[0];
      result += `- ${firstline}\n`;
      yml = yml.split('\n').slice(1).join('\n      ');
      result += '      ' + yml.trim();
    });
    return result;
  }

  private get filename(): string {
    return '.travis.yml';
  }

  private get yml(): string {

  return `
language: minimal

jobs:
  include:
    ${this.predeployStages}
    - stage: deploy
      node_js: 8
      services:
        - docker
      script:
        - sudo apt-get update
        - wget -qO- https://deb.nodesource.com/setup_8.x | sudo -E bash -
        - sudo apt-get -y -o Dpkg::Options::="--force-confnew" install docker-ce nodejs
        - export AWS_ACCESS_KEY_ID=\${AWS_ACCESS_KEY_ID}
        - export AWS_SECRET_ACCESS_KEY=\${AWS_SECRET_ACCESS_KEY}
        - sudo npm install -g @remie/acdeploy
        - sudo acdeploy login
        - sudo acdeploy
    ${this.postdeployStages}
`;
  }



}
