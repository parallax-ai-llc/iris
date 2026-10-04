/**
 * Restricted condition-expression language for user-authored predicates
 * (`UTIL_ROUTER` route conditions, `UTIL_FILTER` condition).
 *
 * Why this exists: these conditions used to be evaluated with `new Function`,
 * which hands the workflow author the full JavaScript runtime. On the shared
 * cloud engine that is remote code execution (read `process.env`, call
 * `fetch`, …). The engine therefore parses the expression itself and walks
 * the resulting tree with an allow-list evaluator. No code is ever compiled.
 *
 * Supported surface (a strict subset of JavaScript expression syntax):
 *   - literals: numbers, 'single' / "double" quoted strings, true, false,
 *     null, undefined, regex literals (`/pattern/flags`)
 *   - identifiers from the caller-supplied scope (`input`, `variables`)
 *   - property access `a.b`, `a?.b`, `a[expr]`, `a?.[expr]`
 *   - operators: `! - + typeof`, `* / %`, `+ -`, `< <= > >=`,
 *     `== != === !==`, `&&`, `||`, `??`, `cond ? a : b`, parentheses
 *   - calls, allow-listed only:
 *       globals   String() Number() Boolean() parseInt() parseFloat()
 *                 isNaN() isFinite()
 *       namespaces Math.*  Array.isArray  Object.keys/values/entries
 *                 JSON.stringify/parse
 *       methods   on strings / arrays / numbers / regexes (see METHODS)
 *
 * Deliberately unsupported: assignment, `new`, `this`, arrow/function
 * literals, template literals, `in` / `instanceof`, comma expressions,
 * reading `__proto__` / `constructor` / `prototype`, and calling anything
 * that is not on the allow-list. Property reads on plain objects only return
 * own properties, and never return functions.
 *
 * Any violation throws `ExpressionError`. Callers decide whether that means
 * "condition is false" (runtime) or "reject the workflow" (validation).
 */

// ─── Public API ──────────────────────────────────────────────────────────────

export type ExpressionScope = Record<string, unknown>;

export class ExpressionError extends Error {
  readonly position: number | undefined;

  constructor(message: string, position?: number) {
    super(message);
    this.name = 'ExpressionError';
    this.position = position;
  }
}

/** Longest expression source the parser accepts. */
export const MAX_EXPRESSION_LENGTH = 2000;

/** Identifiers a condition may reference when the caller does not say. */
export const DEFAULT_EXPRESSION_IDENTIFIERS: readonly string[] = [
  'input',
  'variables',
];

/**
 * Parse `source` and report the first syntax / allow-list violation, or
 * `null` when the expression is well-formed. Does not evaluate anything.
 *
 * Besides syntax this statically rejects unknown identifiers (anything not
 * in `identifiers`, a namespace or a global function) and method names that
 * no receiver type allows, so a typo such as `input.some(...)` or
 * `Date.now()` is reported at save time instead of silently reading as
 * "false" at run time.
 */
