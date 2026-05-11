/**
 * Lightweight syntax highlighter for TUI code blocks.
 *
 * Zero dependencies. Uses regex-based tokenization for common languages.
 * Produces ANSI-styled output via the theme system.
 *
 * Supported languages: typescript/javascript, python, rust, shell/bash,
 * yaml, json, markdown, html, css, go, java, c, cpp.
 */

import type { Theme } from "../theme.js";
import { truncateToWidth } from "./component.js";

// ── Token types ──────────────────────────────────────────────────────────

export type TokenType =
  | "keyword"
  | "string"
  | "comment"
  | "number"
  | "function"
  | "type"
  | "operator"
  | "punctuation"
  | "property"
  | "tag"
  | "attribute"
  | "plain";

interface Token {
  type: TokenType;
  text: string;
}

// ── Language patterns ────────────────────────────────────────────────────

interface LangPatterns {
  keywords: RegExp;
  strings: RegExp;
  comments: RegExp;
  numbers: RegExp;
  functions: RegExp;
  types: RegExp;
  operators: RegExp;
  properties: RegExp;
  tags: RegExp;
  attributes: RegExp;
}

// Generic patterns work for most C-like languages
const C_LIKE: LangPatterns = {
  keywords:
    /\b(?:const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|default|try|catch|finally|throw|new|this|class|extends|super|import|export|from|async|await|typeof|instanceof|in|of|void|delete|yield|static|get|set|constructor|interface|type|enum|namespace|module|declare|abstract|implements|private|protected|public|readonly|as|is|keyof|infer|unique|symbol|bigint|never|unknown|any|undefined|null|true|false)\b/,
  strings: /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.|\$\{[^}]*\})*`)/,
  comments: /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)/,
  numbers: /\b(?:0[xX][0-9a-fA-F]+|0[oO]?[0-7]+|0[bB][01]+|\d+\.?\d*(?:[eE][+-]?\d+)?)\b/,
  functions: /\b([a-zA-Z_$][\w$]*)\s*(?=\()/,
  types: /\b([A-Z][\w$]*)\b/,
  operators: /(?:[+\-*/%=<>!&|^~?:]+|=>|\+\+|--|\*\*|&&|\|\||<<|>>|>>>|===|!==|==|!=|<=|>=)/,
  properties: /\.(\w+)/,
  tags: /<(\/?)([a-zA-Z][\w-]*)/,
  attributes: /\b([a-zA-Z][\w-]*)\s*(?==)/,
};

const PYTHON: LangPatterns = {
  keywords:
    /\b(?:def|class|return|if|elif|else|for|while|break|continue|pass|try|except|finally|raise|import|from|as|with|yield|lambda|global|nonlocal|assert|del|and|or|not|in|is|None|True|False|async|await|self|cls)\b/,
  strings: /("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/,
  comments: /(#[^\n]*)/,
  numbers: /\b(?:0[xX][0-9a-fA-F]+|0[oO]?[0-7]+|0[bB][01]+|\d+\.?\d*(?:[eE][+-]?\d+)?)\b/,
  functions: /\b([a-zA-Z_][\w_]*)\s*(?=\()/,
  types: /\b([A-Z][\w_]*)\b/,
  operators: /(?:[+\-*/%=<>!&|^~]+|==|!=|<=|>=|\*\*|\/\/|:=)/,
  properties: /\.(\w+)/,
  tags: /<(\/?)([a-zA-Z][\w-]*)/,
  attributes: /\b([a-zA-Z][\w-]*)\s*(?==)/,
};

const RUST: LangPatterns = {
  keywords:
    /\b(?:fn|let|mut|const|static|type|struct|enum|trait|impl|for|if|else|match|while|loop|break|continue|return|pub|use|mod|crate|self|Self|super|async|await|move|where|unsafe|dyn|ref|box|as|in|Some|None|Ok|Err|true|false)\b/,
  strings: /("(?:[^"\\]|\\.)*"|b"(?:[^"\\]|\\.)*"|b'(?:[^'\\]|\\.)*')/,
  comments: /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)/,
  numbers: /\b(?:0[xX][0-9a-fA-F_]+|0[oO]?[0-7_]+|0[bB][01_]+|\d[\d_]*\.?\d*(?:[eE][+-]?\d+)?)\b/,
  functions: /\b([a-zA-Z_][\w_]*)\s*(?=\()/,
  types: /\b([A-Z][\w_]*)\b/,
  operators: /(?:[+\-*/%=<>!&|^~]+|=>|==|!=|<=|>=|\*\*|&&|\|\||<<|>>)/,
  properties: /\.(\w+)/,
  tags: /<(\/?)([a-zA-Z][\w-]*)/,
  attributes: /\b([a-zA-Z][\w-]*)\s*(?==)/,
};

const SHELL: LangPatterns = {
  keywords:
    /\b(?:if|then|else|elif|fi|for|while|do|done|case|esac|in|function|return|break|continue|exit|export|local|readonly|unset|shift|source|alias|eval|exec|trap|wait)\b/,
  strings: /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/,
  comments: /(#[^\n]*)/,
  numbers: /\b(?:\d+\.?\d*)\b/,
  functions: /\b([a-zA-Z_][\w_]*)\s*(?=\()/,
  types: /\b([A-Z][\w_]*)\b/,
  operators: /(?:[|;>&<]|&&|\|\||>>|<<|==|!=|=>)/,
  properties: /\$(\w+)/,
  tags: /<(\/?)([a-zA-Z][\w-]*)/,
  attributes: /\b([a-zA-Z][\w-]*)\s*(?==)/,
};

const YAML: LangPatterns = {
  keywords: /\b(?:true|false|null|yes|no|on|off)\b/,
  strings: /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/,
  comments: /(#[^\n]*)/,
  numbers: /\b(?:\d+\.?\d*(?:[eE][+-]?\d+)?)\b/,
  functions: /\b([a-zA-Z_][\w_]*)\s*(?=\()/,
  types: /\b([A-Z][\w_]*)\b/,
  operators: /(?:[:\-|,>]|=>)/,
  properties: /\b(\w+)\s*:/,
  tags: /<(\/?)([a-zA-Z][\w-]*)/,
  attributes: /\b([a-zA-Z][\w-]*)\s*(?==)/,
};

const JSON_LANG: LangPatterns = {
  keywords: /\b(?:true|false|null)\b/,
  strings: /("(?:[^"\\]|\\.)*")/,
  comments: /(?!)/, // no comments
  numbers: /\b(?:-?\d+\.?\d*(?:[eE][+-]?\d+)?)\b/,
  functions: /(?!)/,
  types: /(?!)/,
  operators: /[:{},\[\]]/,
  properties: /"(\w+)"\s*:/,
  tags: /(?!)/,
  attributes: /(?!)/,
};

const GO: LangPatterns = {
  keywords:
    /\b(?:func|var|const|type|struct|interface|map|chan|range|if|else|for|switch|case|default|break|continue|return|go|defer|select|package|import|nil|true|false|make|new|append|copy|delete|len|cap|panic|recover|print|println)\b/,
  strings: /("(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`)/,
  comments: /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)/,
  numbers: /\b(?:0[xX][0-9a-fA-F]+|0[oO]?[0-7]+|\d+\.?\d*(?:[eE][+-]?\d+)?)\b/,
  functions: /\b([a-zA-Z_][\w_]*)\s*(?=\()/,
  types: /\b([A-Z][\w_]*)\b/,
  operators: /(?:[+\-*/%=<>!&|^~]+|:=|==|!=|<=|>=|\+\+|--|&&|\|\||<<|>>)/,
  properties: /\.(\w+)/,
  tags: /<(\/?)([a-zA-Z][\w-]*)/,
  attributes: /\b([a-zA-Z][\w-]*)\s*(?==)/,
};

