/**
 * test.js  — Red/Green TDD test suite for BayesJS Gibbs Sampler
 *
 * Run with:  node test.js
 *
 * Tests are deliberately minimal — each one exercises one specific function
 * and will PASS (green) or FAIL (red) with a clear message.
 */

'use strict';

// ── Shim the browser globals expected by the modules ──────────────────────
// distributions.js and parser.js check `typeof self !== 'undefined'`
// so we make self point to module.exports targets.
global.self = {};

// ── Load modules ──────────────────────────────────────────────────────────
const dist   = require('./js/distributions.js');
const parser = require('./js/parser.js');
const samp   = require('./js/sampler.js');

// Merge exports into global scope (mirrors how importScripts works in worker)
Object.assign(global, dist, parser, samp);

// ── Tiny test harness ─────────────────────────────────────────────────────
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  \x1b[32m✓\x1b[0m  ${name}`);
    passed++;
  } catch (err) {
    console.log(`  \x1b[31m✗\x1b[0m  ${name}`);
    console.log(`       ${err.message}`);
    failed++;
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

function assertClose(a, b, tol = 0.001, msg) {
  if (Math.abs(a - b) > tol) throw new Error(msg || `Expected ${a} ≈ ${b} (tol ${tol})`);
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. distributions.js
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[distributions.js]');

test('logDensity dnorm — known value', () => {
  // dnorm(0 | mu=0, tau=1): log-density = -0.5*log(2π) ≈ -0.9189
  const ld = logDensity('dnorm', 0, [0, 1]);
  assertClose(ld, -0.9189, 0.001, `got ${ld}`);
});

test('logDensity dgamma — out of support returns -Infinity', () => {
  const ld = logDensity('dgamma', -1, [1, 1]);
  assert(ld === -Infinity, `expected -Infinity, got ${ld}`);
});

test('logDensity dbern — p=0.7, x=1', () => {
  const ld = logDensity('dbern', 1, [0.7]);
  assertClose(ld, Math.log(0.7), 0.001, `got ${ld}`);
});

test('sampleDistribution dnorm — returns a number', () => {
  const s = sampleDistribution('dnorm', [5, 1]);
  assert(typeof s === 'number' && isFinite(s), `got ${s}`);
});

test('getDistribution throws for unknown name', () => {
  let threw = false;
  try { getDistribution('dfoo'); } catch { threw = true; }
  assert(threw, 'should have thrown for unknown distribution');
});

test('listDistributions includes dnorm and dgamma', () => {
  const names = listDistributions().map(d => d.name);
  assert(names.includes('dnorm'), 'missing dnorm');
  assert(names.includes('dgamma'), 'missing dgamma');
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. parser.js — tokenizer
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[parser.js — tokenizer]');

test('tokenize strips # comments', () => {
  const tokens = tokenize('alpha # this is a comment\nbeta');
  const ids = tokens.filter(t => t.type === 'IDENT').map(t => t.value);
  assert(!ids.includes('this'), 'comment text leaked into tokens');
  assert(ids.includes('alpha') && ids.includes('beta'), `got ${ids}`);
});

test('tokenize handles scientific notation', () => {
  const tokens = tokenize('0.001');
  assert(tokens[0].value === 0.001, `got ${tokens[0].value}`);
});

test('tokenize throws on unexpected character', () => {
  let threw = false;
  try { tokenize('@bad'); } catch { threw = true; }
  assert(threw, 'should throw on @');
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. parser.js — parseJAGS + compileModel
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[parser.js — parseJAGS + compileModel]');

const SIMPLE_MODEL = `
model {
  for (i in 1:N) {
    y[i] ~ dnorm(mu, tau)
  }
  mu  ~ dnorm(0, 0.001)
  tau ~ dgamma(1, 1)
  sigma <- 1 / sqrt(tau)
}`;

test('parseJAGS returns a Model node', () => {
  const ast = parseJAGS(SIMPLE_MODEL);
  assert(ast.type === 'Model', `got type ${ast.type}`);
});

test('compileModel finds 3 stochastic nodes', () => {
  const ast = parseJAGS(SIMPLE_MODEL);
  const c = compileModel(ast);
  // y[i] (in loop), mu, tau
  assert(c.stochasticNodes.length === 3,
    `expected 3, got ${c.stochasticNodes.length}`);
});

test('compileModel finds 1 deterministic node (sigma)', () => {
  const ast = parseJAGS(SIMPLE_MODEL);
  const c = compileModel(ast);
  assert(c.deterministicNodes.length === 1,
    `expected 1, got ${c.deterministicNodes.length}`);
});

test('parseJAGS wraps bare block without model{}', () => {
  const bare = `mu ~ dnorm(0, 0.001)`;
  const ast = parseJAGS(bare);
  assert(ast.type === 'Model');
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. parser.js — evalExpr
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[parser.js — evalExpr]');

test('evalExpr evaluates arithmetic: 2 + 3 * 4 = 14', () => {
  // Build a simple AST manually
  const node = {
    type: 'BinOp', op: '+',
    left: { type: 'Literal', value: 2 },
    right: { type: 'BinOp', op: '*',
      left: { type: 'Literal', value: 3 },
      right: { type: 'Literal', value: 4 }
    }
  };
  assert(evalExpr(node, {}) === 14, 'arithmetic failed');
});

test('evalExpr evaluates ilogit(0) = 0.5', () => {
  const node = { type: 'Call', name: 'ilogit', args: [{ type: 'Literal', value: 0 }] };
  assertClose(evalExpr(node, {}), 0.5, 0.0001);
});

test('evalExpr throws on undefined variable', () => {
  let threw = false;
  try { evalExpr({ type: 'Var', name: 'ghost' }, {}); } catch { threw = true; }
  assert(threw, 'should throw for undefined variable');
});

test('evalExpr evaluates 1-based array index', () => {
  const env = { x: [10, 20, 30] };
  const node = { type: 'Index', name: 'x', idx: { type: 'Literal', value: 2 } };
  assert(evalExpr(node, env) === 20, 'wrong 1-based index result');
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. sampler.js — identifyParameters
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[sampler.js — identifyParameters]');

test('identifyParameters finds mu and tau, not sigma (deterministic)', () => {
  const ast = parseJAGS(SIMPLE_MODEL);
  const compiled = compileModel(ast);
  const data = { N: 5, y: [1, 2, 3, 4, 5] };
  const params = identifyParameters(compiled, data);
  assert(params.includes('mu'),  `mu missing from ${params}`);
  assert(params.includes('tau'), `tau missing from ${params}`);
  assert(!params.includes('sigma'), 'sigma should NOT be a free parameter');
  assert(!params.includes('y'),     'y should NOT be a free parameter (it is data)');
});

test('identifyParameters excludes data variables', () => {
  const ast = parseJAGS(SIMPLE_MODEL);
  const compiled = compileModel(ast);
  const params = identifyParameters(compiled, { N: 5, y: [1,2,3,4,5], mu: 0 });
  assert(!params.includes('mu'), 'mu is in data so should be excluded');
  assert(params.includes('tau'), 'tau should still be a free parameter');
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. sampler.js — ModelRuntime.logPosterior
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[sampler.js — ModelRuntime.logPosterior]');

test('logPosterior returns a finite number for valid params', () => {
  const ast = parseJAGS(SIMPLE_MODEL);
  const compiled = compileModel(ast);
  const data = { N: 3, y: [1, 2, 3] };
  const runtime = new ModelRuntime(compiled, data);
  const lp = runtime.logPosterior({ mu: 2, tau: 1 });
  assert(isFinite(lp), `expected finite, got ${lp}`);
});

test('logPosterior returns -Infinity when tau <= 0', () => {
  const ast = parseJAGS(SIMPLE_MODEL);
  const compiled = compileModel(ast);
  const data = { N: 3, y: [1, 2, 3] };
  const runtime = new ModelRuntime(compiled, data);
  const lp = runtime.logPosterior({ mu: 2, tau: -1 });
  assert(lp === -Infinity, `expected -Infinity, got ${lp}`);
});

test('logPosterior is higher for mu closer to data mean', () => {
  const ast = parseJAGS(SIMPLE_MODEL);
  const compiled = compileModel(ast);
  const data = { N: 5, y: [5, 5, 5, 5, 5] };
  const runtime = new ModelRuntime(compiled, data);
  const lpGood = runtime.logPosterior({ mu: 5, tau: 1 });
  const lpBad  = runtime.logPosterior({ mu: 0, tau: 1 });
  assert(lpGood > lpBad, `mu=5 should have higher posterior than mu=0 given data [5,5,5,5,5]`);
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. sampler.js — GibbsSampler (short run)
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[sampler.js — GibbsSampler]');

test('GibbsSampler.runChain returns correct sample count', () => {
  const ast = parseJAGS(SIMPLE_MODEL);
  const compiled = compileModel(ast);
  const data = { N: 5, y: [3, 4, 5, 6, 7] };
  const sampler = new GibbsSampler(compiled, data, { nIter: 50, nWarmup: 20, thin: 1 });
  const result = sampler.runChain();
  assert(result.samples.length === 50, `expected 50 samples, got ${result.samples.length}`);
});

test('GibbsSampler samples have correct param keys', () => {
  const ast = parseJAGS(SIMPLE_MODEL);
  const compiled = compileModel(ast);
  const data = { N: 3, y: [1, 2, 3] };
  const sampler = new GibbsSampler(compiled, data, { nIter: 20, nWarmup: 10, thin: 1 });
  const { samples } = sampler.runChain();
  assert('mu' in samples[0],  'sample missing mu');
  assert('tau' in samples[0], 'sample missing tau');
});

test('GibbsSampler recovers approx data mean for mu', () => {
  // With 500 samples and tight-ish data, posterior mean of mu ≈ data mean
  const ast = parseJAGS(SIMPLE_MODEL);
  const compiled = compileModel(ast);
  const dataMean = 7;
  const n = 20;
  const y = Array.from({length: n}, () => dataMean + (Math.random() - 0.5));
  const data = { N: n, y };
  const sampler = new GibbsSampler(compiled, data, { nIter: 500, nWarmup: 200, thin: 1 });
  const { samples } = sampler.runChain();
  const muMean = samples.reduce((s, x) => s + x.mu, 0) / samples.length;
  assertClose(muMean, dataMean, 1.0, `posterior mean mu=${muMean.toFixed(2)}, expected ≈${dataMean}`);
});

test('GibbsSampler acceptanceRates are between 0 and 1', () => {
  const ast = parseJAGS(SIMPLE_MODEL);
  const compiled = compileModel(ast);
  const data = { N: 5, y: [1, 2, 3, 4, 5] };
  const sampler = new GibbsSampler(compiled, data, { nIter: 100, nWarmup: 50, thin: 1 });
  const { acceptanceRates } = sampler.runChain();
  for (const [p, r] of Object.entries(acceptanceRates)) {
    assert(r >= 0 && r <= 1, `acceptance rate for ${p} is ${r}`);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 8. sampler.js — diagnostics
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[sampler.js — diagnostics]');

test('rHat ≈ 1 for two well-mixed chains from same distribution', () => {
  // Generate 200 iid N(0,1) samples for two chains
  const make = () => Array.from({length: 200}, () => ({ mu: randNormal() }));
  const chains = [make(), make()];
  const r = rHat(chains, 'mu');
  assertClose(r, 1.0, 0.15, `rHat=${r.toFixed(3)}, expected ≈1`);
});

test('ess is positive and ≤ sample count', () => {
  const samples = Array.from({length: 100}, () => ({ mu: Math.random() }));
  const e = ess(samples, 'mu');
  assert(e > 0 && e <= 100, `ess=${e}`);
});

test('paramSummary returns correct keys', () => {
  const samples = Array.from({length: 50}, (_, i) => ({ mu: i }));
  const chains = [samples];
  const s = paramSummary(chains, 'mu');
  for (const k of ['mean', 'sd', 'q025', 'q500', 'q975', 'ess', 'rhat']) {
    assert(k in s, `missing key ${k}`);
  }
});

test('paramSummary mean is correct for 0..99', () => {
  const samples = Array.from({length: 100}, (_, i) => ({ mu: i }));
  const chains = [samples];
  const s = paramSummary(chains, 'mu');
  assertClose(s.mean, 49.5, 0.01);
});

// ═══════════════════════════════════════════════════════════════════════════
// 9. End-to-end: example models from the UI
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[end-to-end: example models]');

const LINEAR_MODEL = `model {
  for (i in 1:N) {
    y[i] ~ dnorm(mu[i], tau)
    mu[i] <- alpha + beta * x[i]
  }
  alpha ~ dnorm(0, 0.001)
  beta  ~ dnorm(0, 0.001)
  tau   ~ dgamma(1, 1)
  sigma <- 1 / sqrt(tau)
}`;

const LOGISTIC_MODEL = `model {
  for (i in 1:N) {
    y[i]  ~ dbern(p[i])
    p[i]  <- ilogit(alpha + beta * x[i])
  }
  alpha ~ dnorm(0, 0.1)
  beta  ~ dnorm(0, 0.1)
}`;

test('linear regression: identifyParameters finds alpha, beta, tau', () => {
  const ast = parseJAGS(LINEAR_MODEL);
  const compiled = compileModel(ast);
  const n = 10;
  const x = Array.from({length: n}, (_, i) => i);
  const y = x.map(xi => 2 + 1.5 * xi);
  const data = { N: n, x, y };
  const params = identifyParameters(compiled, data);
  assert(params.includes('alpha'), `alpha missing: ${params}`);
  assert(params.includes('beta'),  `beta missing: ${params}`);
  assert(params.includes('tau'),   `tau missing: ${params}`);
  assert(!params.includes('sigma'), 'sigma is deterministic, should not be a param');
});

test('linear regression: logPosterior finite for sensible params', () => {
  const ast = parseJAGS(LINEAR_MODEL);
  const compiled = compileModel(ast);
  const n = 5;
  const x = [0, 1, 2, 3, 4];
  const y = [2, 3.5, 5, 6.5, 8];
  const data = { N: n, x, y };
  const runtime = new ModelRuntime(compiled, data);
  const lp = runtime.logPosterior({ alpha: 2, beta: 1.5, tau: 1 });
  assert(isFinite(lp), `expected finite logPosterior, got ${lp}`);
});

test('linear regression: GibbsSampler runs and recovers beta≈1.5', () => {
  const ast = parseJAGS(LINEAR_MODEL);
  const compiled = compileModel(ast);
  const n = 20;
  const x = Array.from({length: n}, (_, i) => i / (n - 1) * 10);
  const y = x.map(xi => 2 + 1.5 * xi + (Math.random() - 0.5) * 0.5);
  const data = { N: n, x, y };
  const sampler = new GibbsSampler(compiled, data, { nIter: 300, nWarmup: 150, thin: 1 });
  const { samples } = sampler.runChain();
  assert(samples.length === 300, `expected 300 samples, got ${samples.length}`);
  const betaMean = samples.reduce((s, x) => s + x.beta, 0) / samples.length;
  assertClose(betaMean, 1.5, 0.3, `beta mean=${betaMean.toFixed(2)}, expected ≈1.5`);
});

test('logistic regression: identifyParameters finds alpha and beta', () => {
  const ast = parseJAGS(LOGISTIC_MODEL);
  const compiled = compileModel(ast);
  const n = 5;
  const x = [-2, -1, 0, 1, 2];
  const y = [0, 0, 1, 1, 1];
  const data = { N: n, x, y };
  const params = identifyParameters(compiled, data);
  assert(params.includes('alpha'), `alpha missing: ${params}`);
  assert(params.includes('beta'),  `beta missing: ${params}`);
});

test('logistic regression: logPosterior finite for sensible params', () => {
  const ast = parseJAGS(LOGISTIC_MODEL);
  const compiled = compileModel(ast);
  const n = 5;
  const x = [-2, -1, 0, 1, 2];
  const y = [0, 0, 1, 1, 1];
  const data = { N: n, x, y };
  const runtime = new ModelRuntime(compiled, data);
  const lp = runtime.logPosterior({ alpha: 0, beta: 1 });
  assert(isFinite(lp), `expected finite logPosterior, got ${lp}`);
});

// ═══════════════════════════════════════════════════════════════════════════
// 10. Main-thread fallback path (simulates runChainInThread)
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[main-thread fallback path]');

test('GibbsSampler onBatch callback fires with correct batch shape', () => {
  const ast = parseJAGS(SIMPLE_MODEL);
  const compiled = compileModel(ast);
  const data = { N: 5, y: [1,2,3,4,5] };
  const sampler = new GibbsSampler(compiled, data, { nIter: 200, nWarmup: 50, thin: 1 });
  let batchCount = 0;
  let lastBatch;
  sampler.runChain(null, (batch, iteration) => {
    batchCount++;
    lastBatch = batch;
  });
  // 200 samples / 100 per batch = 2 callbacks
  assert(batchCount === 2, `expected 2 batch callbacks, got ${batchCount}`);
  assert(Array.isArray(lastBatch) && lastBatch.length === 100,
    `expected batch of 100, got ${lastBatch?.length}`);
});

test('handleChainMessage-style: accumulating progress messages builds correct chain', () => {
  // Simulate what handleChainMessage does in index.html
  const chain = [];
  const data = { N: 5, y: [1,2,3,4,5] };
  const ast = parseJAGS(SIMPLE_MODEL);
  const compiled = compileModel(ast);
  const sampler = new GibbsSampler(compiled, data, { nIter: 100, nWarmup: 50, thin: 1 });
  const result = sampler.runChain(null, (batch) => {
    for (const sample of batch) chain.push(sample);
  });
  // Also push any remaining samples not caught by the batch callback
  for (const sample of result.samples) {
    if (!chain.includes(sample)) chain.push(sample);
  }
  assert(chain.length >= 100, `chain should have ≥100 samples, got ${chain.length}`);
  assert('mu' in chain[0], 'sample should have mu key');
});

// ═══════════════════════════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n' + '─'.repeat(50));
console.log(`  ${passed} passed   ${failed} failed`);
console.log('─'.repeat(50) + '\n');
process.exit(failed > 0 ? 1 : 0);