export function validateExpression(
  source: string,
  identifiers: readonly string[] = DEFAULT_EXPRESSION_IDENTIFIERS
): string | null {
  try {
    const ast = parseCached(source);
    checkStatic(ast, new Set(identifiers));
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

/** Evaluate `source` against `scope` and return the raw value. */
export function evaluateExpression(
  source: string,
  scope: ExpressionScope
): unknown {
  const ast = parseCached(source);
  return new Evaluator(scope).eval(ast);
}

/** Evaluate `source` against `scope` and coerce the result to a boolean. */
export function evaluateCondition(
  source: string,
  scope: ExpressionScope
): boolean {
  return Boolean(evaluateExpression(source, scope));
}

// ─── Limits ──────────────────────────────────────────────────────────────────

const MAX_DEPTH = 40;
const MAX_REGEX_SOURCE_LENGTH = 256;
/** Longest string a regex may scan (`test`, `match`, `replace`, `split`, …). */
const MAX_REGEX_SUBJECT_LENGTH = 100_000;
/** Longest string an expression may build (pad/concat/replace/`+`). */
const MAX_STRING_LENGTH = 1_000_000;
/** Longest array an expression may build (concat/flat/split). */
const MAX_ARRAY_LENGTH = 100_000;
const MAX_CALL_ARGS = 8;
const AST_CACHE_LIMIT = 500;

/**
 * Quantified group that itself contains a quantifier: `(a+)+`, `(\d*)*`,
 * `(x+){2,}`. These are the classic catastrophic-backtracking shapes and the
 * subject-length cap alone does not bound them (24 chars already cost tens
 * of milliseconds, each extra pair of chars roughly quadruples it).
 */
const NESTED_QUANTIFIER =
  /\((?:[^()\\]|\\.)*(?:[+*]|\{\d*,?\d*\})(?:[^()\\]|\\.)*\)(?:[+*]|\{\d*,?\d*\})/;

// ─── Tokenizer ───────────────────────────────────────────────────────────────

type TokenType = 'num' | 'str' | 'ident' | 'punct' | 'regex' | 'eof';

interface Token {
  type: TokenType;
  value: string;
  pos: number;
  /** Regex tokens only. */
  flags?: string;
}

const RESERVED = new Set([
  'new',
  'function',
  'this',
  'class',
  'import',
  'export',
  'delete',
  'void',
  'in',
  'instanceof',
  'await',
  'yield',
  'async',
  'let',
  'var',
  'const',
  'return',
  'if',
  'else',
  'for',
  'while',
  'do',
  'switch',
  'case',
  'try',
  'catch',
  'finally',
  'throw',
  'with',
  'super',
  'arguments',
  'eval',
  'debugger',
  'globalThis',
  'window',
  'self',
  'process',
  'require',
]);

const MULTI_CHAR_PUNCT = [
  '===',
  '!==',
  '**',
  '?.',
  '??',
  '&&',
  '||',
  '==',
  '!=',
  '<=',
  '>=',
  '=>',
  '++',
  '--',
  '+=',
  '-=',
  '*=',
  '/=',
];
const SINGLE_CHAR_PUNCT = new Set('()[].,?:!+-*/%<>=&|~^;{}');

const isIdentStart = (ch: string): boolean => /[A-Za-z_$]/.test(ch);
const isIdentPart = (ch: string): boolean => /[A-Za-z0-9_$]/.test(ch);
const isDigit = (ch: string): boolean => ch >= '0' && ch <= '9';

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const n = src.length;

  const prevAllowsRegex = (): boolean => {
    const prev = tokens[tokens.length - 1];
    if (!prev) return true;
    if (prev.type === 'punct') return prev.value !== ')' && prev.value !== ']';
    return false;
  };

  while (i < n) {
    const ch = src[i];

    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i++;
      continue;
    }

    // Numbers: 12, 1.5, .5, 1e3
    if (isDigit(ch) || (ch === '.' && i + 1 < n && isDigit(src[i + 1]))) {
      const start = i;
      while (i < n && isDigit(src[i])) i++;
      if (src[i] === '.') {
        i++;
        while (i < n && isDigit(src[i])) i++;
      }
      if (src[i] === 'e' || src[i] === 'E') {
        let j = i + 1;
        if (src[j] === '+' || src[j] === '-') j++;
        if (isDigit(src[j] ?? '')) {
          i = j;
          while (i < n && isDigit(src[i])) i++;
        }
      }
      if (i < n && isIdentStart(src[i])) {
        throw new ExpressionError(`Unexpected character "${src[i]}" after number`, i);
      }
      tokens.push({ type: 'num', value: src.slice(start, i), pos: start });
      continue;
    }

    // Strings
    if (ch === "'" || ch === '"') {
      const quote = ch;
      const start = i;
      i++;
      let out = '';
      let closed = false;
      while (i < n) {
        const c = src[i];
        if (c === '\\') {
          const next = src[i + 1];
          if (next === undefined) break;
          switch (next) {
            case 'n':
              out += '\n';
              break;
            case 't':
              out += '\t';
              break;
            case 'r':
              out += '\r';
              break;
            case 'b':
              out += '\b';
              break;
            case 'f':
              out += '\f';
              break;
            case 'v':
              out += '\v';
              break;
            case '0':
              out += '\0';
              break;
            case 'x': {
              const hex = src.slice(i + 2, i + 4);
              if (!/^[0-9a-fA-F]{2}$/.test(hex)) {
                throw new ExpressionError('Invalid \\x escape in string', i);
              }
              out += String.fromCharCode(parseInt(hex, 16));
              i += 2;
              break;
            }
            case 'u': {
              const hex = src.slice(i + 2, i + 6);
              if (!/^[0-9a-fA-F]{4}$/.test(hex)) {
                throw new ExpressionError('Invalid \\u escape in string', i);
              }
              out += String.fromCharCode(parseInt(hex, 16));
              i += 4;
              break;
            }
            default:
              out += next;
          }
          i += 2;
          continue;
        }
        if (c === quote) {
          closed = true;
          i++;
          break;
        }
        out += c;
        i++;
      }
      if (!closed) throw new ExpressionError('Unterminated string', start);
      tokens.push({ type: 'str', value: out, pos: start });
      continue;
    }

    if (ch === '`') {
      throw new ExpressionError('Template literals are not supported', i);
    }

    // Identifiers / keywords. A reserved word is still fine as a property
    // name right after `.` / `?.` (`input.in`, `input.self`).
    if (isIdentStart(ch)) {
      const start = i;
      while (i < n && isIdentPart(src[i])) i++;
      const word = src.slice(start, i);
      const prev = tokens[tokens.length - 1];
      const isPropertyName =
        prev?.type === 'punct' && (prev.value === '.' || prev.value === '?.');
      if (!isPropertyName && RESERVED.has(word)) {
        throw new ExpressionError(`"${word}" is not allowed in conditions`, start);
      }
      tokens.push({ type: 'ident', value: word, pos: start });
      continue;
    }

    // Regex literal
    if (ch === '/' && prevAllowsRegex()) {
      const start = i;
      i++;
      let body = '';
      let inClass = false;
      let closed = false;
      while (i < n) {
        const c = src[i];
        if (c === '\\') {
          if (i + 1 >= n) break;
          body += c + src[i + 1];
          i += 2;
          continue;
        }
        if (c === '\n') break;
        if (c === '[') inClass = true;
        else if (c === ']') inClass = false;
        else if (c === '/' && !inClass) {
          closed = true;
          i++;
          break;
        }
        body += c;
        i++;
      }
      if (!closed) throw new ExpressionError('Unterminated regular expression', start);
      const flagStart = i;
      while (i < n && isIdentPart(src[i])) i++;
      const flags = src.slice(flagStart, i);
      if (!/^[gimsuy]*$/.test(flags) || new Set(flags).size !== flags.length) {
        throw new ExpressionError(`Invalid regular expression flags "${flags}"`, flagStart);
      }
      if (body.length > MAX_REGEX_SOURCE_LENGTH) {
        throw new ExpressionError(
          `Regular expression is longer than ${MAX_REGEX_SOURCE_LENGTH} characters`,
          start
        );
      }
      try {
        new RegExp(body, flags);
      } catch (err) {
        throw new ExpressionError(
          `Invalid regular expression: ${err instanceof Error ? err.message : String(err)}`,
          start
        );
      }
      if (NESTED_QUANTIFIER.test(body)) {
        throw new ExpressionError(
          'Nested quantifiers such as "(a+)+" are not allowed in regular expressions',
          start
        );
      }
      tokens.push({ type: 'regex', value: body, flags, pos: start });
      continue;
    }

    // Punctuation
    let matched: string | null = null;
    for (const p of MULTI_CHAR_PUNCT) {
      if (src.startsWith(p, i)) {
        matched = p;
        break;
      }
    }
    // `a?.5:b` — `?.` followed by a digit is the ternary, not optional chaining.
    if (matched === '?.' && isDigit(src[i + 2] ?? '')) matched = null;
    if (!matched) {
      if (!SINGLE_CHAR_PUNCT.has(ch)) {
        throw new ExpressionError(`Unexpected character "${ch}"`, i);
      }
      matched = ch;
    }
    tokens.push({ type: 'punct', value: matched, pos: i });
    i += matched.length;
  }

  tokens.push({ type: 'eof', value: '', pos: n });
  return tokens;
}