const SQL: LangPatterns = {
  keywords:
    /\b(?:SELECT|INSERT|UPDATE|DELETE|FROM|WHERE|JOIN|LEFT|RIGHT|INNER|OUTER|ON|GROUP|BY|ORDER|HAVING|LIMIT|OFFSET|UNION|ALL|DISTINCT|AS|AND|OR|NOT|IN|BETWEEN|LIKE|IS|NULL|TRUE|FALSE|CREATE|TABLE|DROP|ALTER|INDEX|VIEW|TRIGGER|PROCEDURE|FUNCTION|DATABASE|SCHEMA|PRIMARY|KEY|FOREIGN|REFERENCES|UNIQUE|CHECK|DEFAULT|AUTO_INCREMENT|INT|VARCHAR|TEXT|DATE|DATETIME|TIMESTAMP|BOOLEAN|DECIMAL|FLOAT|DOUBLE|CHAR|BLOB|JSON|ARRAY)\b/i,
  strings: /('(?:[^'\\]|\\.)*')/,
  comments: /(--[^\n]*|\/\*[\s\S]*?\*\/)/,
  numbers: /\b(?:\d+\.?\d*)\b/,
  functions: /\b([a-zA-Z_][\w_]*)\s*(?=\()/,
  types:
    /\b(?:INT|VARCHAR|TEXT|DATE|DATETIME|TIMESTAMP|BOOLEAN|DECIMAL|FLOAT|DOUBLE|CHAR|BLOB|JSON|ARRAY)\b/i,
  operators: /(?:[+\-*/%=<>!]+|AND|OR|NOT|IN|BETWEEN|LIKE|IS)/i,
  properties: /\.(\w+)/,
  tags: /(?!)/,
  attributes: /(?!)/,
};

