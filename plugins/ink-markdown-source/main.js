const { Plugin } = require("obsidian");
const { Decoration, ViewPlugin } = require("@codemirror/view");

const MAX_DECORATED_DOC_LENGTH = 300000;
const JAVASCRIPT_LIKE_LANGUAGES = new Set(["cjs", "javascript", "js", "jsx", "mjs", "ts", "tsx", "typescript"]);
const JSON_LIKE_LANGUAGES = new Set(["json", "jsonc"]);
const SHELL_LIKE_LANGUAGES = new Set(["bash", "fish", "sh", "shell", "zsh"]);
const JS_KEYWORDS = new Set([
  "abstract",
  "as",
  "async",
  "await",
  "break",
  "case",
  "catch",
  "class",
  "const",
  "constructor",
  "continue",
  "debugger",
  "declare",
  "default",
  "delete",
  "do",
  "else",
  "enum",
  "export",
  "extends",
  "finally",
  "for",
  "from",
  "function",
  "get",
  "if",
  "implements",
  "import",
  "in",
  "infer",
  "instanceof",
  "interface",
  "keyof",
  "let",
  "module",
  "namespace",
  "new",
  "of",
  "private",
  "protected",
  "public",
  "readonly",
  "return",
  "satisfies",
  "set",
  "static",
  "super",
  "switch",
  "this",
  "throw",
  "try",
  "type",
  "typeof",
  "var",
  "void",
  "while",
  "with",
  "yield",
]);
const JS_KEYWORD_PATTERN = /\b(?:abstract|as|async|await|break|case|catch|class|const|constructor|continue|debugger|declare|default|delete|do|else|enum|export|extends|finally|for|from|function|get|if|implements|import|in|infer|instanceof|interface|keyof|let|module|namespace|new|of|private|protected|public|readonly|return|satisfies|set|static|super|switch|this|throw|try|type|typeof|var|void|while|with|yield)\b/g;

function mark(ranges, from, to, className) {
  if (to > from) {
    ranges.push(Decoration.mark({ class: className }).range(from, to));
  }
}

function line(ranges, at, className) {
  ranges.push(Decoration.line({ class: className }).range(at));
}

function decorateRegex(ranges, lineFrom, text, regex, className, groupIndex = 0) {
  regex.lastIndex = 0;
  for (let match; (match = regex.exec(text)); ) {
    const value = match[groupIndex];
    if (!value) {
      continue;
    }

    const prefixLength = groupIndex === 0 ? 0 : match[0].indexOf(value);
    const from = lineFrom + match.index + prefixLength;
    mark(ranges, from, from + value.length, className);

    if (match[0].length === 0) {
      regex.lastIndex += 1;
    }
  }
}