// ─── AST ─────────────────────────────────────────────────────────────────────

type Node =
  | { kind: 'literal'; value: unknown }
  | { kind: 'regex'; source: string; flags: string }
  /** Parenthesised expression; ends an optional chain like in JS. */
  | { kind: 'group'; expr: Node }
  | { kind: 'ident'; name: string; pos: number }
  | {
      kind: 'member';
      object: Node;
      property: Node;
      computed: boolean;
      optional: boolean;
      pos: number;
    }
  | { kind: 'call'; callee: Node; args: Node[]; optional: boolean; pos: number }
  | { kind: 'unary'; op: string; arg: Node; pos: number }
  | { kind: 'binary'; op: string; left: Node; right: Node; pos: number }
  | { kind: 'logical'; op: '&&' | '||' | '??'; left: Node; right: Node }
  | { kind: 'conditional'; test: Node; consequent: Node; alternate: Node };

// ─── Parser (precedence climbing) ────────────────────────────────────────────

const BINARY_PRECEDENCE: Record<string, number> = {
  '??': 1,
  '||': 2,
  '&&': 3,
  '==': 4,
  '!=': 4,
  '===': 4,
  '!==': 4,
  '<': 5,
  '<=': 5,
  '>': 5,
  '>=': 5,
  '+': 6,
  '-': 6,
  '*': 7,
  '/': 7,
  '%': 7,
};

const NOT_ALLOWED_PUNCT: Record<string, string> = {
  '=': 'Assignment is not allowed in conditions',
  '=>': 'Arrow functions are not allowed in conditions',
  '++': 'Increment is not allowed in conditions',
  '--': 'Decrement is not allowed in conditions',
  '+=': 'Assignment is not allowed in conditions',
  '-=': 'Assignment is not allowed in conditions',
  '*=': 'Assignment is not allowed in conditions',
  '/=': 'Assignment is not allowed in conditions',
  '**': 'Exponentiation is not supported; use Math.pow()',
  '&': 'Bitwise operators are not supported',
  '|': 'Bitwise operators are not supported',
  '^': 'Bitwise operators are not supported',
  '~': 'Bitwise operators are not supported',
  ';': 'Only a single expression is allowed',
  '{': 'Object literals are not supported',
  '}': 'Object literals are not supported',
  ',': 'Comma expressions are not allowed',
};

class Parser {
  private pos = 0;
  private depth = 0;

  constructor(private readonly tokens: Token[]) {}

  parse(): Node {
    const node = this.parseExpression();
    const t = this.peek();
    if (t.type !== 'eof') {
      throw new ExpressionError(this.unexpected(t), t.pos);
    }
    return node;
  }

  private peek(): Token {
    return this.tokens[this.pos];
  }

  private next(): Token {
    return this.tokens[this.pos++];
  }

  private isPunct(value: string): boolean {
    const t = this.peek();
    return t.type === 'punct' && t.value === value;
  }

  private expectPunct(value: string): Token {
    const t = this.next();
    if (t.type !== 'punct' || t.value !== value) {
      throw new ExpressionError(`Expected "${value}" but found ${this.describe(t)}`, t.pos);
    }
    return t;
  }

  private describe(t: Token): string {
    if (t.type === 'eof') return 'end of expression';
    return `"${t.value}"`;
  }

