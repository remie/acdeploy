'use strict';

// ------------------------------------------------------------------------------------------ Dependencies

import { ProjectProperties, BuildPack } from '../Interfaces';
import AbstractBuildPack from './AbstractBuildPack';

// ------------------------------------------------------------------------------------------ Class

export default class NodeJS extends AbstractBuildPack {

  get image() {
    return 'node';
  }

  get tag() {
    return '8';
  }

  get body() {
    return '';
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
