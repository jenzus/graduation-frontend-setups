let fs;
let rimraf;
let clone;

// Node packages
try {
  fs = require('fs');
  rimraf = require('rimraf');
  clone = require('git-clone');
} catch (e) {
  console.log(`🙁  Packages missing, run 'npm install' / 'yarn install' first`);
  process.exit(0);
}

// Custom config files
const defaultPackages = require('./packages/default-packages');
const config = require('./_config/config');

// Define custom functions
const Helpers = require('./functions/helpers');
const Dependency = require('./functions/dependency');
const Package = require('./functions/package');
const Configuration = require('./functions/configuration');
const Setup = require('./functions/setup');

let props = process.argv.slice(2);
let setup;
let name;
let extensions;
let packagesSet = false;
let gitRepo = false;
let implementPwa = true;
let customPackages = true;

config.directory.tempDirectory = config.directory.tempDirectoryName;

// Set the debug env variable
process.env.DEBUG = process.argv.includes('debug');
process.env.TESTING = process.argv.includes('testing') || process.argv.includes('skip');
process.env.SKIP = process.argv.includes('skip');

let configuration;

// This function is called after the user filled the questions from start.js
const start = (answers) => {
  Helpers.emptyLog();
  setup = answers.setup;
  extensions = answers.extensions;
  gitRepo = (typeof answers.gitUrl !== 'undefined') ? answers.gitUrl : false;
  implementPwa = answers.implementPwa;

  if (gitRepo) {
    config.directory.tempDirectory = config.directory.gitTempDirectoryName;
  }

  Helpers.removeTempDirectories(startCallback);
};

const startCallback = () => {
  if (gitRepo) {
    return pullGitRepository();
  }

  return continueSetup();
}

// This function is called when a user calls index.js
const quickStart = () => {
  setup = props[0];
  name = props[1];
  extensions = true; // True means all extensions are used

  Helpers.removeTempDirectories(continueSetup);
};

const pullGitRepository = () => {
  console.log(`✨  Cloning ${gitRepo}`);
  clone(gitRepo, config.directory.tempDirectory, () => {
    console.log('👌  Finished cloning');
    Helpers.emptyLog();
    
    // Remove .git directory from the pulled repo
    // Callback => createTempDirectory
    rimraf(`./${config.directory.tempDirectory}/.git`, createTempDirectory);
  });
};

const continueSetup = () => {
  // Callback => createTempDirectory
  fs.stat(`./_viewlayers/${setup}`, (err, stats) => {
    if (err) {
      Helpers.exit(`Setup directory '${setup}' does not exist in _viewlayers`);
    }

    if (!stats.isDirectory()) {
      Helpers.exit('Setup directory is not a directory');
    }

    return createTempDirectory();
  });
};

// Create temporary directory for the application
const createTempDirectory = () => {
  console.log(`🔨  Creating directory '${config.directory.tempDirectory}'`);
  // Callback => copyPackageJson
  if (gitRepo) {
    return copyPackageJson();
  }

  fs.mkdir(config.directory.tempDirectory, copyPackageJson);
};

// packages.js exists | Callback => installPackages
// No packages.js in setup | Callback => moveConfiguration
const copyPackageJson = () => {
  Helpers.emptyLog();
  console.log(`✨  Setting up ${setup} project`);
  Helpers.emptyLog();

  const packagesPath = (gitRepo)
    ? `./${config.directory.gitTempDirectoryName}/packages`
    : `./_viewlayers/${setup}/packages`;

  fs.stat(`${packagesPath}.js`, (err, stats) => {

    if (err) {
      customPackages = false;
      console.log('No packages.js file found, skipping dependency installation');
    }
    
    if (customPackages) {
      packagesSet = true;
      configuration = require(packagesPath);
    }

    // Use function to move the package.json file. Pass installPackages as callback
    // Callback => installPackages
    Package.movePackageJson(setup, installPackages, implementPwa);
  });
};

