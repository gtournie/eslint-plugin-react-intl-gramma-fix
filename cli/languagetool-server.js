const child = require('child_process')
const path = require('path')
const fs = require('fs')
const { get } = require('http');
const { SERVER_PATH, SERVER_INFO_FILE } = require("../languagetool-conf.js");
const commandExistsSync = require('command-exists').sync;
const portscanner = require('portscanner')
const pids = require('port-pid');

const serverPath = path.resolve(SERVER_PATH)
const serverInfopath = path.resolve(SERVER_INFO_FILE)

const CONSOLE_GREEN = '\e[32m'

if (!commandExistsSync('java')) {
  console.error("Java must be installed")
  return process.exit(1)
}

if (!commandExistsSync('curl')) {
  console.error("curl must be installed")
  return process.exit(1)
}

let PORT = 8081
let PORT_RANGE = []
for (let i = PORT; i < 8099; ++i) PORT_RANGE.push(i)

const JAR_FILE = path.join(serverPath, 'languagetool-server.jar')

async function checkLanguageToolServer(port) {
  return new Promise((resolve, reject) => {
    get(`http://localhost:${port}`, function (response) {
      let body = '';
      response.on('data', (chunk) => body += chunk);
      response.on('end', () => resolve(body.includes('LanguageTool API')));
      response.on('error', reject)
    }).on('error', reject);
  })
}

async function serverInfo() {
  // Check PID if exists
  if (fs.existsSync(serverInfopath)) {
    let [pid, port] = fs.readFileSync(serverInfopath).toString().split(':');
    pid = parseInt(pid)
    port = parseInt(port)
    if (!isNaN(pid)) {
      try {
        process.kill(pid, 0);
        return { running: true, pid, port };
      } catch (e) {
      }
    }
  }

  // Check all ports
  let firstPortClosed = null
  for (let port of PORT_RANGE) {
    let status = await portscanner.checkPortStatus(port, 'localhost')
    if (status === 'open') {
      let isUp = await checkLanguageToolServer(port)
      if (isUp) return { running: true, port }
    } else if (firstPortClosed === null) {
      firstPortClosed = port;
    }
  }

  return { running: false, port: firstPortClosed }
}



async function start() {
  let { running, port } = await serverInfo()
  if (running) return console.log(CONSOLE_GREEN + 'LanguageTool server is already running' + (port ? ` (port ${port})` : ''))
  if (!port) throw new Error("Couldn't find a port to start LanguageTool server")

  console.log('Starting LanguageTool on port: ' + port)

  const server = await child.spawn('java',
    ['-cp', JAR_FILE, 'org.languagetool.server.HTTPServer', '--port', '' + port, '--allow-origin', "'*'", '--public'],
    { windowsHide: true, detached: true })

  // server.stdout.on('data', (d) => console.log('[0]', d.toString()))
  // server.stderr.on('data', (d) => console.error('[1]', d.toString()))

  server.on("error", (error) => {
    if (error) {
      console.error("Cannot start LanguageTool server automatically.")
      process.exit(1)
    }
  })

  // Save PID
  fs.writeFileSync(serverInfopath, server.pid + ':' + port)

  // Ping
  await ping(`http://localhost:${port}/v2/check`);
}

async function stop() {
  let { running, port, pid } = await serverInfo()
  if (!running) return console.log('LanguageTool server is not running');
  if (!pid) pid = (await pids(port)).tcp
  if (!pid) return console.error('Unable to stop LanguageTool server (pid not found)')
  process.kill(pid)
  fs.unlinkSync(serverInfopath)
  console.log('LanguageTool server stopped')
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const ping = async (url) => {
  const response = await fetch(`${url}?language=en-US&text=`).catch(() => ({ status: 500 }))

  if (response.status === 200) {
    console.log('LanguageTool server started')
    return process.exit(0)
  }

  await delay(500)
  await ping(url)
}


(async () => {
  try {
    switch (process.argv[2]) {
      case 'start':
        await start()
        return;
      case 'stop':
        await stop();
        return;
    }
  } catch (e) {
    console.log(e)
  }
})()
