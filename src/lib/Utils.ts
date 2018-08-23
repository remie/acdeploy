'use strict';

// ------------------------------------------------------------------------------------------ Dependencies

import { Command, CommandLineArgs, ProjectProperties, CI, ACDeployOptions } from '../Interfaces';
import { PHPBuildPack, MavenBuildPack, NodeJSBuildPack } from '../buildpacks';
import { DefaultCommand } from '../commands/DefaultCommand';
import { InitCommand } from '../commands/InitCommand';
import { LoginCommand } from '../commands/LoginCommand';
import { ApplyCommand } from '../commands/ApplyCommand';
import { ServeCommand } from '../commands/ServeCommand';
import { ClearCommand } from '../commands/ClearCommand';
import { Travis } from '../ci/Travis';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as yamljs from 'yamljs';
import * as bunyan from 'bunyan';
import * as logFormatter from 'bunyan-format';
import * as merge from 'lodash.merge';
import slugify from 'slugify';
import * as minimist from 'minimist';

// ------------------------------------------------------------------------------------------ Variables

const log = bunyan.createLogger({
  name: 'acdeploy',
  stream: logFormatter({ outputMode: 'short' }),
  level: 'info'
});

// ------------------------------------------------------------------------------------------ Class

export class Utils {

  private static _properties;

  static getLogger() {
    return log;
  }

  static getArgs(): CommandLineArgs {
    return Object.assign({}, minimist(process.argv.slice(2)));
  }

  static get properties(): ProjectProperties {
    if (!Utils._properties) {
      const args = minimist(process.argv.slice(2));

      // Initialize properties
      const properties: ProjectProperties = {
        basedir: process.cwd(),
        verbose: args.verbose,
        ymlFile: '.acdeploy.yml',
      };

      // Loop over files in basedir to check if we can detect the type of project
      const files = fs.readdirSync(properties.basedir);
      files.forEach(file => {
        switch (file) {
          case '.acdeploy':
            properties.ymlFile = '.acdeploy/config.yml';
            break;
          case '.acdeploy.yml':
          case '.acdeploy.yaml':
          case 'acdeploy.yml':
          case 'acdeploy.yaml':
            properties.ymlFile = file;
            break;
        }
      });

      // If we happen to have found custom settings, read them :)
      if (properties.ymlFile && fs.pathExistsSync(properties.ymlFile)) {
        const buffer = fs.readFileSync(properties.ymlFile);
        properties.options = yamljs.parse(buffer.toString('utf-8'));
      } else {
        properties.options = {} as ACDeployOptions;
      }

      // Determine BuildPack based on project configuration
      let buildPack: string = (typeof properties.options.buildPack === 'string') ? properties.options.buildPack : undefined;
      if (!buildPack) {
        files.forEach(file => {
          switch (file) {
            case 'pom.xml':
              buildPack = MavenBuildPack.toString();
              break;
            case 'composer.json':
              buildPack = PHPBuildPack.toString();
              break;
            case 'package.json':
              buildPack = NodeJSBuildPack.toString();
              break;
          }
          // @ts-ignore because we are using a string instead of the required BuildPack interface
          properties.options.buildPack = buildPack;
        });
      }

      // Migrate to CIOptions
      if (typeof properties.options.ci === 'string') {
        properties.options.ci = {
          name: properties.options.ci
        }
      }

      if (properties.options.aws && properties.options.aws.ecs && properties.options.aws.ecs.taskDefinition && properties.options.aws.ecs.taskDefinition.containerDefinitions) {
        properties.options.aws.ecs.taskDefinition.containerDefinitions = properties.options.aws.ecs.taskDefinition.containerDefinitions.map((item) => {
          item.environment = item.environment.map((entry) => {
            if (!entry.value) {
              entry.value = `\$\{${entry.name}\}`;
            }
            return entry;
          });
          return item;
        });
      }

      Utils._properties = properties;
    }

    if (typeof Utils._properties.options.buildPack === 'string') {
      const files = fs.readdirSync(Utils._properties.basedir);
      switch (Utils._properties.options.buildPack) {
        case MavenBuildPack.toString():
          Utils._properties.options.buildPack = new MavenBuildPack();
          break;
        case PHPBuildPack.toString():
          const useBower = files.indexOf('bower.json') >= 0;
          Utils._properties.options.buildPack = new PHPBuildPack(useBower);
          break;
        case NodeJSBuildPack.toString():
          Utils._properties.options.buildPack = new NodeJSBuildPack();
          break;
      }
    }

    return Utils._properties;
  }

