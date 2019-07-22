'use strict';

// ------------------------------------------------------------------------------------------ Dependencies

import { Command, CommandLineArgs, ProjectProperties, CI, ACDeployOptions, AWSOptions, BuildPack } from '../Interfaces';
import { PHPBuildPack, MavenBuildPack, NodeJSBuildPack } from '../buildpacks';
import { DefaultCommand } from '../commands/DefaultCommand';
import { InitCommand } from '../commands/InitCommand';
import { LoginCommand } from '../commands/LoginCommand';
import { ApplyCommand } from '../commands/ApplyCommand';
import { ServeCommand } from '../commands/ServeCommand';
import { ClearCommand } from '../commands/ClearCommand';
import { Travis } from '../ci/Travis';
import { CircleCI } from '../ci/CircleCI';
import * as fs from 'fs-extra';
import yamljs from 'yamljs';
import * as bunyan from 'bunyan';
import logFormatter from 'bunyan-format';
import minimist from 'minimist';

// ------------------------------------------------------------------------------------------ Variables

const log = bunyan.createLogger({
  name: 'acdeploy',
  stream: new logFormatter({ outputMode: 'short' }),
  level: 'info'
});

// ------------------------------------------------------------------------------------------ Class

export class Utils {

  private static _properties;

  static getLogger(): bunyan {
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

      // Set the default type
      if (!properties.options.type) {
        properties.options.type = 'web';
      }

      if (properties.options.type !== 'web' && properties.options.type !== 'task') {
        log.error(`Oh nooo! You have put an unknown value for "type" in your acdeploy config file. I only understand 'web' or 'task'.`);
        log.error(`Your value: ${properties.options.type}`);
        process.exit(-1);
      }

      // Determine BuildPack based on project configuration
      if (!properties.options.buildPack) {
        files.forEach(file => {
          switch (file) {
            case 'pom.xml':
              properties.options.buildPack = MavenBuildPack.toString();
              break;
            case 'composer.json':
              properties.options.buildPack = PHPBuildPack.toString();
              break;
            case 'package.json':
              properties.options.buildPack = NodeJSBuildPack.toString();
              break;
          }
        });
      }

      // Migrate to CIOptions
      if (typeof properties.options.ci === 'string') {
        properties.options.ci = {
          name: properties.options.ci
        };
      }

      // Set environment variables value from name attribute (if not set)
      const aws = [];
      if (properties.options.aws) {
        aws.push(properties.options.aws);
      }

      if (properties.options.environments && Object.keys(properties.options.environments).length > 0) {
        Object.keys(properties.options.environments).forEach((name) => {
          if (properties.options.environments[name].aws) {
            aws.push(properties.options.environments[name].aws);
          }
        });
      }

      aws.forEach((entry: AWSOptions) => {
        if (entry.ecs && entry.ecs.taskDefinition && entry.ecs.taskDefinition.containerDefinitions) {
          entry.ecs.taskDefinition.containerDefinitions = entry.ecs.taskDefinition.containerDefinitions.map((containerDefinition) => {
            if (containerDefinition.environment) {
              containerDefinition.environment = containerDefinition.environment.map((entry) => {
                if (!entry.value) {
                  entry.value = `\$\{${entry.name}\}`;
                }
                return entry;
              });
            }
            return containerDefinition;
          });
        }
      });

      if (properties.options.docker && properties.options.docker.buildArgs) {
        properties.options.docker.buildArgs = properties.options.docker.buildArgs.map((entry) => {
          if (!entry.value) {
            entry.value = `\$\{${entry.name}\}`;
          }
          return entry;
        });
      }

      Utils._properties = properties;
    }

    return JSON.parse(JSON.stringify(Utils._properties));
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
      case 'circleci':
        return new CircleCI();
      case 'travis':
      default:
        return new Travis();
    }
  }

  static getBuildPack(): BuildPack|null {
    const files = fs.readdirSync(Utils.properties.basedir);
    switch (Utils.properties.options.buildPack) {
      case MavenBuildPack.toString():
        return new MavenBuildPack();
      case PHPBuildPack.toString():
        const useBower = files.indexOf('bower.json') >= 0;
        return new PHPBuildPack(useBower);
      case NodeJSBuildPack.toString():
        return new NodeJSBuildPack();
    }
    return null;
  }

  static toYAML(properties: ProjectProperties) {
    const options: any = JSON.parse(JSON.stringify(properties.options));
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

  static replaceEnvironmentVariables(options: ACDeployOptions, failIfMissing: boolean): ACDeployOptions {
    return Utils.replaceEnvironmentVariablesRecursively(options, failIfMissing);
  }

  private static replaceEnvironmentVariablesRecursively(options: any, failIfMissing: boolean): any {
    if (typeof options === 'string') {
      options = Utils.replaceEnvironmentVariable(options, failIfMissing);
    } else if (options instanceof Array) {
      options = options.map((item: any) => Utils.replaceEnvironmentVariablesRecursively(item, failIfMissing));
    } else if (typeof options === 'object' && Object.keys(options).length > 0) {
      Object.keys(options).forEach((key) => {
        // Do not replace environment variables in CI section
        if (key !== 'ci') {
          options[key] = Utils.replaceEnvironmentVariablesRecursively(options[key], failIfMissing);
        }
      });
    }

    return options;
  }

  private static replaceEnvironmentVariable(content: string, failIfMissing: boolean) {
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
        // Make sure environment variables are strings, even though they can be provided as objects
        content = content.replace(new RegExp('\\$\\{' + match + '\\}', 'gi'), (typeof value !== 'string') ? JSON.stringify(value) : value);
      }
    });

    // Check if we have missing variables
    if (missing.length > 0 && failIfMissing) {
      const log = Utils.getLogger();
      log.error(`Oh nooo! You have put environment variables in your acdeploy config file, but I can't find them on this machine`);
      log.error(`Missing environment variables: ${missing.join(',')}`);
      process.exit(-1);
    }

    return content;
  }

}

// ------------------------------------------------------------------------------------------ Interfaces
