const gramma = require("../dist/gramma.js")
const split = require('lodash.split')
const child = require('child_process')
const path = require('path')
const fs = require('fs')
const { SERVER_INFO_FILE } = require("../languagetool-conf.js");

// From dist dir
const serverInfopath = path.resolve('node_modules', 'eslint-plugin-react-intl-gramma-fix', path.basename(SERVER_INFO_FILE))

let PORT = 8081;
if (fs.existsSync(serverInfopath)) {
  PORT = parseInt(fs.readFileSync(serverInfopath).toString().split(':')[1]);
}

const ENCODING = { encoding: 'utf8' }
class Cache {
  constructor(name, dir) {
    this.pathToFile = dir ? path.resolve(dir, docId) : path.resolve(__dirname, './.cache/', name);
    if (!fs.existsSync(this.pathToFile)) {
      fs.mkdirSync(path.dirname(this.pathToFile), { recursive: true });
      this.json = {}
    } else {
      let content = fs.readFileSync(this.pathToFile, ENCODING).toString()
      this.json = content ? JSON.parse(content) : {}
    }
  }
  set(key, value) {
    this.json[key] = value
  }
  get(key) {
    return this.json[key]
  }
  load() {
    this.json = JSON.parse(fs.readFileSync(this.pathToFile, ENCODING).toString())
  }
  save() {
    fs.writeFileSync(this.pathToFile, JSON.stringify(this.json, null, 2), ENCODING)
  }
}

const cache = new Cache('gramma')

global.grammaFetch = function (url, opts) {
  let curlHeaders = Object.keys(opts.headers).reduce((acc, name) => acc + ` -H "${name}: ${opts.headers[name]}"`, '')
  return {
    text: () => child.execSync(`curl -s -X ${opts.method} ${url}${curlHeaders} -d "${opts.body || ''}"`)
  }
}

const GRAMMA_NON_BREAKING_SPACE_REG = new RegExp(String.fromCharCode(8239), 'g')
const HTML_NON_BREAKING_SPACE = ' ' // 160
const EMOJI_REG = /\p{Extended_Pictographic}/u


// Managing emojis is a nightmare... did my best
function grammaFix(text, locale) {
  let key = locale + '|' + text
  let result = cache.get(key)
  if (result === 1) return { fix: text, matches: [] }

  let fix = text

  if (EMOJI_REG.test(fix)) {
    let letters = split(fix, '')
    letters.forEach((c, index) => {
      if (EMOJI_REG.test(c)) {
        if (index > 0 && !EMOJI_REG.test(letters[index - 1]) && /[^\s\[\(\{]/.test(letters[index - 1])) {
          letters[index - 1] += ' '
        }
        if (index < letters.length - 1 && !EMOJI_REG.test(letters[index + 1]) && /[^\s\]\)\}]/.test(letters[index + 1])) {
          letters[index + 1] = ' ' + letters[index + 1]
        }
      }
    })
    fix = letters.join('')
  }

  const hasVar = fix.includes('{') && fix.includes('}')
  let { matches } = gramma.check(fix, {
    api_url: `http://localhost:${PORT}/v2/check`,
    language: locale,
    rules: {
      typos: false,
      colloquialisms: false,
      casing: false,
      style: false, // doesn't work sometimes...
    }
  })

  matches = matches.reverse().filter(m => {
    if ((m.replacements || []).length === 0) return false;
    if (['style', 'whitespace'].includes((m.rule || {}).issueType)) return false;
    if (['ACCORD_PLURIEL_ORDINAUX', 'POINTS_2', 'XXieme', 'FLECHES', 'CE_SE'].includes((m.rule || {}).id)) return false;
    if (hasVar && ['AI_FR_HYDRA_LEO_MISSING_COMMA'].includes((m.rule || {}).id)) return false;

    return true;
  });
  matches.forEach(m => {
    fix = fix.slice(0, m.offset) +
      m.replacements[0].value +
      fix.slice(m.offset + m.length)
  });
  // Fix NON_BREAKING_SPACES
  fix = fix.replace(GRAMMA_NON_BREAKING_SPACE_REG, HTML_NON_BREAKING_SPACE)

  // Keep vars
  fix = keepInterpolationUnchanged(text, fix)

  // fr-FR fix
  if (locale === 'fr-FR') {
    // Gramma insert only a non breaking space if no space is present
    fix = fix.replace(/(\s+)([;:!?]+)/g, function (_, $1, $2) {
      if ($1.length > 1 || $1 !== HTML_NON_BREAKING_SPACE) {
        matches.push({
          message: 'Les signes de ponctuation double sont précédés d’une espace insécable.'
        })
        return HTML_NON_BREAKING_SPACE + $2;
      }
      return $1 + $2;
    })
  }

  if (text === fix) {
    cache.set(key, 1)
    cache.save()
    return { fix: text, matches: [] }
  }
  return { fix, matches }
}

module.exports = grammaFix;

function parseText(text) {
  let open = 0;
  let index = 0;
  let results = []
  split(text, '').forEach((c, cIndex) => {
    if (c === '{') {
      if (open === 0 && cIndex) ++index;
      ++open;
    }
    results[index] = (results[index] || '') + c;
    if (c === '}') {
      --open;
      if (open === 0) ++index;
    }
  })
  return results
}

function keepInterpolationUnchanged(original, processed) {
  if (!/\{[^\{]+\}/.test(original)) return processed; // no var

  // Extract vars
  var oParsed = parseText(original)
  var pParsed = parseText(processed)
  return pParsed.map((token, tIndex) => {
    return token.startsWith('{') && token.endsWith('}') ? oParsed[tIndex] : token
  }).join('')
}