  private unexpected(t: Token): string {
    if (t.type === 'punct' && NOT_ALLOWED_PUNCT[t.value]) {
      return NOT_ALLOWED_PUNCT[t.value];
    }
    return `Unexpected ${this.describe(t)}`;
  }

  private enter(): void {
    if (++this.depth > MAX_DEPTH) {
      throw new ExpressionError(`Expression is nested deeper than ${MAX_DEPTH} levels`);
    }
  }

  private leave(): void {
    this.depth--;
  }

  private parseExpression(): Node {
    this.enter();
    try {
      return this.parseConditional();
    } finally {
      this.leave();
    }
  }

  private parseConditional(): Node {
    const test = this.parseBinary(1);
    if (!this.isPunct('?')) return test;
    this.next();
    const consequent = this.parseExpression();
    this.expectPunct(':');
    const alternate = this.parseExpression();
    return { kind: 'conditional', test, consequent, alternate };
  }

  private parseBinary(minPrecedence: number): Node {
    let left = this.parseUnary();
    for (;;) {
      const t = this.peek();
      if (t.type !== 'punct') break;
      const prec = BINARY_PRECEDENCE[t.value];
      if (prec === undefined || prec < minPrecedence) break;
      this.next();
      this.enter();
      try {
        const right = this.parseBinary(prec + 1);
        if (t.value === '&&' || t.value === '||' || t.value === '??') {
          left = { kind: 'logical', op: t.value, left, right };
        } else {
          left = { kind: 'binary', op: t.value, left, right, pos: t.pos };
        }
      } finally {
        this.leave();
      }
    }
    return left;
  }

  private parseUnary(): Node {
    const t = this.peek();
    if (t.type === 'punct' && (t.value === '!' || t.value === '-' || t.value === '+')) {
      this.next();
      this.enter();
      try {
        const arg = this.parseUnary();
        return { kind: 'unary', op: t.value, arg, pos: t.pos };
      } finally {
        this.leave();
      }
    }
    if (t.type === 'ident' && t.value === 'typeof') {
      this.next();
      this.enter();
      try {
        const arg = this.parseUnary();
        return { kind: 'unary', op: 'typeof', arg, pos: t.pos };
      } finally {
        this.leave();
      }
    }
    return this.parsePostfix();
  }

  private parsePostfix(): Node {
    let node = this.parsePrimary();
    for (;;) {
      const t = this.peek();
      if (t.type !== 'punct') break;

      if (t.value === '.' || t.value === '?.') {
        const optional = t.value === '?.';
        this.next();
        if (optional && this.isPunct('[')) {
          this.next();
          const property = this.parseExpression();
          this.expectPunct(']');
          node = { kind: 'member', object: node, property, computed: true, optional, pos: t.pos };
          continue;
        }
        if (optional && this.isPunct('(')) {
          node = this.parseCall(node, true, t.pos);
          continue;
        }
        const name = this.next();
        if (name.type !== 'ident') {
          throw new ExpressionError(
            `Expected a property name after "${t.value}" but found ${this.describe(name)}`,
            name.pos
          );
        }
        node = {
          kind: 'member',
          object: node,
          property: { kind: 'literal', value: name.value },
          computed: false,
          optional,
          pos: t.pos,
        };
        continue;
      }

      if (t.value === '[') {
        this.next();
        const property = this.parseExpression();
        this.expectPunct(']');
        node = { kind: 'member', object: node, property, computed: true, optional: false, pos: t.pos };
        continue;
      }

      if (t.value === '(') {
        node = this.parseCall(node, false, t.pos);
        continue;
      }

      break;
    }
    return node;
  }

  private parseCall(callee: Node, optional: boolean, pos: number): Node {
    if (callee.kind !== 'ident' && callee.kind !== 'member') {
      throw new ExpressionError('Only named functions and methods can be called', pos);
    }
    this.expectPunct('(');
    const args: Node[] = [];
    if (!this.isPunct(')')) {
      for (;;) {
        args.push(this.parseExpression());
        if (args.length > MAX_CALL_ARGS) {
          throw new ExpressionError(`Calls may take at most ${MAX_CALL_ARGS} arguments`, pos);
        }
        if (this.isPunct(',')) {
          this.next();
          continue;
        }
        break;
      }
    }
    this.expectPunct(')');
    return { kind: 'call', callee, args, optional, pos };
  }

  private parsePrimary(): Node {
    const t = this.next();
    switch (t.type) {
      case 'num': {
        const value = Number(t.value);
        if (!Number.isFinite(value)) {
          throw new ExpressionError(`Invalid number "${t.value}"`, t.pos);
        }
        return { kind: 'literal', value };
      }
      case 'str':
        return { kind: 'literal', value: t.value };
      case 'regex':
        return { kind: 'regex', source: t.value, flags: t.flags ?? '' };
      case 'ident':
        switch (t.value) {
          case 'true':
            return { kind: 'literal', value: true };
          case 'false':
            return { kind: 'literal', value: false };
          case 'null':
            return { kind: 'literal', value: null };
          case 'undefined':
            return { kind: 'literal', value: undefined };
          case 'NaN':
            return { kind: 'literal', value: NaN };
          case 'Infinity':
            return { kind: 'literal', value: Infinity };
          case 'typeof':
            throw new ExpressionError('"typeof" needs an operand', t.pos);
          default:
            return { kind: 'ident', name: t.value, pos: t.pos };
        }
      case 'punct':
        if (t.value === '(') {
          const inner = this.parseExpression();
          this.expectPunct(')');
          return { kind: 'group', expr: inner };
        }
        if (t.value === '[') {
          throw new ExpressionError('Array literals are not supported', t.pos);
        }
        throw new ExpressionError(this.unexpected(t), t.pos);
      case 'eof':
        throw new ExpressionError('Expression is empty or ends unexpectedly', t.pos);
      default:
        throw new ExpressionError(this.unexpected(t), t.pos);
    }
  }
}