const installPackages = () => {
  // Move node process to new directory
  process.chdir(config.directory.tempDirectory);

  // If setup has custom packages, make sure those are also installed
  if (customPackages) {
    const setupPackages = Package.createPackageString(configuration);
  }
  
  const devPackages = `${defaultPackages.dev.concat().join(' ')} ${(customPackages) ? setupPackages.dev : ''}`;
  const mainPackages = `${defaultPackages.main.concat().join(' ')} ${(customPackages) ? setupPackages.main : ''}`;

  // Install normal- and dev dependencies.
  // Callback => moveConfiguration
  Dependency.install(
    mainPackages,
    0,
    Dependency.install.bind(this, devPackages, 1, moveConfiguration));
};

// Only move editorconfig if the user selected this
const moveConfiguration = () => {
  Helpers.emptyLog();
  // Jump one directory up with node process
  process.chdir(`../`);

  if (typeof extensions === 'object' && extensions.includes('editorconfig')) {
    return Configuration.moveEditorConfig(moveApplicationSetup);
  }

  return moveApplicationSetup();
};

// Callback => checkIfESLintEnabled
const moveApplicationSetup = () => {
  Setup.moveViewLayerSetup(setup, checkIfESLintEnabled);
};

// Callback => moveBundlerConfiguration
const checkIfESLintEnabled = () => {
  if (typeof extensions === 'object' && extensions.includes('eslint') === false) {
    console.log('ESLint was not enabled');
    removeESLintConfig();
  }

  return moveBundlerConfiguration();
}

const removeESLintConfig = () => {
  const ESLintPath = `${config.directory.tempDirectory}/.eslintrc`;
  fs.stat(ESLintPath, (err, stats) => {
    fs.unlink(ESLintPath, (err) => {
      if (err) {
        console.log('err', err);
      }
      console.log('ESLint configuration removed')
    });
  });
};

// Callback => moveTemplateConfiguration
const moveBundlerConfiguration = () => {
  const bundlerPath = `${config.directory.tempDirectory}/webpack`;
  fs.stat(bundlerPath, (err, stats) => {
    // If there is no webpack directory found
    if (err) {
      const bundler = 'webpack';
      return Setup.moveBundlerSetup(bundler, moveTemplateConfiguration);
    }
    
    // If a webpack setup is already found, skip copying it
    return moveTemplateConfiguration();
  });
};

// Callback => moveProgressiveWebAppConfig | moveGithooksConfiguration
const moveTemplateConfiguration = () => {
    Setup.moveTemplates(implementPwa, (implementPwa) ? moveProgressiveWebAppConfig : moveGithooksConfiguration);
};

// This function is only called when user answered yes on the pwa question
// Move the _pwa directory to the temporary application directory
// Callback => moveGithooksConfiguration
const moveProgressiveWebAppConfig = () => {
  Setup.moveProgressiveWebAppConfiguration(moveGithooksConfiguration);
};

// Callback => cleanup
const moveGithooksConfiguration = () => {
  // Only move githooks if the user selected them
  if (typeof extensions === 'object' && extensions.includes('githooks')) {
    if (process.env.TESTING === 'true') {
      return Setup.moveGithooks(finished);
    }
  
    return Setup.moveGithooks(cleanup);
  }

  // If githooks are not selected, continue without moving them
  if (process.env.TESTING === 'true') {
    return finished();
  }
  
  return cleanup();
};

// Callback => moveTempFilesToRoot
const cleanup = () => {
  fs.readdir('.', (err, files) => {
    // If packages.js was set, remove them from the directory
    if (packagesSet) {
      files.push(`./${config.directory.tempDirectory}/packages.js`);
    }

    Helpers.removeFiles(files, moveTempFilesToRoot);
  });
};

// Callback => finished
const moveTempFilesToRoot = () => {
  Helpers.moveTempFiles(finished);
};

const finished = () => {
  Helpers.emptyLog();
  console.log('🎉  Completed');
}

module.exports.start = start;
module.exports.quickStart = quickStart;
