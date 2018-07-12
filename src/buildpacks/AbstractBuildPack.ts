'use strict';

// ------------------------------------------------------------------------------------------ Dependencies

import { ProjectProperties, BuildPack } from '../Interfaces';

// ------------------------------------------------------------------------------------------ Class

export default abstract class AbstractBuildPack implements BuildPack {

  abstract get image();

  get tag() {
    return 'latest';
  }

  abstract get body();

  get command() {
    return '';
  }

  get dockerignore() {
    return '';
  }

  static toString(): string {
    return undefined;
  }

  toString(): string {
    return AbstractBuildPack.toString();
  }
}