  static set properties(value: ProjectProperties) {
    Utils._properties = value;
  }

  static getCommandName(): string {
    const args = minimist(process.argv.slice(2));
    const commands = args._.slice();

    // Return default command if none is specified
    if (!commands || commands.length === 0) {
      return 'default';
    } else {
      return commands[0];
    }
  }

  static getCommand(): Command {
    const command = Utils.getCommandName();

    // Return specified command (or show help if not supported)
    switch (command) {
      case 'default':
        return new DefaultCommand();
      case 'init':
        return new InitCommand();
      case 'login':
        return new LoginCommand();
      case 'apply':
        return new ApplyCommand();
      case 'clear':
        return new ClearCommand();
      case 'serve':
        return new ServeCommand();
      default:
        console.log(`Unrecognized command: '${command}'`);
        Utils.showHelp();
    }
  }

  static getCI(): CI {
    switch (Utils.properties.options.ci.name.toLowerCase()) {
      case 'travis':
      default:
        return new Travis(Utils.properties.options.ci.commands);
    }
  }

  static toYAML(properties: ProjectProperties) {
    const options: any = Object.assign({}, properties.options);
    if (options.buildPack) options.buildPack = options.buildPack.toString();
    fs.writeFileSync(properties.ymlFile, yamljs.stringify(options, 10));
  }

  static showHelp(command: string = '[command]', commandHelp?: Function) {
    console.log(`Usage: acdeploy ${command} [options]`);
    console.log();

    if (!commandHelp) {
        console.log('Supported commands:');
        console.log('\tinit \t\t Enable ACDeploy for current project');
        console.log('\tlogin \t\t Set ACDeploy AWS credentials for current project');
        console.log('\tapply \t\t Provision required ACDeploy resources on AWS for current project');
        console.log('\tserve \t\t Run ACDeploy locally (Docker CE is required)');
        console.log('\tclear \t\t Remove ACDeploy configuration for current project');
        console.log();
        console.log('Supported options:');
        console.log('--version\tDisplays the current version of ACDeploy');
        console.log();
        console.log('For detailed information on each command and its options, run:');
        console.log('\tacdeploy [command] --help');
    } else {
      commandHelp();
    }

    console.log();
    process.exit();
  }

  static replaceEnvironmentVariables(options: ACDeployOptions): ACDeployOptions {
    return Utils.replaceEnvironmentVariablesRecursively(options);
  }

  private static replaceEnvironmentVariablesRecursively(options: any): any {
    if (typeof options === 'string') {
      options = Utils.replaceEnvironmentVariable(options);
    } else if (options instanceof Array) {
      options = options.map((item: any) => Utils.replaceEnvironmentVariablesRecursively(item));
    } else if (typeof options === 'object' && Object.keys(options).length > 0) {
      Object.keys(options).forEach((key) => {
        options[key] = Utils.replaceEnvironmentVariablesRecursively(options[key]);
      });
    }

    return options;
  }

  private static replaceEnvironmentVariable(content: string) {
    // Replace environment variables
    const missing = [];
    const matches = content.match(/\$\{.*\}/gi) || [];
    matches.forEach(match => {
      // Remove the ${} from the match and retrieve the environment variable
      match = match.substr(2, match.length - 3 );
      const value = process.env[match];

      // Make sure that the environment variable exists
      if (!value) {
        missing.push(match);
      } else {
        content = content.replace(new RegExp('\\$\\{' + match + '\\}', 'gi'), value);
      }
    });

    // Check if we have missing variables
    if (missing.length > 0) {
      const log = Utils.getLogger();
      log.error(`Oh nooo! You have put environment variables in your acdeploy config file, but I can't find them on this machine`);
      log.error(`Missing environment variables: ${missing.join(',')}`);
      process.exit(-1);
    }

    return content;
  }

}

// ------------------------------------------------------------------------------------------ Interfaces
