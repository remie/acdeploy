'use strict';

// ------------------------------------------------------------------------------------------ Dependencies

import { BuildPack } from '../Interfaces';

// ------------------------------------------------------------------------------------------ Class

export default abstract class AbstractBuildPack implements BuildPack {

  abstract get image(): string;

  get tag() {
    return 'latest';
  }

  abstract get body(): string;

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
