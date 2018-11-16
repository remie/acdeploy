'use strict';

// ------------------------------------------------------------------------------------------ Dependencies

import { ProjectProperties, CI } from '../Interfaces';
import { Utils } from '../lib/Utils';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as yamljs from 'json-to-pretty-yaml';

import { PHPBuildPack, MavenBuildPack, NodeJSBuildPack } from '../buildpacks';

// ------------------------------------------------------------------------------------------ Class

export class CircleCI implements CI {

  private log;

  constructor() {
    this.log = Utils.getLogger();
  }

  create() {
    fs.ensureFileSync(path.join(process.cwd(), this.filename));
    fs.writeFileSync(path.join(process.cwd(), this.filename), this.yml);
  }

  delete() {
    fs.unlinkSync(path.join(process.cwd(), this.filename));
  }

  private get predeployStages() {
    if (Utils.properties.options.ci.predeploy) {
      const stages = Utils.properties.options.ci.predeploy || [];
      const result = yamljs.stringify({
        json: Utils.properties.options.ci.predeploy
      });
      return result.split('\n').slice(1).join('\n');
    }
    return '';
  }

  private get postdeployStages() {
    if (Utils.properties.options.ci.postdeploy) {
      const stages = Utils.properties.options.ci.postdeploy || [];
      const result = yamljs.stringify({
        json: Utils.properties.options.ci.postdeploy
      });
      return result.split('\n').slice(1).join('\n');
    }
    return '';
  }

  private get workflow(): string {
    const steps = [];

    if (Utils.properties.options.ci.predeploy) {
      Object.keys(Utils.properties.options.ci.predeploy).forEach((job, index) => {
        if (index > 0) {
          const entry = {};
          entry[job] = {
            requires: [
              Object.keys(Utils.properties.options.ci.predeploy)[index - 1]
            ]
          };
          steps.push(entry);
        } else {
          steps.push(job);
        }
      });

      steps.push({
        build: {
          requires: Object.keys(Utils.properties.options.ci.predeploy)
        }
      });
    } else {
      steps.push('build');
    }

    if (Utils.properties.options.ci.postdeploy) {
      Object.keys(Utils.properties.options.ci.predeploy).forEach((job, index) => {
        const entry = {};
        if (index > 0) {
          entry[job] = {
            requires: [
              Object.keys(Utils.properties.options.ci.predeploy)[index - 1]
            ]
          };
        } else {
          entry[job] = {
            requires: [ 'build' ]
          };
        }
        steps.push(entry);
      });
    }

    const result = yamljs.stringify({
      workflows: {
        acdeploy: {
          jobs: steps
        }
      }
    });
    return result.split('\n').slice(3).join('\n').trim();
  }

  private get filename(): string {
    return '.circleci/config.yml';
  }

  private get yml(): string {

  return `
version: 2
jobs:
${this.predeployStages}

  build:

    docker:
      - image: circleci/node:8

    steps:
      - checkout
      - setup_remote_docker

      - run:
          name: Install Docker client
          command: |
            set -x
            VER="18.06.1-ce"
            sudo curl -L -o /tmp/docker-\$VER.tgz https://download.docker.com/linux/static/stable/x86_64/docker-\$VER.tgz
            sudo tar -xz -C /tmp -f /tmp/docker-\$VER.tgz
            sudo mv /tmp/docker/* /usr/bin

      - run:
          command: |
            sudo npm install -g @remie/acdeploy
            acdeploy login --aws_access_key_id \$AWS_ACCESS_KEY_ID --aws_secret_access_key \$AWS_SECRET_ACCESS_KEY
            acdeploy

${this.postdeployStages}

workflows:
  version: 2
  acdeploy:
    jobs:
      ${this.workflow}
`;
  }



}
