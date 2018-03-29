'use strict';

// ------------------------------------------------------------------------------------------ Dependencies

import { Command, CommandLineArgs, ProjectProperties, SupportedCI, CI, YMLOptions, ACDeployOptions, ECSOptions } from '../Interfaces';
import { PHPBuildPack, MavenBuildPack, NodeJSBuildPack } from '../buildpacks';
import { DefaultCommand, InitCommand, ServeCommand, ClearCommand } from '../commands';
import { Travis } from '../ci';
import CommandLine from './CommandLine';
import * as fs from 'fs';
import * as path from 'path';
import * as yamljs from 'yamljs';
import * as bunyan from 'bunyan';
import * as logFormatter from 'bunyan-format';
import * as nconf from 'nconf';

// ------------------------------------------------------------------------------------------ Variables

nconf.argv().env();
const basedir = process.cwd();
const logger = bunyan.createLogger({
  name: 'acdeploy',
  stream: logFormatter({ outputMode: 'short' }),
  level: 'info'
});

// ------------------------------------------------------------------------------------------ Class

export default class Utils {

  static getLogger() {
    return logger;
  }

  static getProjectProperties(args: CommandLineArgs): ProjectProperties {

    // Initialize properties
    const log = Utils.getLogger();
    const properties: ProjectProperties = {} as any;
    let options: YMLOptions = {} as YMLOptions;

    // Properties from Command-line parameters
    properties.basedir = process.cwd();
    properties.verbose = (typeof args.verbose === 'boolean') ? args.verbose : false;

    // Loop over files in basedir to check if we can detect the type of project
    let ymlFile: string;
    const files = fs.readdirSync(properties.basedir);

    files.forEach(file => {
      switch (file) {
        case 'pom.xml':
          properties.isMaven = true;
          break;
        case 'composer.json':
          properties.isPHP = true;
          break;
        case 'bower.json':
          properties.isBower = true;
          break;
        case 'package.json':
          properties.isNodeJS = true;
          break;
        case 'Dockerfile':
          properties.isDockerized = true;
          break;
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
    if (properties.ymlFile) {
      const buffer = fs.readFileSync(properties.ymlFile);
      const content = this.replaceEnvironmentVariables(buffer.toString('utf-8'));
      options = yamljs.parse(content) as YMLOptions;
    } else {
      options = {} as YMLOptions;
      properties.ymlFile = path.join(properties.basedir, '.acdeploy.yml');
    }

    // Check for required options on the command-line if not already present
    if (!options.name && typeof args.name === 'string') {
      options.name = args.name;
    }

    // Fail if we can't find minimal required options
    if (!options.name) {
      log.info(`Could not find required option 'name'. Are you sure this project has been initialized?`);
      log.info(`If not, you should run 'acdeploy init --name <project_name>' first`);
      process.exit(-1);
    }

    // Determine BuildPack based on project configuration
    if (!options.buildPack) {
      if (properties.isMaven) {
        options.buildPack = new MavenBuildPack(properties);
      } else if (properties.isPHP) {
        options.buildPack = new PHPBuildPack(properties);
      } else if (properties.isNodeJS) {
        options.buildPack = new NodeJSBuildPack(properties);
      }
    } else if (typeof options.buildPack === 'string') {
      switch (options.buildPack) {
        case PHPBuildPack.toString():
          options.buildPack = new PHPBuildPack(properties);
          break;
        default:
          log.error(`Oh nooo! You have specified a buildPack (${options.buildPack}) in your acdeploy config file which is currently not supported`);
          process.exit(-1);
      }
    }

    // Set default Docker configuration
    if (!options.docker) {
      options.docker = {
        name: options.name,
        repository: {
          type: 'aws-ecr',
          name: options.name
        }
      };
    }

    // Set default AWS configuration
    if (!options.aws) {
      options.aws = {
        region: 'us-east-1',
        ecs: {
          cluster: {
            clusterName: 'acdeploy'
          },
          service: {
            desiredCount: 1,
            serviceName: options.name,
            taskDefinition: options.name
          },
          taskDefinition: {
            family: options.name,
            containerDefinitions: []
          },
          loadbalancer: {
            Name: options.name
          },
          targetGroup: {
            Name: options.name,
            Protocol: 'https',
            Port: 443,
            VpcId: null
          }
        }
      };
    }

    properties.options = options as ACDeployOptions;
    return properties;
  }

  static getCommand(cli: CommandLine): Command {
    // Return default command if none is specified
    if (!cli.commands || cli.commands.length === 0) {
      return new DefaultCommand(cli);
    }

    // Return specified command (or show help if not supported)
    switch (cli.commands[0]) {
      case 'init':
        return new InitCommand(cli);
      case 'clear':
        return new ClearCommand(cli);
      case 'serve':
        return new ServeCommand(cli);
      default:
        const log = Utils.getLogger();
        console.log(`Unrecognized command: '${cli.commands[0]}'`);
        Utils.showHelp();
    }
  }

  static getCI(name: SupportedCI): CI {
    switch (name) {
      case 'travis':
      default:
        return new Travis(Utils.getLogger());
    }
  }

  static toYAML(properties: ProjectProperties) {
    fs.writeFileSync(properties.ymlFile, yamljs.stringify(Object.assign(properties.options, {
      buildPack: properties.options.buildPack.toString()
    }), 10));
  }

  static showHelp(command: string = '[command]', commandHelp?: Function) {
    console.log(`Usage: acdeploy ${command} [options]`);
    console.log();

    if (!commandHelp) {
        console.log('Supported commands:');
        console.log('\tinit \t\t Enable ACDeploy for current project');
        console.log('\tserve \t\t Run ACDeploy locally (Docker CE is required)');
        console.log('\tclear \t\t Remove ACDeploy configuration for current project');
        console.log();
        console.log('For detailed information on each command and its options, run:');
        console.log('\tacdeploy [command] --help');
    } else {
      commandHelp();
    }

    console.log();
    process.exit();
  }

  private static replaceEnvironmentVariables(content: string): string {
    // Replace environment variables
    const missing = [];
    const matches = content.match(/\$\{.*\}/gi) || [];
    matches.forEach(match => {
      // Remove the ${} from the match and retrieve the environment variable
      match = match.substr(2, match.length - 3 );
      const value = nconf.get(match);

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
