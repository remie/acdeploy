'use strict';

// ------------------------------------------------------------------------------------------ Dependencies

// ------------------------------------------------------------------------------------------ Variables

// ------------------------------------------------------------------------------------------ Class

export default class Docker {

  private type: supportedTypes;
  private options: DockerFileOptions;

  constructor(type: supportedTypes, params: DockerFileOptions = {} as any) {
    this.type = type;
    this.options = {
      image: params.image || this.defaultImage,
      tag: params.tag || this.defaultTag,
      body: params.body || this.defaultBody,
      custom: params.custom || '',
      cmd: params.cmd || this.defaultCMD
    };
  }

  toDockerfile() {
    return `
FROM ${this.options.image}:${this.options.tag}

${this.options.body}

${this.options.custom}

${this.options.cmd}
`.trim();
  }

  private get defaultImage() {
    switch (this.type) {
      case 'php': return 'php';
      case 'nodejs': return 'node';
      case 'maven': return 'tomcat';
      default: return 'ubuntu';
    }
  }

  private get defaultTag() {
    switch (this.type) {
      case 'php': return '7-apache';
      case 'nodejs': return '8';
      case 'maven': return '8.0-jre8';
      default: return 'ubuntu';
    }
  }

  private get defaultBody() {
    switch (this.type) {
      case 'php': return `
RUN apt-get update; \
  apt-get install -y \
  apt-utils \
  apt-transport-https \
  lsb-release \
  ca-certificates \
  software-properties-common \
  build-essential \
  git \
  wget \
  unzip; \
  wget -O /etc/apt/trusted.gpg.d/php.gpg https://packages.sury.org/php/apt.gpg; \
  echo "deb https://packages.sury.org/php/ $(lsb_release -sc) main" > /etc/apt/sources.list.d/php.list; \
  apt-get update;\
  cd /tmp; \
  php -r "copy('https://getcomposer.org/installer', 'composer-setup.php');"; \
  php -r "if (hash_file('SHA384', 'composer-setup.php') === '55d6ead61b29c7bdee5cccfb50076874187bd9f21f65d8991d46ec5cc90518f447387fb9f76ebae1fbbacf329e583e30') { echo 'Installer verified'; } else { echo 'Installer corrupt'; exit 100; } echo PHP_EOL;"; \
  php composer-setup.php --install-dir=/usr/bin --filename=composer; \
  php -r "unlink('composer-setup.php');"; \
  a2enmod rewrite;
COPY . /var/www/html/
RUN composer install --no-plugins --no-scripts --working-dir /var/www/html/;
`;
      case 'nodejs': return `

`;
      case 'maven': return `

`;
      default: return '';
    }
  }

  private get defaultCMD() {
    switch (this.type) {
      case 'nodejs': return `CMD ["npm", "start"]`;
      case 'php':
      case 'maven':
      default: return '';
    }
  }

}

// ------------------------------------------------------------------------------------------ Interfaces

export type supportedTypes = 'php' | 'nodejs' | 'maven';

export interface DockerFileOptions {
  image: string;
  tag: string;
  body: string;
  custom?: string;
  cmd?: string;
}