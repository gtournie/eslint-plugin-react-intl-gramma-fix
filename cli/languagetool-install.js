const fs = require("fs");
const path = require("path");
const { pipeline } = require('node:stream/promises');
const cliProgress = require("cli-progress")
const progressStream = require("progress-stream")
const decompress = require('decompress')
const { readdir, rename } = require('fs/promises');
const { SERVER_PATH } = require("../languagetool-conf.js");

const DOWNLOAD_LINK = 'https://languagetool.org/download/LanguageTool-6.1.zip';
const ZIP_DESTINATION = path.join(__dirname, path.basename(DOWNLOAD_LINK));

// Downloading
const toMegabytes = (bytes) => {
  return Number((bytes / (1000 * 1000)).toFixed(2))
}

async function download(url, dest) {
  const res = await fetch(url)
  const dataLength = res.headers.get("content-length")
  const bar = new cliProgress.Bar({
    barCompleteChar: "#",
    barIncompleteChar: ".",
    format: "Downloading: [{bar}] {percentage}% | {value}/{total}MB",
  })
  bar.start(toMegabytes(dataLength), 0)

  const str = progressStream({
    length: dataLength,
    time: 100,
  }).on("progress", (progress) => bar.update(toMegabytes(progress.transferred)))

  const fileStream = fs.createWriteStream(dest)

  await pipeline(res.body, str, fileStream)
  bar.stop()
}

// Unzipping
async function unzip(source, dest) {
  return new Promise((resolve, reject) => {
    decompress(source, dest)
      .then(resolve)
      .catch(reject);
  });
}


// Main
(async () => {
  console.log("Downloading " + DOWNLOAD_LINK)
  try {
    await download(DOWNLOAD_LINK, ZIP_DESTINATION);
  } catch (e) {
    console.error(`Unable to download ${DOWNLOAD_LINK}. LanguageTool server won't work`)
    throw e
  }

  fs.rmSync(SERVER_PATH, { recursive: true, force: true })
  try {
    await unzip(ZIP_DESTINATION, SERVER_PATH);
  } catch (e) {
    console.error(`Unable to unzip ${ZIP_DESTINATION}. LanguageTool server won't work`)
    fs.unlinkSync(ZIP_DESTINATION)
    throw e
  }
  fs.unlinkSync(ZIP_DESTINATION)

  const files = await readdir(SERVER_PATH, { withFileTypes: true });
  if (files.length > 1 || !files[0].isDirectory()) {
    throw new Error("Bad LanguageTool zip file structure")
  }

  const mainDir = path.join(SERVER_PATH, files[0].name)
  const innerFiles = await readdir(mainDir, { withFileTypes: true });
  for (let file of innerFiles) {
    await rename(path.join(mainDir, file.name), path.join(SERVER_PATH, file.name))
  }

  fs.rmSync(mainDir, { recursive: true, force: true })

  console.log('LanguageTool server successfully installed.')
})();
