'use strict';

// ------------------------------------------------------------------------------------------ Dependencies

import AbstractBuildPack from './AbstractBuildPack';

// ------------------------------------------------------------------------------------------ Class

export default class PHP extends AbstractBuildPack {

  private useBower: boolean = false;

  constructor(useBower: boolean = false) {
    super();
    this.useBower = useBower;
  }

  get image() {
    return 'php';
  }

  get tag() {
    return '7-apache';
  }

  get body() {
        let dockerfile = `
RUN apt-get update; \
  apt-get install -y \
  apt-utils \
  apt-transport-https \
  lsb-release \
  ca-certificates \
  software-properties-common \
  build-essential \
  gnupg \
  git \
  curl \
  wget \
  unzip \
  libbz2-dev \
  libzip-dev \
  libcurl4-openssl-dev \
  libpq-dev \
  libedit-dev \
  zlib1g-dev \
  libpng-dev \
  libonig-dev \
  libjpeg-dev; \
  wget -O /etc/apt/trusted.gpg.d/php.gpg https://packages.sury.org/php/apt.gpg; \
  echo "deb https://packages.sury.org/php/ $(lsb_release -sc) main" > /etc/apt/sources.list.d/php.list; \
  apt-get update;\
  cd /tmp; \
  php -r "copy('https://getcomposer.org/installer', 'composer-setup.php');"; \
  php -r "if (hash_file('SHA384', 'composer-setup.php') === '55d6ead61b29c7bdee5cccfb50076874187bd9f21f65d8991d46ec5cc90518f447387fb9f76ebae1fbbacf329e583e30') { echo 'Installer verified'; } else { echo 'Installer corrupt'; exit 100; } echo PHP_EOL;"; \
  php composer-setup.php --install-dir=/usr/bin --filename=composer; \
  php -r "unlink('composer-setup.php');"; \
  a2enmod rewrite; \
  docker-php-ext-install bz2 curl mbstring pdo_mysql mysqli opcache pdo_pgsql readline sockets zip gd;

COPY . /var/www/html/
RUN composer install --no-plugins --no-scripts --working-dir /var/www/html/;
`;
        if (this.useBower) {
          dockerfile += `
RUN curl -sL https://deb.nodesource.com/setup_8.x | bash -; \
    apt-get install -y nodejs; \
    npm install -g bower; \
    bower install --allow-root;
`;
        }

        return dockerfile;
  }

  toString(): string {
    return PHP.toString();
  }

  static toString(): string {
    return 'PHP';
  }

}
