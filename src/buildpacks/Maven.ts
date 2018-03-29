'use strict';

// ------------------------------------------------------------------------------------------ Dependencies

import { ProjectProperties, BuildPack } from '../Interfaces';
import AbstractBuildPack from './AbstractBuildPack';

// ------------------------------------------------------------------------------------------ Class

export default class Maven extends AbstractBuildPack {

  get image() {
    return 'tomcat';
  }

  get tag() {
    return '8.0-jre8';
  }

  get body() {
    return '';
  }

  toString(): string {
    return Maven.toString();
  }

  static toString(): string {
    return 'Maven';
  }

}
