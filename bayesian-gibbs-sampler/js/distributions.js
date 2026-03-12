/**
 * distributions.js
 * Modular statistical distribution library for the Bayesian Gibbs Sampler.
 * Each distribution exposes: sample(params), logDensity(x, params), validate(params)
 * JAGS parametrization is used throughout (normal uses precision, not std dev).
 *
 * To add a new distribution:
 *   1. Add an entry to the DISTRIBUTIONS object below.
 *   2. Implement sample(params), logDensity(x, params), validate(params), and description.
 */

'use strict';

// ---------------------------------------------------------------------------
// Low-level random primitives (no external deps required)
// ---------------------------------------------------------------------------

/** Standard uniform [0, 1) */
function randUniform() {
  return Math.random();
}

/** Standard normal via Box-Muller */
let _spareNormal = null;
function randNormal() {
  if (_spareNormal !== null) {
    const v = _spareNormal;
    _spareNormal = null;
    return v;
  }
  let u, v, s;
  do {
    u = 2 * Math.random() - 1;
    v = 2 * Math.random() - 1;
    s = u * u + v * v;
  } while (s >= 1 || s === 0);
  const mul = Math.sqrt(-2 * Math.log(s) / s);
  _spareNormal = v * mul;
  return u * mul;
}

/** Gamma(shape, 1) via Marsaglia & Tsang (2000) */
function randGamma1(shape) {
  if (shape < 1) {
    // Boost using: Gamma(a) = Gamma(a+1) * U^(1/a)
    return randGamma1(shape + 1) * Math.pow(randUniform(), 1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  while (true) {
    let x, v;
    do {
      x = randNormal();
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = randUniform();
    if (u < 1 - 0.0331 * (x * x) * (x * x)) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

/** Gamma(shape, rate) — note: rate = 1/scale */
function randGamma(shape, rate) {
  return randGamma1(shape) / rate;
}

/** Beta(a, b) via two gamma samples */
function randBeta(a, b) {
  const x = randGamma1(a);
  const y = randGamma1(b);
  return x / (x + y);
}

// ---------------------------------------------------------------------------
// Log-density helpers
// ---------------------------------------------------------------------------

const LOG_SQRT_2PI = 0.5 * Math.log(2 * Math.PI);
const LOG2 = Math.log(2);

function logGamma(n) {
  // Lanczos approximation
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7
  ];
  if (n < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * n)) - logGamma(1 - n);
  n -= 1;
  let a = c[0];
  const t = n + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += c[i] / (n + i);
  return 0.5 * Math.log(2 * Math.PI) + (n + 0.5) * Math.log(t) - t + Math.log(a);
}

// ---------------------------------------------------------------------------
// Distribution registry
// ---------------------------------------------------------------------------

const DISTRIBUTIONS = {

  // --- Normal (precision parametrization, like JAGS) ---
  // dnorm(mu, tau)  where tau = 1/sigma^2
  dnorm: {
    params: ['mu', 'tau'],
    description: 'Normal distribution: dnorm(mu, tau) where tau = precision = 1/sigma²',
    validate(params) {
      if (params[1] <= 0) throw new Error('dnorm: tau (precision) must be > 0');
    },
    sample([mu, tau]) {
      return mu + randNormal() / Math.sqrt(tau);
    },
    logDensity(x, [mu, tau]) {
      const sigma2 = 1 / tau;
      return 0.5 * Math.log(tau) - LOG_SQRT_2PI - 0.5 * (x - mu) ** 2 * tau;
    }
  },

  // --- Exponential ---
  // dexp(rate)  — JAGS uses rate parametrization
  dexp: {
    params: ['rate'],
    description: 'Exponential distribution: dexp(rate)',
    validate(params) {
      if (params[0] <= 0) throw new Error('dexp: rate must be > 0');
    },
    sample([rate]) {
      return -Math.log(randUniform()) / rate;
    },
    logDensity(x, [rate]) {
      if (x < 0) return -Infinity;
      return Math.log(rate) - rate * x;
    }
  },

  // --- Uniform ---
  // dunif(lower, upper)
  dunif: {
    params: ['lower', 'upper'],
    description: 'Uniform distribution: dunif(lower, upper)',
    validate(params) {
      if (params[0] >= params[1]) throw new Error('dunif: lower must be < upper');
    },
    sample([lower, upper]) {
      return lower + randUniform() * (upper - lower);
    },
    logDensity(x, [lower, upper]) {
      if (x < lower || x > upper) return -Infinity;
      return -Math.log(upper - lower);
    }
  },

  // --- Gamma ---
  // dgamma(shape, rate)  — JAGS uses rate (not scale)
  dgamma: {
    params: ['shape', 'rate'],
    description: 'Gamma distribution: dgamma(shape, rate) where rate = 1/scale',
    validate(params) {
      if (params[0] <= 0) throw new Error('dgamma: shape must be > 0');
      if (params[1] <= 0) throw new Error('dgamma: rate must be > 0');
    },
    sample([shape, rate]) {
      return randGamma(shape, rate);
    },
    logDensity(x, [shape, rate]) {
      if (x <= 0) return -Infinity;
      return shape * Math.log(rate) - logGamma(shape) + (shape - 1) * Math.log(x) - rate * x;
    }
  },

  // --- Beta ---
  // dbeta(a, b)
  dbeta: {
    params: ['a', 'b'],
    description: 'Beta distribution: dbeta(a, b)',
    validate(params) {
      if (params[0] <= 0) throw new Error('dbeta: a must be > 0');
      if (params[1] <= 0) throw new Error('dbeta: b must be > 0');
    },
    sample([a, b]) {
      return randBeta(a, b);
    },
    logDensity(x, [a, b]) {
      if (x <= 0 || x >= 1) return -Infinity;
      return (a - 1) * Math.log(x) + (b - 1) * Math.log(1 - x) - logGamma(a) - logGamma(b) + logGamma(a + b);
    }
  },

  // --- Bernoulli ---
  // dbern(p)
  dbern: {
    params: ['p'],
    description: 'Bernoulli distribution: dbern(p)',
    validate(params) {
      if (params[0] < 0 || params[0] > 1) throw new Error('dbern: p must be in [0,1]');
    },
    sample([p]) {
      return randUniform() < p ? 1 : 0;
    },
    logDensity(x, [p]) {
      if (x !== 0 && x !== 1) return -Infinity;
      return x === 1 ? Math.log(p) : Math.log(1 - p);
    }
  },

  // --- Poisson ---
  // dpois(lambda)
  dpois: {
    params: ['lambda'],
    description: 'Poisson distribution: dpois(lambda)',
    validate(params) {
      if (params[0] <= 0) throw new Error('dpois: lambda must be > 0');
    },
    sample([lambda]) {
      // Knuth algorithm for small lambda
      let L = Math.exp(-lambda), k = 0, p = 1;
      do { k++; p *= randUniform(); } while (p > L);
      return k - 1;
    },
    logDensity(x, [lambda]) {
      if (x < 0 || !Number.isInteger(x)) return -Infinity;
      let logFact = 0;
      for (let i = 2; i <= x; i++) logFact += Math.log(i);
      return x * Math.log(lambda) - lambda - logFact;
    }
  },

  // --- Log-Normal ---
  // dlnorm(meanlog, taulog) — precision on log scale
  dlnorm: {
    params: ['meanlog', 'taulog'],
    description: 'Log-normal distribution: dlnorm(meanlog, taulog) on log scale',
    validate(params) {
      if (params[1] <= 0) throw new Error('dlnorm: taulog must be > 0');
    },
    sample([meanlog, taulog]) {
      return Math.exp(meanlog + randNormal() / Math.sqrt(taulog));
    },
    logDensity(x, [meanlog, taulog]) {
      if (x <= 0) return -Infinity;
      const lx = Math.log(x);
      return 0.5 * Math.log(taulog) - LOG_SQRT_2PI - Math.log(x) - 0.5 * taulog * (lx - meanlog) ** 2;
    }
  },

  // --- Chi-squared ---
  // dchisq(k)
  dchisq: {
    params: ['k'],
    description: 'Chi-squared distribution: dchisq(k) with k degrees of freedom',
    validate(params) {
      if (params[0] <= 0) throw new Error('dchisq: k must be > 0');
    },
    sample([k]) {
      return randGamma(k / 2, 0.5);
    },
    logDensity(x, [k]) {
      if (x <= 0) return -Infinity;
      return (k / 2 - 1) * Math.log(x) - x / 2 - (k / 2) * Math.log(2) - logGamma(k / 2);
    }
  }
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function getDistribution(name) {
  const d = DISTRIBUTIONS[name];
  if (!d) throw new Error(`Unknown distribution: "${name}". Available: ${Object.keys(DISTRIBUTIONS).join(', ')}`);
  return d;
}

function sampleDistribution(name, params) {
  const d = getDistribution(name);
  d.validate(params);
  return d.sample(params);
}

function logDensity(name, x, params) {
  const d = getDistribution(name);
  return d.logDensity(x, params);
}

function listDistributions() {
  return Object.entries(DISTRIBUTIONS).map(([name, d]) => ({ name, ...d }));
}

// Export for both browser (global) and Web Worker (self)
const _exports = { getDistribution, sampleDistribution, logDensity, listDistributions, DISTRIBUTIONS, randNormal, randGamma, randBeta, randUniform };

if (typeof module !== 'undefined') {
  module.exports = _exports;
} else if (typeof self !== 'undefined') {
  Object.assign(self, _exports);
} else {
  Object.assign(window, _exports);
}
