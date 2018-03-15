'use strict';

// ------------------------------------------------------------------------------------------ Dependencies

import * as fs from 'fs';
import * as path from 'path';

// ------------------------------------------------------------------------------------------ Variables

const basedir = process.cwd();

// ------------------------------------------------------------------------------------------ Class

export default class Utils {

  static getProjectProperties(): Promise<ProjectProperties> {
    return new Promise<ProjectProperties>((resolve, reject) => {

      // Initialize properties
      const properties: ProjectProperties = {} as any;
      properties.basedir = process.cwd();

      // Loop over files in basedir to check if we can detect the type of project
      // Also, if we happen to find custom settings, read them :)
      fs.readdir(properties.basedir, (err, files) => {
        if (!err) {
          files.forEach(file => {
            switch (file) {
              case 'pom.xml': properties.isMaven = true; break;
              case 'composer.json': properties.isPHP = true; break;
              case 'package.json': properties.isNodeJS = true; break;
              case 'Dockerfile': properties.isDockerized = true; break;
              case '.acdeploy': properties.settings = require(file); break;
            }
          });
          resolve(properties);
        } else {
          reject(err);
        }
      });
    });
  }

}

// ------------------------------------------------------------------------------------------ Interfaces

export interface ProjectProperties {
  basedir: string;
  isPHP: boolean;
  isNodeJS: boolean;
  isMaven: boolean;
  isDockerized: boolean;
  settings: ACDeploySettings;
}

export interface ACDeploySettings {

}