const MARKDOWN: LangPatterns = {
  keywords: /\b(?:TODO|FIXME|NOTE|WARNING|IMPORTANT|HACK)\b/,
  strings: /(?!)/,
  comments: /(<!--[\s\S]*?-->)/,
  numbers: /\b(?:\d+\.?\d*)\b/,
  functions: /(?!)/,
  types: /(?!)/,
  operators: /(?!)/,
  properties: /(?!)/,
  tags: /(?!)/,
  attributes: /(?!)/,
};

function getPatterns(lang: string): LangPatterns | null {
  switch (lang.toLowerCase()) {
    case "typescript":
    case "javascript":
    case "ts":
    case "js":
    case "jsx":
    case "tsx":
      return C_LIKE;
    case "python":
    case "py":
      return PYTHON;
    case "rust":
    case "rs":
      return RUST;
    case "shell":
    case "bash":
    case "sh":
    case "zsh":
    case "fish":
      return SHELL;
    case "yaml":
    case "yml":
      return YAML;
    case "json":
      return JSON_LANG;
    case "go":
    case "golang":
      return GO;
    case "sql":
      return SQL;
    case "markdown":
    case "md":
      return MARKDOWN;
    default:
      return null;
  }
}

// ── Tokenizer ────────────────────────────────────────────────────────────

function tokenizeLine(line: string, patterns: LangPatterns | null): Token[] {
  if (!patterns) return [{ type: "plain", text: line }];

  const tokens: Token[] = [];
  let pos = 0;

  // Priority order for matching
  const matchers: { type: TokenType; regex: RegExp }[] = [
    { type: "comment", regex: patterns.comments },
    { type: "string", regex: patterns.strings },
    { type: "number", regex: patterns.numbers },
    { type: "keyword", regex: patterns.keywords },
    { type: "function", regex: patterns.functions },
    { type: "type", regex: patterns.types },
    { type: "operator", regex: patterns.operators },
    { type: "property", regex: patterns.properties },
    { type: "tag", regex: patterns.tags },
    { type: "attribute", regex: patterns.attributes },
  ];

  while (pos < line.length) {
    let bestMatch: { type: TokenType; text: string; end: number } | null = null;

    for (const { type, regex } of matchers) {
      regex.lastIndex = 0;
      const match = regex.exec(line.slice(pos));
      if (match && match.index === 0) {
        const text = match[0];
        if (!bestMatch || text.length > bestMatch.text.length) {
          bestMatch = { type, text, end: pos + text.length };
        }
      }
    }

    if (bestMatch) {
      tokens.push({ type: bestMatch.type, text: bestMatch.text });
      pos = bestMatch.end;
    } else {
      // No match — consume one character as plain
      tokens.push({ type: "plain", text: line[pos] });
      pos++;
    }
  }

  return tokens;
}