function decorateInlineMarkdown(ranges, lineFrom, text) {
  decorateRegex(ranges, lineFrom, text, /<!--.*?-->/g, "ink-cm-md-comment");
  decorateRegex(ranges, lineFrom, text, /`[^`\n]+`/g, "ink-cm-md-inline-code");
  decorateRegex(ranges, lineFrom, text, /!?\[[^\]\n]+\]\([^) \n]+(?:\s+"[^"]*")?\)/g, "ink-cm-md-link");
  decorateRegex(ranges, lineFrom, text, /!?\[\[[^\]\n]+\]\]/g, "ink-cm-md-link");
  decorateRegex(ranges, lineFrom, text, /(^|[\s([{])(#[-A-Za-z0-9_/]+)\b/g, "ink-cm-md-tag", 2);
  decorateRegex(ranges, lineFrom, text, /(\*\*|__|~~|==|\*|_)/g, "ink-cm-md-marker", 1);
}

function normalizeFenceLanguage(info) {
  const language = info.trim().split(/\s+/, 1)[0].replace(/[{}]/g, "").toLowerCase();
  const aliases = {
    javascript: "js",
    jsx: "jsx",
    node: "js",
    typescript: "ts",
    tsx: "tsx",
  };
  return aliases[language] || language;
}

function overlapsProtectedRange(protectedRanges, from, to) {
  return protectedRanges.some((range) => from < range.to && to > range.from);
}

function markCode(ranges, lineFrom, from, to, className, protectedRanges) {
  if (!overlapsProtectedRange(protectedRanges, from, to)) {
    mark(ranges, lineFrom + from, lineFrom + to, className);
  }
}

function decorateCodeRegex(ranges, lineFrom, text, regex, className, groupIndex, protectedRanges, filter) {
  regex.lastIndex = 0;
  for (let match; (match = regex.exec(text)); ) {
    const value = match[groupIndex];
    if (!value || (filter && !filter(value, match))) {
      continue;
    }

    const prefixLength = groupIndex === 0 ? 0 : match[0].indexOf(value);
    const from = match.index + prefixLength;
    markCode(ranges, lineFrom, from, from + value.length, className, protectedRanges);

    if (match[0].length === 0) {
      regex.lastIndex += 1;
    }
  }
}

function decorateStringsAndComments(ranges, lineFrom, text, commentStyle) {
  const protectedRanges = [];

  for (let index = 0; index < text.length; index += 1) {
    const current = text[index];
    const next = text[index + 1];

    if (commentStyle === "hash" && current === "#") {
      mark(ranges, lineFrom + index, lineFrom + text.length, "ink-cm-code-comment");
      protectedRanges.push({ from: index, to: text.length });
      break;
    }

    if (commentStyle !== "hash" && current === "/" && next === "/") {
      mark(ranges, lineFrom + index, lineFrom + text.length, "ink-cm-code-comment");
      protectedRanges.push({ from: index, to: text.length });
      break;
    }

    if (commentStyle !== "hash" && current === "/" && next === "*") {
      const end = text.indexOf("*/", index + 2);
      const to = end === -1 ? text.length : end + 2;
      mark(ranges, lineFrom + index, lineFrom + to, "ink-cm-code-comment");
      protectedRanges.push({ from: index, to });
      index = to - 1;
      continue;
    }

    if (current === "\"" || current === "'" || current === "`") {
      const quote = current;
      let to = index + 1;

      while (to < text.length) {
        if (text[to] === "\\") {
          to += 2;
          continue;
        }

        if (text[to] === quote) {
          to += 1;
          break;
        }

        to += 1;
      }

      mark(ranges, lineFrom + index, lineFrom + Math.min(to, text.length), "ink-cm-code-string");
      protectedRanges.push({ from: index, to: Math.min(to, text.length) });
      index = to - 1;
    }
  }

  return protectedRanges;
}

function decorateJavaScriptCode(ranges, lineFrom, text) {
  const protectedRanges = decorateStringsAndComments(ranges, lineFrom, text, "slash");

  decorateCodeRegex(ranges, lineFrom, text, JS_KEYWORD_PATTERN, "ink-cm-code-keyword", 0, protectedRanges);
  decorateCodeRegex(ranges, lineFrom, text, /\b(?:Infinity|NaN|false|null|true|undefined)\b/g, "ink-cm-code-constant", 0, protectedRanges);
  decorateCodeRegex(ranges, lineFrom, text, /\b(?:0x[\da-fA-F]+|\d+(?:\.\d+)?(?:e[+-]?\d+)?)\b/g, "ink-cm-code-number", 0, protectedRanges);
  decorateCodeRegex(ranges, lineFrom, text, /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g, "ink-cm-code-variable", 1, protectedRanges);
  decorateCodeRegex(ranges, lineFrom, text, /\b(?:function)\s+([A-Za-z_$][\w$]*)/g, "ink-cm-code-function", 1, protectedRanges);
  decorateCodeRegex(ranges, lineFrom, text, /\b(?:class|enum|interface|type)\s+([A-Za-z_$][\w$]*)/g, "ink-cm-code-type", 1, protectedRanges);
  decorateCodeRegex(ranges, lineFrom, text, /\b([A-Za-z_$][\w$]*)(?=\s*\()/g, "ink-cm-code-function", 1, protectedRanges, (value) => !JS_KEYWORDS.has(value));
  decorateCodeRegex(ranges, lineFrom, text, /\b([A-Z][A-Za-z0-9_$]*)\b/g, "ink-cm-code-type", 1, protectedRanges);
  decorateCodeRegex(ranges, lineFrom, text, /[+\-*/%=!<>|&?:]+/g, "ink-cm-code-operator", 0, protectedRanges);
}

function decorateJsonCode(ranges, lineFrom, text) {
  const protectedRanges = decorateStringsAndComments(ranges, lineFrom, text, "slash");

  decorateCodeRegex(ranges, lineFrom, text, /\b(?:false|null|true)\b/g, "ink-cm-code-constant", 0, protectedRanges);
  decorateCodeRegex(ranges, lineFrom, text, /\b-?\d+(?:\.\d+)?(?:e[+-]?\d+)?\b/gi, "ink-cm-code-number", 0, protectedRanges);
  decorateCodeRegex(ranges, lineFrom, text, /[{}[\],:]/g, "ink-cm-code-operator", 0, protectedRanges);
}

function decorateShellCode(ranges, lineFrom, text) {
  const protectedRanges = decorateStringsAndComments(ranges, lineFrom, text, "hash");

  decorateCodeRegex(ranges, lineFrom, text, /\b(?:case|do|done|elif|else|esac|export|fi|for|function|if|in|local|return|set|then|while)\b/g, "ink-cm-code-keyword", 0, protectedRanges);
  decorateCodeRegex(ranges, lineFrom, text, /(?:^|\s)([-]{1,2}[A-Za-z0-9][A-Za-z0-9-]*)/g, "ink-cm-code-constant", 1, protectedRanges);
  decorateCodeRegex(ranges, lineFrom, text, /\$[A-Za-z_][A-Za-z0-9_]*|\$\{[^}]+\}/g, "ink-cm-code-variable", 0, protectedRanges);
  decorateCodeRegex(ranges, lineFrom, text, /[|&;<>()]+/g, "ink-cm-code-operator", 0, protectedRanges);
}