// ─── AST cache ───────────────────────────────────────────────────────────────

const astCache = new Map<string, Node>();

function parseCached(source: string): Node {
  if (typeof source !== 'string') {
    throw new ExpressionError('Condition must be a string');
  }
  const trimmed = source.trim();
  if (!trimmed) throw new ExpressionError('Condition is empty');
  if (trimmed.length > MAX_EXPRESSION_LENGTH) {
    throw new ExpressionError(
      `Condition is longer than ${MAX_EXPRESSION_LENGTH} characters`
    );
  }
  const cached = astCache.get(trimmed);
  if (cached) return cached;
  const ast = new Parser(tokenize(trimmed)).parse();
  if (astCache.size >= AST_CACHE_LIMIT) {
    const oldest = astCache.keys().next().value;
    if (oldest !== undefined) astCache.delete(oldest);
  }
  astCache.set(trimmed, ast);
  return ast;
}

// ─── Evaluator ───────────────────────────────────────────────────────────────

const FORBIDDEN_KEYS = new Set([
  '__proto__',
  'constructor',
  'prototype',
  '__defineGetter__',
  '__defineSetter__',
  '__lookupGetter__',
  '__lookupSetter__',
]);

type AnyFn = (...args: unknown[]) => unknown;

/**
 * Allow-list tables are prototype-less so a lookup like `table['constructor']`
 * or `table['valueOf']` can never fall through to `Object.prototype`.
 */
function nullProto<T extends object>(entries: T): T {
  return Object.assign(Object.create(null) as T, entries);
}

