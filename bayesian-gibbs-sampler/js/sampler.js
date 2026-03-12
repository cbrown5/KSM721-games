/**
 * sampler.js
 * Gibbs sampler engine for JAGS-like models.
 *
 * Strategy:
 *   - Uses a Metropolis-within-Gibbs step for each scalar stochastic node.
 *   - The proposal is a random walk N(current, stepSize²).
 *   - Step sizes are adapted during warm-up to target ~44% acceptance.
 *   - Data variables (supplied in the data dict) are treated as constants.
 */

'use strict';

// ---------------------------------------------------------------------------
// Runtime environment: evaluates the model for given parameter values
// ---------------------------------------------------------------------------

class ModelRuntime {
  constructor(compiled, data) {
    this.compiled = compiled;
    this.data = data; // { varName: value or array }
  }

  /**
   * Build the flat environment (all scalar variables + loop-expanded vars).
   * Returns { varName: value, "arr[i]": value, ... }
   */
  buildEnv(params) {
    // Start with data
    const env = Object.assign({}, this.data);

    // Overlay parameter values
    for (const [k, v] of Object.entries(params)) {
      env[k] = v;
    }

    // Expand data arrays so arr[i] lookups work (JAGS 1-based)
    for (const [k, v] of Object.entries(env)) {
      if (Array.isArray(v)) {
        for (let i = 0; i < v.length; i++) {
          env[`${k}[${i+1}]`] = v[i];
        }
      }
    }

    return env;
  }

  /**
   * Compute total log-posterior for the current parameter set.
   */
  logPosterior(params) {
    const env = this.buildEnv(params);
    let lp = 0;

    // Evaluate deterministic assignments first (they update env)
    this._evalDeterministics(env);

    // Sum log-densities for all stochastic nodes
    for (const node of this.compiled.stochasticNodes) {
      try {
        lp += this._evalStochasticLogDensity(node, env);
      } catch (e) {
        return -Infinity;
      }
    }

    return isFinite(lp) ? lp : -Infinity;
  }

  /** Run deterministic assignments to populate derived quantities in env. */
  _evalDeterministics(env) {
    const { deterministicNodes } = this.compiled;

    // Simple single pass; sufficient for non-circular DAGs
    for (const node of deterministicNodes) {
      if (node.loopContext && node.loopContext.length > 0) {
        this._evalInLoops(node.loopContext, env, (loopEnv) => {
          const val = evalExpr(node.rhs, loopEnv);
          const lhs = node.lhs;
          if (lhs.type === 'Index') {
            const i = Math.round(evalExpr(lhs.idx, loopEnv));
            if (!Array.isArray(env[lhs.name])) env[lhs.name] = [];
            env[lhs.name][i - 1] = val;
            env[`${lhs.name}[${i}]`] = val;
          } else {
            env[lhs.name] = val;
          }
        });
      } else {
        const lhs = node.lhs;
        const val = evalExpr(node.rhs, env);
        if (lhs.type === 'Index') {
          const i = Math.round(evalExpr(lhs.idx, env));
          if (!Array.isArray(env[lhs.name])) env[lhs.name] = [];
          env[lhs.name][i - 1] = val;
          env[`${lhs.name}[${i}]`] = val;
        } else {
          env[lhs.name] = val;
        }
      }
    }
  }

  _evalInLoops(contexts, env, fn) {
    if (contexts.length === 0) { fn(env); return; }
    const [first, ...rest] = contexts;
    const from = Math.round(evalExpr(first.from, env));
    const to = Math.round(evalExpr(first.to, env));
    for (let i = from; i <= to; i++) {
      const loopEnv = Object.assign({}, env, { [first.index]: i });
      this._evalInLoops(rest, loopEnv, fn);
    }
  }

  _evalStochasticLogDensity(node, env) {
    const { lhs, dist, loopContext } = node;
    let total = 0;

    const accumulate = (loopEnv) => {
      // Evaluate distribution parameters
      const paramVals = dist.params.map(p => evalExpr(p, loopEnv));
      // Get the observed/current value of the LHS
      let x;
      if (lhs.type === 'Index') {
        const i = Math.round(evalExpr(lhs.idx, loopEnv));
        const arr = loopEnv[lhs.name];
        x = Array.isArray(arr) ? arr[i - 1] : loopEnv[`${lhs.name}[${i}]`];
      } else {
        x = loopEnv[lhs.name];
      }
      if (x === undefined || x === null) return;
      const ld = logDensity(dist.name, x, paramVals);
      total += isFinite(ld) ? ld : -Infinity;
    };

    if (loopContext && loopContext.length > 0) {
      this._evalInLoops(loopContext, env, accumulate);
    } else {
      accumulate(env);
    }

    return total;
  }
}

