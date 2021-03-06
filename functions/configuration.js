// Node packages
const ncp = require('ncp').ncp;

// Custom config files
const config = require('../_config/config');

// Move .editorconfig from the _config directory
module.exports.moveEditorConfig = (callback) => {
  console.log(`Moving .editorconfig to ${config.directory.tempDirectory}`);
  ncp(`./_config/.editorconfig`, `./${config.directory.tempDirectory}/.editorconfig`, callback);
};
