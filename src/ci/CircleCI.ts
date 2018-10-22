'use strict';

// ------------------------------------------------------------------------------------------ Dependencies

import { ProjectProperties, CI } from '../Interfaces';
import { Utils } from '../lib/Utils';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as yamljs from 'yamljs';

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

  private get filename(): string {
    return '.circleci/config.yml';
  }

  private get yml(): string {

  return `
version: 2
jobs:
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
            sudo acdeploy login --aws_access_key_id \$AWS_ACCESS_KEY_ID --aws_secret_access_key \$AWS_SECRET_ACCESS_KEY
            sudo acdeploy
`;
  }



}