function decorateGenericCode(ranges, lineFrom, text) {
  const protectedRanges = decorateStringsAndComments(ranges, lineFrom, text, "slash");

  decorateCodeRegex(ranges, lineFrom, text, /\b(?:false|null|true)\b/g, "ink-cm-code-constant", 0, protectedRanges);
  decorateCodeRegex(ranges, lineFrom, text, /\b-?\d+(?:\.\d+)?\b/g, "ink-cm-code-number", 0, protectedRanges);
}

function decorateCode(ranges, lineFrom, text, language) {
  if (JAVASCRIPT_LIKE_LANGUAGES.has(language)) {
    decorateJavaScriptCode(ranges, lineFrom, text);
  } else if (JSON_LIKE_LANGUAGES.has(language)) {
    decorateJsonCode(ranges, lineFrom, text);
  } else if (SHELL_LIKE_LANGUAGES.has(language)) {
    decorateShellCode(ranges, lineFrom, text);
  } else {
    decorateGenericCode(ranges, lineFrom, text);
  }
}

function buildDecorations(view) {
  const { doc } = view.state;
  if (doc.length > MAX_DECORATED_DOC_LENGTH) {
    return Decoration.set([]);
  }

  const ranges = [];
  let inFrontmatter = false;
  let frontmatterClosed = false;
  let inFence = false;
  let fenceChar = "";
  let fenceLength = 0;
  let fenceLanguage = "";

  for (let lineNumber = 1; lineNumber <= doc.lines; lineNumber += 1) {
    const docLine = doc.line(lineNumber);
    const text = docLine.text;
    const trimmed = text.trimStart();
    const indentLength = text.length - trimmed.length;

    if (lineNumber === 1 && trimmed === "---") {
      inFrontmatter = true;
      line(ranges, docLine.from, "ink-cm-md-frontmatter-line");
      mark(ranges, docLine.from + indentLength, docLine.to, "ink-cm-md-marker");
      continue;
    }

    if (inFrontmatter) {
      line(ranges, docLine.from, "ink-cm-md-frontmatter-line");

      const keyMatch = /^(\s*)([A-Za-z0-9_-]+)(\s*:)/.exec(text);
      if (keyMatch) {
        const keyFrom = docLine.from + keyMatch[1].length;
        mark(ranges, keyFrom, keyFrom + keyMatch[2].length, "ink-cm-md-frontmatter-key");
        mark(ranges, keyFrom + keyMatch[2].length, keyFrom + keyMatch[2].length + keyMatch[3].length, "ink-cm-md-marker");
      }

      if (!frontmatterClosed && lineNumber > 1 && trimmed === "---") {
        frontmatterClosed = true;
        inFrontmatter = false;
        mark(ranges, docLine.from + indentLength, docLine.to, "ink-cm-md-marker");
      }

      continue;
    }

    const fenceMatch = /^(\s*)(`{3,}|~{3,})(.*)$/.exec(text);
    if (fenceMatch) {
      const fence = fenceMatch[2];
      const fenceFrom = docLine.from + fenceMatch[1].length;
      const infoFrom = fenceFrom + fence.length;
      const closesFence = inFence && fence[0] === fenceChar && fence.length >= fenceLength;
      const opensFence = !inFence;
      line(ranges, docLine.from, `ink-cm-md-code-fence-line ${opensFence ? "ink-cm-md-code-block-top" : closesFence ? "ink-cm-md-code-block-bottom" : ""}`);
      mark(ranges, fenceFrom, infoFrom, "ink-cm-md-marker");
      mark(ranges, infoFrom, docLine.to, "ink-cm-md-code-lang");

      if (closesFence) {
        inFence = false;
        fenceLanguage = "";
      } else if (!inFence) {
        inFence = true;
        fenceChar = fence[0];
        fenceLength = fence.length;
        fenceLanguage = normalizeFenceLanguage(fenceMatch[3]);
      }

      continue;
    }

    if (inFence) {
      line(ranges, docLine.from, "ink-cm-md-code-line");
      decorateCode(ranges, docLine.from, text, fenceLanguage);
      continue;
    }

    const headingMatch = /^(#{1,6})(\s+.*)?$/.exec(text);
    if (headingMatch) {
      const level = headingMatch[1].length;
      line(ranges, docLine.from, `ink-cm-md-heading-line ink-cm-md-heading-line-${level}`);
      mark(ranges, docLine.from, docLine.from + level, "ink-cm-md-marker ink-cm-md-heading-marker");
      if (headingMatch[2]) {
        const textFrom = docLine.from + level;
        mark(ranges, textFrom, docLine.to, `ink-cm-md-heading ink-cm-md-heading-${level}`);
      }
      continue;
    }

    if (/^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(text)) {
      line(ranges, docLine.from, "ink-cm-md-hr-line");
      mark(ranges, docLine.from + indentLength, docLine.to, "ink-cm-md-marker ink-cm-md-hr");
      continue;
    }

    const quoteMatch = /^(\s*>+\s?)/.exec(text);
    if (quoteMatch) {
      line(ranges, docLine.from, "ink-cm-md-quote-line");
      mark(ranges, docLine.from, docLine.from + quoteMatch[1].length, "ink-cm-md-marker ink-cm-md-quote-marker");
    }

    const taskMatch = /^(\s*)([-+*]|\d+[.)])(\s+)(\[[ xX-]\])/.exec(text);
    if (taskMatch) {
      const markerFrom = docLine.from + taskMatch[1].length;
      const checkboxFrom = markerFrom + taskMatch[2].length + taskMatch[3].length;
      mark(ranges, markerFrom, markerFrom + taskMatch[2].length, "ink-cm-md-marker ink-cm-md-list-marker");
      mark(ranges, checkboxFrom, checkboxFrom + taskMatch[4].length, taskMatch[4].toLowerCase() === "[x]" ? "ink-cm-md-checkbox ink-cm-md-checkbox-done" : "ink-cm-md-checkbox");
    } else {
      const listMatch = /^(\s*)([-+*]|\d+[.)])(\s+)/.exec(text);
      if (listMatch) {
        const markerFrom = docLine.from + listMatch[1].length;
        mark(ranges, markerFrom, markerFrom + listMatch[2].length, "ink-cm-md-marker ink-cm-md-list-marker");
      }
    }

    if (text.includes("|")) {
      const nextLine = lineNumber < doc.lines ? doc.line(lineNumber + 1).text : "";
      const isTableRule = /^\s*\|?[\s:-]+\|[\s|:-]*$/.test(text);
      const isTableHead = !isTableRule && /^\s*\|?[\s:-]+\|[\s|:-]*$/.test(nextLine);
      line(ranges, docLine.from, isTableRule ? "ink-cm-md-table-line ink-cm-md-table-rule-line" : isTableHead ? "ink-cm-md-table-line ink-cm-md-table-head-line" : "ink-cm-md-table-line");
      decorateRegex(ranges, docLine.from, text, /\|/g, "ink-cm-md-table-pipe");
    }

    decorateInlineMarkdown(ranges, docLine.from, text);
  }

  return Decoration.set(ranges, true);
}

const markdownSourceHighlighter = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.decorations = buildDecorations(view);
    }

    update(update) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  {
    decorations: (plugin) => plugin.decorations,
  }
);

module.exports = class InkMarkdownSourcePlugin extends Plugin {
  onload() {
    this.registerEditorExtension(markdownSourceHighlighter);
  }
};
