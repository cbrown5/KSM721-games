/**
 * parser.js
 * JAGS-like model syntax parser.
 *
 * Supported syntax:
 *   model {
 *     for (i in 1:N) {
 *       y[i] ~ dnorm(mu[i], tau)
 *       mu[i] <- alpha + beta * x[i]
 *     }
 *     alpha ~ dnorm(0, 0.001)
 *     beta  ~ dnorm(0, 0.001)
 *     tau   ~ dgamma(0.1, 0.1)
 *     sigma <- 1 / sqrt(tau)
 *   }
 *
 * Returns a parsed AST describing nodes and their relationships.
 */

'use strict';

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

const TOKEN = {
  NUMBER: 'NUMBER',
  IDENT:  'IDENT',
  TILDE:  'TILDE',
  ARROW:  'ARROW',
  LPAREN: 'LPAREN',
  RPAREN: 'RPAREN',
  LBRACE: 'LBRACE',
  RBRACE: 'RBRACE',
  LBRACKET: 'LBRACKET',
  RBRACKET: 'RBRACKET',
  COMMA:  'COMMA',
  COLON:  'COLON',
  PLUS:   'PLUS',
  MINUS:  'MINUS',
  STAR:   'STAR',
  SLASH:  'SLASH',
  CARET:  'CARET',
  EOF:    'EOF',
};

const KEYWORDS = new Set(['model', 'data', 'inits', 'for', 'in']);