const own = (table: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(table, key);

/** Global functions callable by bare name. */
const GLOBAL_FUNCTIONS: Record<string, AnyFn> = nullProto({
  String: v => String(v),
  Number: v => Number(v),
  Boolean: v => Boolean(v),
  parseInt: (v, radix) => parseInt(String(v), radix as number | undefined),
  parseFloat: v => parseFloat(String(v)),
  isNaN: v => Number.isNaN(Number(v)),
  isFinite: v => Number.isFinite(Number(v)),
});

/** Namespaces whose listed members may be read or called. */
const NAMESPACES: Record<string, Record<string, unknown>> = nullProto({
  Math: nullProto({
    abs: Math.abs,
    min: Math.min,
    max: Math.max,
    floor: Math.floor,
    ceil: Math.ceil,
    round: Math.round,
    trunc: Math.trunc,
    sqrt: Math.sqrt,
    pow: Math.pow,
    sign: Math.sign,
    PI: Math.PI,
  }),
  Array: nullProto({
    isArray: Array.isArray,
  }),
  Object: nullProto({
    keys: (v: unknown) => (isPlainObjectLike(v) ? Object.keys(v as object) : []),
    values: (v: unknown) => (isPlainObjectLike(v) ? Object.values(v as object) : []),
    entries: (v: unknown) => (isPlainObjectLike(v) ? Object.entries(v as object) : []),
  }),
  JSON: nullProto({
    stringify: (v: unknown) => JSON.stringify(v),
    parse: (v: unknown) => JSON.parse(String(v)),
  }),
  Number: nullProto({
    isInteger: Number.isInteger,
    isFinite: Number.isFinite,
    isNaN: Number.isNaN,
  }),
});

type MethodTable = Record<string, AnyFn>;

const stringProto = String.prototype as unknown as Record<string, AnyFn>;
const arrayProto = Array.prototype as unknown as Record<string, AnyFn>;
const numberProto = Number.prototype as unknown as Record<string, AnyFn>;

const pick = (proto: Record<string, AnyFn>, names: string[]): MethodTable => {
  const table: MethodTable = Object.create(null);
  for (const name of names) {
    const fn = proto[name];
    if (typeof fn === 'function') table[name] = fn;
  }
  return table;
};

/** Allow-listed instance methods, keyed by receiver kind. */
const METHODS: Record<'string' | 'array' | 'number' | 'regex', MethodTable> = nullProto({
  string: pick(stringProto, [
    'includes',
    'startsWith',
    'endsWith',
    'indexOf',
    'lastIndexOf',
    'toLowerCase',
    'toUpperCase',
    'trim',
    'trimStart',
    'trimEnd',
    'slice',
    'substring',
    'split',
    'charAt',
    'at',
    'replace',
    'replaceAll',
    'match',
    'search',
    'padStart',
    'padEnd',
    'concat',
    'localeCompare',
    'toString',
  ]),
  array: pick(arrayProto, [
    'includes',
    'indexOf',
    'lastIndexOf',
    'join',
    'slice',
    'at',
    'concat',
    'flat',
    'toString',
  ]),
  number: pick(numberProto, ['toFixed', 'toString', 'toPrecision']),
  regex: nullProto({
    test: function (this: RegExp, subject: unknown) {
      return this.test(regexSubject(subject));
    },
  }),
});

/** Every method name some receiver type allows (for static validation). */
const ALL_METHOD_NAMES = new Set<string>(
  Object.values(METHODS).flatMap(table => Object.keys(table))
);

/** String methods whose first argument is turned into a RegExp by JS. */
const REGEX_PATTERN_METHODS = new Set(['match', 'search']);

function isPlainObjectLike(v: unknown): boolean {
  return typeof v === 'object' && v !== null && !(v instanceof RegExp);
}

/** Subject string for a regex operation, refused rather than scanned when huge. */
function regexSubject(subject: unknown): string {
  const s = String(subject);
  if (s.length > MAX_REGEX_SUBJECT_LENGTH) {
    throw new ExpressionError(
      `Strings longer than ${MAX_REGEX_SUBJECT_LENGTH} characters cannot be matched against a regular expression`
    );
  }
  return s;
}

const escapeRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Invoke an allow-listed method with the resource guards that keep a single
 * expression from pinning the shared event loop or exhausting memory.
 */
function callMethod(
  receiver: unknown,
  name: string,
  method: AnyFn,
  args: unknown[],
  pos: number
): unknown {
  for (const arg of args) {
    if (typeof arg === 'function') {
      throw new ExpressionError('Functions cannot be passed as arguments', pos);
    }
  }

  if (typeof receiver === 'string') {
    // `'x'.match('(a+)+')` would compile the string into a regex, skipping the
    // literal-only checks above. Treat string patterns literally instead.
    if (REGEX_PATTERN_METHODS.has(name) && !(args[0] instanceof RegExp)) {
      args = [new RegExp(escapeRegex(String(args[0] ?? ''))), ...args.slice(1)];
    }
    if (args.some(a => a instanceof RegExp)) regexSubject(receiver);
    if ((name === 'padStart' || name === 'padEnd') && Number(args[0]) > MAX_STRING_LENGTH) {
      throw new ExpressionError(
        `Strings longer than ${MAX_STRING_LENGTH} characters cannot be built`,
        pos
      );
    }
  }

  const result = method.apply(receiver, args);
  return boundResult(result, pos);
}

function boundResult(result: unknown, pos: number): unknown {
  if (typeof result === 'string' && result.length > MAX_STRING_LENGTH) {
    throw new ExpressionError(
      `Strings longer than ${MAX_STRING_LENGTH} characters cannot be built`,
      pos
    );
  }
  if (Array.isArray(result) && result.length > MAX_ARRAY_LENGTH) {
    throw new ExpressionError(
      `Arrays longer than ${MAX_ARRAY_LENGTH} items cannot be built`,
      pos
    );
  }
  return result;
}

/**
 * Result of an optional chain that hit null/undefined. Propagates through the
 * rest of the member/call chain (`a?.b.c()` is undefined when `a` is null,
 * like JS) and becomes `undefined` once the chain is used as a value.
 */
const SHORT_CIRCUIT: unique symbol = Symbol('short-circuit');

/** Marker for a namespace reference (`Math`, `JSON`, …) mid-evaluation. */
class NamespaceRef {
  constructor(readonly name: string) {}
}

/** Marker for a global function reference (`String`, …) mid-evaluation. */
class GlobalFnRef {
  constructor(readonly name: string) {}
}

class Evaluator {
  constructor(private readonly scope: ExpressionScope) {}

  eval(node: Node): unknown {
    return this.evalValue(node);
  }

  private evalNode(node: Node): unknown {
    switch (node.kind) {
      case 'literal':
        return node.value;
      case 'group':
        return this.evalValue(node.expr);
      case 'regex':
        // Fresh instance per evaluation so a sticky/global regex never
        // carries `lastIndex` between runs.
        return new RegExp(node.source, node.flags);
      case 'ident':
        return this.resolveIdentifier(node.name, node.pos);
      case 'member':
        return this.evalMember(node);
      case 'call':
        return this.evalCall(node);
      case 'unary':
        return this.evalUnary(node);
      case 'binary':
        return this.evalBinary(node);
      case 'logical': {
        const left = this.evalValue(node.left);
        if (node.op === '&&') return left ? this.evalValue(node.right) : left;
        if (node.op === '||') return left ? left : this.evalValue(node.right);
        return left ?? this.evalValue(node.right);
      }
      case 'conditional':
        return this.evalValue(node.test)
          ? this.evalValue(node.consequent)
          : this.evalValue(node.alternate);
      default:
        throw new ExpressionError('Unsupported expression');
    }
  }

  /** Evaluate a node that must produce a plain value (not a namespace). */
  private evalValue(node: Node): unknown {
    const value = this.evalNode(node);
    if (value === SHORT_CIRCUIT) return undefined;
    if (value instanceof NamespaceRef || value instanceof GlobalFnRef) {
      throw new ExpressionError(`"${value.name}" cannot be used as a value`);
    }
    return value;
  }

  private resolveIdentifier(name: string, pos: number): unknown {
    if (own(this.scope, name)) {
      return sanitize(this.scope[name]);
    }
    if (own(NAMESPACES, name)) {
      return new NamespaceRef(name);
    }
    if (own(GLOBAL_FUNCTIONS, name)) {
      return new GlobalFnRef(name);
    }
    throw new ExpressionError(`Unknown identifier "${name}"`, pos);
  }

  private propertyKey(node: Extract<Node, { kind: 'member' }>): string | number {
    const raw = node.computed ? this.evalValue(node.property) : (node.property as { value: unknown }).value;
    if (typeof raw === 'number') return raw;
    if (typeof raw === 'string') return raw;
    if (typeof raw === 'boolean' || raw === null || raw === undefined) return String(raw);
    throw new ExpressionError('Property keys must be strings or numbers', node.pos);
  }

  private evalMember(node: Extract<Node, { kind: 'member' }>): unknown {
    const object = this.evalNode(node.object);
    if (object === SHORT_CIRCUIT) return SHORT_CIRCUIT;
    const key = this.propertyKey(node);

    if (object instanceof NamespaceRef) {
      const ns = NAMESPACES[object.name];
      if (typeof key !== 'string' || !own(ns, key)) {
        throw new ExpressionError(`"${object.name}.${String(key)}" is not available`, node.pos);
      }
      const member = ns[key];
      if (typeof member === 'function') {
        throw new ExpressionError(`"${object.name}.${key}" must be called`, node.pos);
      }
      return member;
    }
    if (object instanceof GlobalFnRef) {
      throw new ExpressionError(`"${object.name}" has no properties`, node.pos);
    }

    if (object === null || object === undefined) {
      if (node.optional) return SHORT_CIRCUIT;
      throw new ExpressionError(
        `Cannot read property "${String(key)}" of ${object === null ? 'null' : 'undefined'}`,
        node.pos
      );
    }

    return readProperty(object, key, node.pos);
  }

  private evalCall(node: Extract<Node, { kind: 'call' }>): unknown {
    const args = node.args.map(a => this.evalValue(a));

    if (node.callee.kind === 'ident') {
      const target = this.evalNode(node.callee);
      if (target instanceof GlobalFnRef) {
        return GLOBAL_FUNCTIONS[target.name](...args);
      }
      // `Number` is both a namespace (Number.isInteger) and a callable.
      if (target instanceof NamespaceRef && own(GLOBAL_FUNCTIONS, target.name)) {
        return GLOBAL_FUNCTIONS[target.name](...args);
      }
      throw new ExpressionError(
        `"${node.callee.name}" is not a callable function`,
        node.pos
      );
    }

    // Method call: resolve the receiver and method name ourselves instead of
    // reading a function off the receiver, so user data can never supply code.
    const callee = node.callee as Extract<Node, { kind: 'member' }>;
    const receiver = this.evalNode(callee.object);
    if (receiver === SHORT_CIRCUIT) return SHORT_CIRCUIT;
    const key = this.propertyKey(callee);

    if (typeof key === 'string' && FORBIDDEN_KEYS.has(key)) {
      throw new ExpressionError(`Property "${key}" is not accessible`, node.pos);
    }

    if (receiver instanceof NamespaceRef) {
      const ns = NAMESPACES[receiver.name];
      const fn = typeof key === 'string' && own(ns, key) ? ns[key] : undefined;
      if (typeof fn !== 'function') {
        throw new ExpressionError(`"${receiver.name}.${String(key)}" is not a function`, node.pos);
      }
      return (fn as AnyFn)(...args);
    }
    if (receiver instanceof GlobalFnRef) {
      throw new ExpressionError(`"${receiver.name}" has no methods`, node.pos);
    }

    if (receiver === null || receiver === undefined) {
      if (callee.optional || node.optional) return SHORT_CIRCUIT;
      throw new ExpressionError(
        `Cannot call "${String(key)}" on ${receiver === null ? 'null' : 'undefined'}`,
        node.pos
      );
    }

    const table = methodTableFor(receiver);
    const method =
      table && typeof key === 'string' && own(table, key) ? table[key] : undefined;
    if (typeof method !== 'function') {
      throw new ExpressionError(`Method "${String(key)}" is not allowed here`, node.pos);
    }
    return callMethod(receiver, key as string, method, args, node.pos);
  }

  private evalUnary(node: Extract<Node, { kind: 'unary' }>): unknown {
    const value = this.evalValue(node.arg);
    switch (node.op) {
      case '!':
        return !value;
      case '-':
        return -(value as number);
      case '+':
        return +(value as number);
      case 'typeof':
        return typeof value;
      default:
        throw new ExpressionError(`Unsupported unary operator "${node.op}"`, node.pos);
    }
  }

  private evalBinary(node: Extract<Node, { kind: 'binary' }>): unknown {
    const l = this.evalValue(node.left) as never;
    const r = this.evalValue(node.right) as never;
    switch (node.op) {
      case '==':
        // eslint-disable-next-line eqeqeq
        return l == r;
      case '!=':
        // eslint-disable-next-line eqeqeq
        return l != r;
      case '===':
        return l === r;
      case '!==':
        return l !== r;
      case '<':
        return l < r;
      case '<=':
        return l <= r;
      case '>':
        return l > r;
      case '>=':
        return l >= r;
      case '+':
        return boundResult((l as number) + (r as number), node.pos);
      case '-':
        return (l as number) - (r as number);
      case '*':
        return (l as number) * (r as number);
      case '/':
        return (l as number) / (r as number);
      case '%':
        return (l as number) % (r as number);
      default:
        throw new ExpressionError(`Unsupported operator "${node.op}"`, node.pos);
    }
  }
}

function methodTableFor(receiver: unknown): MethodTable | null {
  if (typeof receiver === 'string') return METHODS.string;
  if (typeof receiver === 'number') return METHODS.number;
  if (Array.isArray(receiver)) return METHODS.array;
  if (receiver instanceof RegExp) return METHODS.regex;
  return null;
}

/**
 * Read `key` from `object` without ever touching the prototype chain or
 * returning executable values.
 */
function readProperty(object: unknown, key: string | number, pos: number): unknown {
  if (typeof key === 'string' && FORBIDDEN_KEYS.has(key)) {
    throw new ExpressionError(`Property "${key}" is not accessible`, pos);
  }

  if (typeof object === 'string') {
    if (key === 'length') return object.length;
    const index = toIndex(key);
    return index === null ? undefined : object[index];
  }

  if (Array.isArray(object)) {
    if (key === 'length') return object.length;
    const index = toIndex(key);
    if (index === null) return undefined;
    return sanitize(object[index]);
  }

  if (object instanceof RegExp) {
    if (key === 'source') return object.source;
    if (key === 'flags') return object.flags;
    return undefined;
  }

  if (typeof object === 'object' && object !== null) {
    const name = String(key);
    if (!Object.prototype.hasOwnProperty.call(object, name)) return undefined;
    return sanitize((object as Record<string, unknown>)[name]);
  }

  // numbers, booleans, bigints, symbols: no readable properties.
  return undefined;
}

function toIndex(key: string | number): number | null {
  if (typeof key === 'number') {
    return Number.isInteger(key) && key >= 0 ? key : null;
  }
  if (/^\d+$/.test(key)) return Number(key);
  return null;
}

/** Values pulled out of user data must never be functions. */
function sanitize(value: unknown): unknown {
  return typeof value === 'function' ? undefined : value;
}

// ─── Static validation ───────────────────────────────────────────────────────

/**
 * Walk the tree once without evaluating and reject what the evaluator would
 * reject regardless of runtime data: unknown identifiers, namespace members
 * that do not exist, forbidden property names and method names that no
 * receiver type allows.
 */
function checkStatic(node: Node, identifiers: Set<string>): void {
  const namespaceOf = (n: Node): string | null =>
    n.kind === 'ident' && !identifiers.has(n.name) && own(NAMESPACES, n.name)
      ? n.name
      : null;

  const literalKey = (member: Extract<Node, { kind: 'member' }>): string | null =>
    member.property.kind === 'literal' && typeof member.property.value === 'string'
      ? member.property.value
      : null;

  const visit = (n: Node): void => {
    switch (n.kind) {
      case 'literal':
      case 'regex':
        return;
      case 'group':
        visit(n.expr);
        return;
      case 'ident':
        if (
          !identifiers.has(n.name) &&
          !own(NAMESPACES, n.name) &&
          !own(GLOBAL_FUNCTIONS, n.name)
        ) {
          throw new ExpressionError(`Unknown identifier "${n.name}"`, n.pos);
        }
        return;
      case 'member': {
        const key = literalKey(n);
        if (key !== null && FORBIDDEN_KEYS.has(key)) {
          throw new ExpressionError(`Property "${key}" is not accessible`, n.pos);
        }
        const ns = namespaceOf(n.object);
        if (ns !== null && (key === null || !own(NAMESPACES[ns], key))) {
          throw new ExpressionError(`"${ns}.${key ?? '[…]'}" is not available`, n.pos);
        }
        if (ns === null) visit(n.object);
        if (n.computed) visit(n.property);
        return;
      }
      case 'call': {
        n.args.forEach(visit);
        if (n.callee.kind === 'ident') {
          const name = n.callee.name;
          const callable = !identifiers.has(name) && own(GLOBAL_FUNCTIONS, name);
          if (!callable) {
            visit(n.callee); // reports unknown identifiers first
            throw new ExpressionError(`"${name}" is not a callable function`, n.pos);
          }
          return;
        }
        const callee = n.callee as Extract<Node, { kind: 'member' }>;
        const key = literalKey(callee);
        const ns = namespaceOf(callee.object);
        if (ns !== null) {
          if (key === null || typeof NAMESPACES[ns][key] !== 'function') {
            throw new ExpressionError(
              `"${ns}.${key ?? '[…]'}" is not a function`,
              n.pos
            );
          }
          return;
        }
        visit(callee.object); // unknown receivers are reported first
        if (callee.computed) visit(callee.property);
        if (key !== null && FORBIDDEN_KEYS.has(key)) {
          throw new ExpressionError(`Property "${key}" is not accessible`, n.pos);
        }
        if (key !== null && !ALL_METHOD_NAMES.has(key)) {
          throw new ExpressionError(`Method "${key}" is not allowed here`, n.pos);
        }
        return;
      }
      case 'unary':
        visit(n.arg);
        return;
      case 'binary':
      case 'logical':
        visit(n.left);
        visit(n.right);
        return;
      case 'conditional':
        visit(n.test);
        visit(n.consequent);
        visit(n.alternate);
        return;
    }
  };

  visit(node);
}
