const path = require('path')

const config = {
  SERVER_PATH: path.join(__dirname, 'LanguageTool-server'),
  SERVER_INFO_FILE: path.join(__dirname, 'server.info'),
}

module.exports = config