function tokenize(src) {
  const tokens = [];
  let i = 0;

  // Strip comments
  src = src.replace(/#[^\n]*/g, '');

  while (i < src.length) {
    // Whitespace
    if (/\s/.test(src[i])) { i++; continue; }

    // Numbers (including scientific notation)
    if (/[0-9]/.test(src[i]) || (src[i] === '.' && /[0-9]/.test(src[i+1]))) {
      let num = '';
      while (i < src.length && /[0-9.eE+\-]/.test(src[i])) {
        // Don't consume a leading minus that belongs to the next token
        if ((src[i] === '+' || src[i] === '-') && !/[eE]/.test(src[i-1])) break;
        num += src[i++];
      }
      tokens.push({ type: TOKEN.NUMBER, value: parseFloat(num) });
      continue;
    }

    // Identifiers / keywords
    if (/[a-zA-Z_]/.test(src[i])) {
      let id = '';
      while (i < src.length && /[a-zA-Z0-9_\.]/.test(src[i])) id += src[i++];
      tokens.push({ type: TOKEN.IDENT, value: id });
      continue;
    }

    // Two-char tokens first
    if (src.slice(i, i+2) === '<-') { tokens.push({ type: TOKEN.ARROW, value: '<-' }); i += 2; continue; }

    // Single-char tokens
    const single = {
      '~': TOKEN.TILDE, '(': TOKEN.LPAREN, ')': TOKEN.RPAREN,
      '{': TOKEN.LBRACE, '}': TOKEN.RBRACE,
      '[': TOKEN.LBRACKET, ']': TOKEN.RBRACKET,
      ',': TOKEN.COMMA, ':': TOKEN.COLON,
      '+': TOKEN.PLUS, '-': TOKEN.MINUS, '*': TOKEN.STAR,
      '/': TOKEN.SLASH, '^': TOKEN.CARET,
    };
    if (single[src[i]]) { tokens.push({ type: single[src[i]], value: src[i] }); i++; continue; }

    throw new Error(`Unexpected character '${src[i]}' at position ${i}`);
  }
  tokens.push({ type: TOKEN.EOF, value: null });
  return tokens;
}

// ---------------------------------------------------------------------------
// Recursive-descent parser
// ---------------------------------------------------------------------------

class Parser {
  constructor(tokens) {
    this.tokens = tokens;
    this.pos = 0;
  }

  peek() { return this.tokens[this.pos]; }
  consume() { return this.tokens[this.pos++]; }

  expect(type) {
    const t = this.consume();
    if (t.type !== type) throw new Error(`Expected ${type}, got ${t.type} ("${t.value}")`);
    return t;
  }

  match(type) {
    if (this.peek().type === type) { this.consume(); return true; }
    return false;
  }

  // Entry point
  parseModel() {
    this.expect(TOKEN.IDENT); // 'model'
    this.expect(TOKEN.LBRACE);
    const statements = this.parseStatements();
    this.expect(TOKEN.RBRACE);
    return { type: 'Model', body: statements };
  }

  parseStatements() {
    const stmts = [];
    while (this.peek().type !== TOKEN.RBRACE && this.peek().type !== TOKEN.EOF) {
      stmts.push(this.parseStatement());
    }
    return stmts;
  }

  parseStatement() {
    const t = this.peek();

    // for loop
    if (t.type === TOKEN.IDENT && t.value === 'for') {
      return this.parseForLoop();
    }

    // assignment or distribution: starts with an lhs expression
    const lhs = this.parseLHS();

    if (this.peek().type === TOKEN.TILDE) {
      this.consume();
      const dist = this.parseDistribution();
      return { type: 'Stochastic', lhs, dist };
    }

    if (this.peek().type === TOKEN.ARROW) {
      this.consume();
      const rhs = this.parseExpr();
      return { type: 'Deterministic', lhs, rhs };
    }

    throw new Error(`Expected ~ or <- after ${JSON.stringify(lhs)}`);
  }

  parseForLoop() {
    this.consume(); // 'for'
    this.expect(TOKEN.LPAREN);
    const index = this.expect(TOKEN.IDENT).value;
    this.expect(TOKEN.IDENT); // 'in'
    const from = this.parseExpr();
    this.expect(TOKEN.COLON);
    const to = this.parseExpr();
    this.expect(TOKEN.RPAREN);
    this.expect(TOKEN.LBRACE);
    const body = this.parseStatements();
    this.expect(TOKEN.RBRACE);
    return { type: 'ForLoop', index, from, to, body };
  }

  // LHS: identifier, optionally indexed
  parseLHS() {
    const name = this.expect(TOKEN.IDENT).value;
    if (this.peek().type === TOKEN.LBRACKET) {
      this.consume();
      const idx = this.parseExpr();
      this.expect(TOKEN.RBRACKET);
      return { type: 'Index', name, idx };
    }
    return { type: 'Var', name };
  }

  parseDistribution() {
    const name = this.expect(TOKEN.IDENT).value;
    this.expect(TOKEN.LPAREN);
    const params = [];
    if (this.peek().type !== TOKEN.RPAREN) {
      params.push(this.parseExpr());
      while (this.match(TOKEN.COMMA)) params.push(this.parseExpr());
    }
    this.expect(TOKEN.RPAREN);
    return { type: 'Distribution', name, params };
  }

  // Expression parser with operator precedence (Pratt-style)
  parseExpr() { return this.parseAddSub(); }

  parseAddSub() {
    let left = this.parseMulDiv();
    while (this.peek().type === TOKEN.PLUS || this.peek().type === TOKEN.MINUS) {
      const op = this.consume().type === TOKEN.PLUS ? '+' : '-';
      left = { type: 'BinOp', op, left, right: this.parseMulDiv() };
    }
    return left;
  }

  parseMulDiv() {
    let left = this.parsePow();
    while (this.peek().type === TOKEN.STAR || this.peek().type === TOKEN.SLASH) {
      const op = this.consume().type === TOKEN.STAR ? '*' : '/';
      left = { type: 'BinOp', op, left, right: this.parsePow() };
    }
    return left;
  }

  parsePow() {
    let left = this.parseUnary();
    if (this.peek().type === TOKEN.CARET) {
      this.consume();
      left = { type: 'BinOp', op: '^', left, right: this.parsePow() };
    }
    return left;
  }

  parseUnary() {
    if (this.peek().type === TOKEN.MINUS) {
      this.consume();
      return { type: 'UnaryMinus', expr: this.parsePrimary() };
    }
    return this.parsePrimary();
  }

  parsePrimary() {
    const t = this.peek();

    if (t.type === TOKEN.NUMBER) {
      this.consume();
      return { type: 'Literal', value: t.value };
    }

    if (t.type === TOKEN.LPAREN) {
      this.consume();
      const e = this.parseExpr();
      this.expect(TOKEN.RPAREN);
      return e;
    }

    if (t.type === TOKEN.IDENT) {
      this.consume();
      const name = t.value;

      // Function call or distribution-like call
      if (this.peek().type === TOKEN.LPAREN) {
        this.consume();
        const args = [];
        if (this.peek().type !== TOKEN.RPAREN) {
          args.push(this.parseExpr());
          while (this.match(TOKEN.COMMA)) args.push(this.parseExpr());
        }
        this.expect(TOKEN.RPAREN);
        return { type: 'Call', name, args };
      }

      // Indexed variable
      if (this.peek().type === TOKEN.LBRACKET) {
        this.consume();
        const idx = this.parseExpr();
        this.expect(TOKEN.RBRACKET);
        return { type: 'Index', name, idx };
      }

      return { type: 'Var', name };
    }

    throw new Error(`Unexpected token ${t.type} ("${t.value}")`);
  }
}

// ---------------------------------------------------------------------------
// Parse entry point
// ---------------------------------------------------------------------------

function parseJAGS(src) {
  // Allow optional 'model' wrapper or bare block
  const trimmed = src.trim();
  let modelSrc = trimmed;
  if (!trimmed.startsWith('model')) {
    modelSrc = 'model {\n' + trimmed + '\n}';
  }
  const tokens = tokenize(modelSrc);
  const parser = new Parser(tokens);
  return parser.parseModel();
}

// ---------------------------------------------------------------------------
// Evaluator
// ---------------------------------------------------------------------------

// Built-in math functions recognised in expressions
const MATH_FUNS = {
  sqrt: Math.sqrt, exp: Math.exp, log: Math.log,
  abs: Math.abs, pow: Math.pow, sin: Math.sin, cos: Math.cos,
  floor: Math.floor, ceil: Math.ceil, round: Math.round,
  min: Math.min, max: Math.max,
  // JAGS-specific aliases
  inprod: (a, b) => { let s = 0; for (let i=0;i<a.length;i++) s+=a[i]*b[i]; return s; },
  logit: x => Math.log(x / (1 - x)),
  ilogit: x => 1 / (1 + Math.exp(-x)),
  probit: x => { /* approx */ return Math.sqrt(2) * erfInv(2*x - 1); },
  phi: x => 0.5 * (1 + erf(x / Math.sqrt(2))),
};

function erf(x) {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const r = 1 - poly * Math.exp(-x * x);
  return x >= 0 ? r : -r;
}

function erfInv(x) {
  // Approximation: Halley's method
  let w = -Math.log((1 - x) * (1 + x));
  let p;
  if (w < 5) { w -= 2.5; p = 2.81022636e-08; p = 3.43273939e-7+p*w; p = -3.5233877e-6+p*w; p = -4.39150654e-6+p*w; p = 0.00021858087+p*w; p = -0.00125372503+p*w; p = -0.00417768164+p*w; p = 0.246640727+p*w; p = 1.50140941+p*w; }
  else { w = Math.sqrt(w)-3; p = -0.000200214257; p = 0.000100950558+p*w; p = 0.00134934322+p*w; p = -0.00367342844+p*w; p = 0.00573950773+p*w; p = -0.0076224613+p*w; p = 0.00943887047+p*w; p = 1.00167406+p*w; p = 2.83297682+p*w; }
  return p * x;
}

function evalExpr(node, env) {
  switch (node.type) {
    case 'Literal': return node.value;
    case 'Var': {
      if (node.name in env) return env[node.name];
      throw new Error(`Undefined variable: ${node.name}`);
    }
    case 'Index': {
      const arr = env[node.name];
      if (arr === undefined) throw new Error(`Undefined variable: ${node.name}`);
      const i = Math.round(evalExpr(node.idx, env));
      // JAGS uses 1-based indexing
      return Array.isArray(arr) ? arr[i - 1] : arr;
    }
    case 'BinOp': {
      const l = evalExpr(node.left, env);
      const r = evalExpr(node.right, env);
      switch (node.op) {
        case '+': return l + r;
        case '-': return l - r;
        case '*': return l * r;
        case '/': return l / r;
        case '^': return Math.pow(l, r);
      }
      break;
    }
    case 'UnaryMinus': return -evalExpr(node.expr, env);
    case 'Call': {
      const fn = MATH_FUNS[node.name];
      if (!fn) throw new Error(`Unknown function: ${node.name}`);
      const args = node.args.map(a => evalExpr(a, env));
      return fn(...args);
    }
    default:
      throw new Error(`Cannot evaluate node type: ${node.type}`);
  }
}

// ---------------------------------------------------------------------------
// Model compiler: extract stochastic nodes and their dependency graph
// ---------------------------------------------------------------------------

function compileModel(ast) {
  const stochasticNodes = [];   // { lhsName, dist, paramExprs }
  const deterministicNodes = []; // { lhsName, rhsExpr }
  const forLoops = [];

  function collectStatements(stmts, loopContext) {
    for (const stmt of stmts) {
      if (stmt.type === 'ForLoop') {
        forLoops.push({ ...stmt, context: loopContext });
        collectStatements(stmt.body, [...(loopContext || []), { index: stmt.index, from: stmt.from, to: stmt.to }]);
      } else if (stmt.type === 'Stochastic') {
        stochasticNodes.push({ ...stmt, loopContext });
      } else if (stmt.type === 'Deterministic') {
        deterministicNodes.push({ ...stmt, loopContext });
      }
    }
  }

  collectStatements(ast.body, []);

  return { stochasticNodes, deterministicNodes };
}

// Export
const parserExports = { parseJAGS, compileModel, evalExpr, tokenize };

if (typeof module !== 'undefined') {
  module.exports = parserExports;
} else if (typeof self !== 'undefined') {
  Object.assign(self, parserExports);
} else {
  Object.assign(window, parserExports);
}