// ---------------------------------------------------------------------------
// Identify free (unobserved) parameters
// ---------------------------------------------------------------------------

function identifyParameters(compiled, data) {
  const dataKeys = new Set(Object.keys(data));
  const params = [];

  const seen = new Set();
  const addParam = (name) => {
    if (!dataKeys.has(name) && !seen.has(name)) {
      seen.add(name);
      params.push(name);
    }
  };

  for (const node of compiled.stochasticNodes) {
    // Only scalar (non-indexed) top-level nodes without loop context are
    // simple scalar parameters; indexed nodes inside loops are data or
    // latent arrays — we track them separately.
    if (node.lhs.type === 'Var' && (!node.loopContext || node.loopContext.length === 0)) {
      addParam(node.lhs.name);
    }
  }

  return params;
}

// ---------------------------------------------------------------------------
// Initialisation: sample from priors (or use supplied inits)
// ---------------------------------------------------------------------------

function initParams(compiled, data, customInits) {
  const params = identifyParameters(compiled, data);
  const init = {};

  for (const pname of params) {
    if (customInits && customInits[pname] !== undefined) {
      init[pname] = customInits[pname];
      continue;
    }
    // Find the stochastic node for this parameter and sample from prior
    const node = compiled.stochasticNodes.find(n =>
      n.lhs.type === 'Var' && n.lhs.name === pname
    );
    if (!node) { init[pname] = 0; continue; }

    // Evaluate prior parameters using data only
    const env = Object.assign({}, data);
    // Add already-initialised params
    Object.assign(env, init);
    try {
      const paramVals = node.dist.params.map(p => evalExpr(p, env));
      init[pname] = sampleDistribution(node.dist.name, paramVals);
    } catch (e) {
      init[pname] = 0;
    }
  }

  return init;
}

// ---------------------------------------------------------------------------
// Metropolis-within-Gibbs sampler
// ---------------------------------------------------------------------------

class GibbsSampler {
  /**
   * @param {object} compiled   - output of compileModel()
   * @param {object} data       - { varName: number | number[] }
   * @param {object} options    - { nIter, nWarmup, nChains, thin, seed, stepSizes }
   */
  constructor(compiled, data, options = {}) {
    this.runtime = new ModelRuntime(compiled, data);
    this.compiled = compiled;
    this.data = data;

    this.nIter   = options.nIter   ?? 2000;
    this.nWarmup = options.nWarmup ?? 1000;
    this.thin    = options.thin    ?? 1;
    this.paramNames = identifyParameters(compiled, data);

    // Step sizes per parameter (adapted during warmup)
    this.stepSizes = {};
    for (const p of this.paramNames) {
      this.stepSizes[p] = options.stepSizes?.[p] ?? 1.0;
    }
  }

  /**
   * Run a single chain and return samples.
   * @param {object|null} inits   - initial parameter values (null = sample from prior)
   * @param {function}    onBatch - callback(batchSamples, iteration) for progress
   */
  runChain(inits = null, onBatch = null) {
    const params = Object.assign({}, initParams(this.compiled, this.data, inits));
    const stepSizes = Object.assign({}, this.stepSizes);
    const samples = [];  // array of {paramName: value, ...} per kept iteration

    const acceptCounts = {};
    const tryCounts = {};
    for (const p of this.paramNames) { acceptCounts[p] = 0; tryCounts[p] = 0; }

    const totalIter = this.nWarmup + this.nIter;
    const BATCH = 100; // report every N iters

    for (let iter = 0; iter < totalIter; iter++) {
      // --- One Gibbs sweep: update each parameter in turn ---
      for (const pname of this.paramNames) {
        const current = params[pname];
        const step = stepSizes[pname];

        // Propose from Gaussian random walk
        const proposed = current + randNormal() * step;
        const lpCurrent = this.runtime.logPosterior(params);
        const oldVal = params[pname];
        params[pname] = proposed;
        const lpProposed = this.runtime.logPosterior(params);

        // Metropolis acceptance
        const logAlpha = lpProposed - lpCurrent;
        if (Math.log(Math.random()) < logAlpha) {
          // Accept
          acceptCounts[pname]++;
        } else {
          // Reject — restore
          params[pname] = oldVal;
        }
        tryCounts[pname]++;
      }

      // --- Adapt step sizes during warmup ---
      if (iter < this.nWarmup && iter % 50 === 49) {
        for (const p of this.paramNames) {
          const rate = acceptCounts[p] / tryCounts[p];
          // Target acceptance ~44% for univariate proposals
          if (rate > 0.5) stepSizes[p] *= 1.2;
          else if (rate < 0.3) stepSizes[p] *= 0.8;
          acceptCounts[p] = 0;
          tryCounts[p] = 0;
        }
      }

      // --- Collect sample (post warmup, apply thinning) ---
      if (iter >= this.nWarmup && (iter - this.nWarmup) % this.thin === 0) {
        const snap = {};
        for (const p of this.paramNames) snap[p] = params[p];
        samples.push(snap);

        if (onBatch && samples.length % BATCH === 0) {
          onBatch(samples.slice(-BATCH), iter);
        }
      }
    }

    // Final acceptance rates
    const acceptanceRates = {};
    for (const p of this.paramNames) {
      acceptanceRates[p] = tryCounts[p] > 0 ? acceptCounts[p] / tryCounts[p] : NaN;
    }

    return { samples, stepSizes, acceptanceRates };
  }
}

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