// ── Theme mapping ────────────────────────────────────────────────────────

const TOKEN_STYLE_MAP: Record<TokenType, string> = {
  keyword: "syntax.keyword",
  string: "syntax.string",
  comment: "syntax.comment",
  number: "syntax.number",
  function: "syntax.function",
  type: "syntax.type",
  operator: "syntax.operator",
  punctuation: "syntax.punctuation",
  property: "syntax.property",
  tag: "syntax.tag",
  attribute: "syntax.attribute",
  plain: "syntax.plain",
};

function styleToken(token: Token, theme: Theme): string {
  const styleName = TOKEN_STYLE_MAP[token.type];
  const resolved = theme.resolve(styleName);
  if (!resolved.prefix) return token.text;
  return `${resolved.prefix}${token.text}${resolved.reset}`;
}

// ── Public API ───────────────────────────────────────────────────────────

export interface HighlightOptions {
  /** Language identifier (e.g. "typescript", "python"). */
  language?: string;
  /** Whether to show line numbers. */
  lineNumbers?: boolean;
  /** Starting line number. */
  startLine?: number;
  /** Max visible width for content (excluding line numbers). */
  maxWidth?: number;
}

/**
 * Highlight a block of code and return styled lines.
 *
 * Detects markdown code fences automatically if the content starts with ```.
 */
export function highlightCode(
  code: string,
  theme: Theme,
  options: HighlightOptions = {},
): string[] {
  let content = code;
  let detectedLang: string | undefined;

  // Auto-detect fenced code block
  const fenceMatch = content.match(/^```(\w+)?\n?/);
  if (fenceMatch) {
    detectedLang = fenceMatch[1];
    content = content.slice(fenceMatch[0].length);
    // Strip trailing ```
    content = content.replace(/\n?```\s*$/, "");
  }

  const lang = options.language ?? detectedLang ?? "";
  const patterns = getPatterns(lang);
  const showLineNumbers = options.lineNumbers ?? true;
  const startLine = options.startLine ?? 1;
  const maxWidth = options.maxWidth ?? 80;

  const lines = content.split("\n");
  const lineNumWidth = String(startLine + lines.length - 1).length;
  const gutterWidth = showLineNumbers ? lineNumWidth + 2 : 0;
  const contentWidth = Math.max(1, maxWidth - gutterWidth);

  const dimStyle = theme.resolve("dim");
  const result: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = startLine + i;

    // Tokenize
    const tokens = tokenizeLine(line, patterns);
    const styledLine = tokens.map((t) => styleToken(t, theme)).join("");

    // Build line
    if (showLineNumbers) {
      const numStr = String(lineNum).padStart(lineNumWidth, " ");
      const gutter = `${dimStyle.prefix}${numStr} │${dimStyle.reset}`;
      const truncated = truncateToWidth(styledLine, contentWidth);
      result.push(`${gutter} ${truncated}`);
    } else {
      result.push(truncateToWidth(styledLine, contentWidth));
    }
  }

  return result;
}

/**
 * Check if content looks like a code block (fenced or indented).
 */
export function looksLikeCodeBlock(content: string): boolean {
  return /^```/.test(content.trim()) || /^ {4}/m.test(content);
}

/**
 * Extract language from a fenced code block header.
 */
export function extractLanguage(content: string): string | undefined {
  const match = content.trim().match(/^```(\w+)/);
  return match?.[1];
}
