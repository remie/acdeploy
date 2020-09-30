# ACdeploy (Automatic Container Deployment)
*Keeping you cool during your deployments*

![](https://user-images.githubusercontent.com/435237/29970265-32004424-8f24-11e7-9c1f-c09919876e83.jpg)

# Mission statement

The goal of ACDeploy is to enable one-step deployment of projects to staging & production environments with minimal configuration.

## Sounds great, how does that work?

ACDeploy automatically detects the programming language of your project and creates a Docker container from a pre-defined build pack. This Docker container is pushed to one of the supported Cloud platforms.

# Getting started

Step 1: install ACDeploy

```
npm install -g @remie/acdeploy
```

Step 2: Clone your project repository locally
Step 3: Enabled ACDeploy for your project (be prepared to answer some questions)

```
acdeploy init
```

Step 4: Commit & push the generated config files
Step 5: Watch your CI environment do the rest

## Prerequisites (the fine print)

ACDeploy is specifically created for a workflow that uses version control, continuous integration and a cloud platform. At this point, the following tools are supported:

- *Version control*: GitHub
- *Continuous integration*: TravisCI, CircleCI
- *Cloud platform*: Amazon Web Services

To be able to use ACDeploy in your project, you should create a GitHub account and host your project there. Use your GitHub credentials to log into TravisCI and enable TravisCI for your project. Finally, create an AWS account (you will need the API credentials).

Oh, and there is a list of supported development languages (buildpacks):

- PHP
- NodeJS
- Maven

If you wish to also use ACDeploy for local development, you will need to install Docker CE locally. Oh, and ACDeploy is written in NodeJS, so you will need to install it locally for any of this to work.

# ACDeploy configuration

If you run `acdeploy init` you will be asked some of the  basic questions. To make this as easy as possible, ACDeploy will try to ask you as little information as possible, and will assume the rest. If you do not feel comfortable with those assumptions, or if you are curious what ACDeploy does, you can check the `.acdeploy.yml` file which will be added to your project after running `acdeploy init`.

_Important note_: the `AWS` section of the YML file is based on the [AWS SDK for Javascript](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/index.html). If you wish to change that configuration, you can use the AWS documentation to check which properties you can add/remove