/** Gelman-Rubin R-hat (simplified: compare chain means/variances) */
function rHat(chains, param) {
  const m = chains.length;
  const n = chains[0].length;
  const chainMeans = chains.map(c => {
    const vals = c.map(s => s[param]);
    return vals.reduce((a,b) => a+b, 0) / n;
  });
  const grandMean = chainMeans.reduce((a,b) => a+b, 0) / m;

  const B = n / (m - 1) * chainMeans.reduce((s, cm) => s + (cm - grandMean)**2, 0);
  const W = chains.reduce((s, c) => {
    const vals = c.map(s => s[param]);
    const cm = vals.reduce((a,b)=>a+b,0)/n;
    return s + vals.reduce((ss,v) => ss + (v-cm)**2, 0) / (n-1);
  }, 0) / m;

  const varPlus = ((n - 1) / n) * W + B / n;
  return Math.sqrt(varPlus / W);
}

/** Effective sample size */
function ess(samples, param) {
  const vals = samples.map(s => s[param]);
  const n = vals.length;
  const mean = vals.reduce((a,b) => a+b, 0) / n;
  const variance = vals.reduce((s,v) => s + (v-mean)**2, 0) / (n-1);
  if (variance === 0) return n;

  let rho = 0;
  const maxLag = Math.min(Math.floor(n / 3), 100);
  for (let lag = 1; lag <= maxLag; lag++) {
    let acov = 0;
    for (let i = 0; i < n - lag; i++) acov += (vals[i] - mean) * (vals[i+lag] - mean);
    acov /= (n - 1);
    const ac = acov / variance;
    if (Math.abs(ac) < 2 / Math.sqrt(n)) break;
    rho += ac;
  }
  return Math.min(n, n / (1 + 2 * rho));
}

/** Summary statistics for a parameter across all chains */
function paramSummary(chains, param) {
  const allVals = chains.flatMap(c => c.map(s => s[param]));
  allVals.sort((a, b) => a - b);
  const n = allVals.length;
  const mean = allVals.reduce((a,b) => a+b, 0) / n;
  const variance = allVals.reduce((s,v) => s + (v-mean)**2, 0) / (n-1);
  const sd = Math.sqrt(variance);
  const q025 = allVals[Math.floor(0.025 * n)];
  const q250 = allVals[Math.floor(0.250 * n)];
  const q500 = allVals[Math.floor(0.500 * n)];
  const q750 = allVals[Math.floor(0.750 * n)];
  const q975 = allVals[Math.floor(0.975 * n)];
  const essVal = ess(chains[0], param);
  const rhat = chains.length > 1 ? rHat(chains, param) : NaN;

  return { mean, sd, q025, q250, q500, q750, q975, ess: Math.round(essVal), rhat };
}

// Export
const samplerExports = { GibbsSampler, ModelRuntime, identifyParameters, initParams, rHat, ess, paramSummary };

if (typeof module !== 'undefined') {
  module.exports = samplerExports;
} else if (typeof self !== 'undefined') {
  Object.assign(self, samplerExports);
} else {
  Object.assign(window, samplerExports);
}
