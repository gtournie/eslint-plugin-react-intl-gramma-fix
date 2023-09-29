const grammaFix = require('./gramma-fix.js')

const CONSOLE_BLUE = '\x1B[34m'
const CONSOLE_RED = '\x1B[31m'

function replaceDefaultMessage(prop, context) {
  const type = (prop.value || {}).type;
  if (type === 'Literal') {
    let value = prop.value.value

    let { fix, matches } = grammaFix(value, 'fr-FR')

    if (value !== fix) {
      const quote = prop.value.raw.charAt(0)
      const quotedFix = quote + fix.replace(/\n/g, '\\n') + quote
      context.report({
        node: prop.value,
        message: `${CONSOLE_RED}"${value}"\n${matches.map(x => ' - ' + x.message).join('\n') + '\n=>' + CONSOLE_BLUE + ' ' + quotedFix}\n`,
        fix: (fixer) => fixer.replaceText(prop.value, quotedFix)
      })
    }
  }
  if (type === 'TemplateLiteral') {
    let temp = prop.value;
    if (temp.expressions.length > 0) return
    let value = temp.quasis[0].value.raw

    let { fix, matches } = grammaFix(value, 'fr-FR')

    if (value !== fix) {
      context.report({
        node: temp.quasis[0],
        message: CONSOLE_RED + `"${value.split(/\n/g).join("\n" + CONSOLE_RED)}"\n - ${matches.map(x => x.message).join('\n - ') + '\n=>' + CONSOLE_BLUE + ' `' + fix.split(/\n/g).join("\n" + CONSOLE_BLUE) + "`\n"}`,
        fix: (fixer) => fixer.replaceText(temp.quasis[0], "`" + fix + "`")
      })
    }
  }
}

function searchInFormatMessage(node, context) {
  const callee = node.callee
  if (callee.type !== 'MemberExpression') return
  if (callee.object.name !== "intl" || callee.property.name !== "formatMessage") return
  if (!node.arguments.length || node.arguments[0].type !== 'ObjectExpression') return

  let firstArg = node.arguments[0]
  let prop = firstArg.properties.find(p => (p.key || {}).name === 'defaultMessage');
  if (!prop) return

  replaceDefaultMessage(prop, context)
}

function searchInDefineMessages(node, context) {
  const callee = node.callee
  if (callee.name !== "defineMessages") return
  if (!node.arguments.length || node.arguments[0].type !== 'ObjectExpression') return

  node.arguments[0].properties.forEach(prop => {
    if (prop.value && prop.value.type === 'ObjectExpression') {
      let value = (prop.value.properties || []).find(x => x.key && x.key.name === 'defaultMessage');
      if (!value) return;

      replaceDefaultMessage(value, context)
    }
  })
}


module.exports = {
  rules: {
    "gramma-fix": {
      create: function (context) {
        return {
          CallExpression(node) {
            searchInFormatMessage(node, context);
            searchInDefineMessages(node, context);
          },
        }
      },
    },
  },
}

