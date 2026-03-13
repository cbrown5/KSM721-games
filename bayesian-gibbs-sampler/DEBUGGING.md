# BayesJS Debugging Guide

## Architecture at a Glance

```
index.html          UI, app state, orchestration
├── parser.js       JAGS tokenizer → AST → compiled model
├── distributions.js  log-density & sampling for each distribution
├── sampler.js      Metropolis-within-Gibbs, diagnostics (R̂, ESS)
├── worker.js       Web Worker wrapper (one per chain)
└── visualizer.js   Canvas plots: trace, density, ACF, summary table
```

### Data Flow

```
Data upload (CSV/JSON)
  → appState.data{}

"Run Sampler" click
  → parseJAGS(modelCode)        [parser.js]
  → compileModel(ast)           [parser.js]
  → identifyParameters(...)     [sampler.js]
  → spawn Workers (one/chain)   [worker.js]
      → GibbsSampler.runChain() [sampler.js]
          → ModelRuntime.logPosterior()
              → evalExpr()      [parser.js]
              → logDensity()    [distributions.js]
      → postMessage batches → live trace update
      → postMessage 'done'  → render all plots [visualizer.js]
```

---

## File-by-File Reference

### [index.html](index.html)

**App state:**
```javascript
appState = {
  data: {},        // variables loaded from file or inline
  chains: [],      // samples array per chain
  paramNames: [],  // free parameter names
  workers: [],     // active Worker objects
  running: false,
  startTime: null
}
```

**Entry point for a run:** search for `runSampler()` — this is where parsing, worker spawning, and result accumulation happens.

**Debugging tips:**
- "No free parameters found" → a variable expected to be a parameter was found in `appState.data`, or it has no stochastic node in the model.
- Workers store per-chain results; `appState.chains[chainId]` is the sample object keyed by param name.
- Elapsed time and iteration counter are updated in the `progress` message handler.

---

### [parser.js](parser.js)

**Key functions:**

| Function | Purpose |
|---|---|
| `tokenize(src)` | Returns token array; strips `#` comments |
| `parseModel(tokens)` | Entry point → AST with `type: 'Model'` |
| `compileModel(ast)` | Returns `{ stochasticNodes[], deterministicNodes[] }` |
| `evalExpr(node, env)` | Evaluate an AST expression node in an environment |

**AST node types:** `Model`, `ForLoop`, `Stochastic`, `Deterministic`, `BinOp`, `UnaryMinus`, `FunctionCall`, `Indexed`, `Variable`, `Literal`

**Debugging tips:**
- Parse errors surface as thrown `Error` with message indicating the unexpected token and position.
- `evalExpr` throws `"Undefined variable: X"` — the variable `X` is missing from the environment built in `ModelRuntime.buildEnv()`.
- Supported built-in functions: `sqrt exp log abs pow sin cos floor ceil round min max logit ilogit probit phi inprod`
- JAGS uses **1-based indexing** for arrays; `buildEnv` in sampler.js offsets by −1 when writing into JS arrays.

---

### [distributions.js](distributions.js)

**JAGS parametrization (important gotchas):**

| Distribution | JAGS call | Parameters |
|---|---|---|
| Normal | `dnorm(mu, tau)` | τ = 1/σ² (precision, **not** SD) |
| Log-Normal | `dlnorm(mu, tau)` | log-scale precision |
| Gamma | `dgamma(shape, rate)` | rate (not scale) |
| Exponential | `dexp(rate)` | rate |

**Key functions:**

| Function | Purpose |
|---|---|
| `logDensity(name, x, params)` | Returns log p(x \| params); returns `-Infinity` for out-of-support |
| `sampleDistribution(name, params)` | Draw one random variate |
| `randNormal()` | Box-Muller (cached: generates pair, returns one at a time) |
| `randGamma(shape, rate)` | Marsaglia & Tsang algorithm |

**Debugging tips:**
- `logDensity` returns `-Infinity` (not an error) when params are out of bounds (e.g. tau ≤ 0). This causes the posterior to be `-Infinity` and proposals get stuck — watch for acceptance rate = 0.
- Verify precision vs SD: if posteriors are far too wide/narrow the tau vs sigma confusion is the first thing to check.
- `logGamma` uses Lanczos approximation; only valid for positive arguments.

---

### [sampler.js](sampler.js)

**Key classes:**

**`ModelRuntime`**
- `buildEnv(params)` — merges `data` + `params` into one flat object; expands indexed variables.
- `logPosterior(params)` — sum of all stochastic node log-densities; returns `-Infinity` on any invalid density.
- Watch: deterministic nodes are evaluated inside `buildEnv` via `_evalDeterministics`; errors here silently produce `NaN` in the environment.

**`GibbsSampler`**
- `runChain(inits, onBatch)` — main loop; `onBatch` called every 100 post-warmup samples.
- Step-size adaptation every 50 iterations during warmup, targeting **44% acceptance** (Gelman recommendation for univariate Gaussian proposals).
- Thinning: only every `thin`-th sample stored after warmup.

**Diagnostic functions:**

| Function | What to watch |
|---|---|
| `rHat(chains, param)` | > 1.1 means chains haven't mixed — increase `nWarmup`/`nIter` |
| `ess(samples, param)` | Low ESS → high autocorrelation — increase `thin` or check model |
| `paramSummary(...)` | Aggregates mean, SD, quantiles, ESS, R̂ for summary table |

**`identifyParameters(compiled, data)`**
- Returns only **scalar, top-level** stochastic nodes whose name is not in `data`.
- Vectorised parameters (inside `for` loops) are **not** automatically identified — they must appear as scalar nodes too.

---

### [worker.js](worker.js)

**Message protocol:**

```javascript
// → Worker
{ cmd: 'run', modelSrc, data, options: { nIter, nWarmup, thin }, chainId }

// ← Worker (progress, every 100 samples)
{ type: 'progress', chainId, batch, iteration, totalIter }

// ← Worker (done)
{ type: 'done', chainId, samples, acceptanceRates, stepSizes, paramNames }

// ← Worker (error)
{ type: 'error', message }
```

**Debugging tips:**
- Worker errors are caught and sent as `{ type: 'error', message }` — check the Log tab in the UI or add `console.error` in the `onmessage` handler in index.html.
- Each worker re-imports all scripts via `importScripts`; a missing or renamed file will silently fail to spawn a worker.
- Workers are terminated on "Stop" and on page unload; stale worker references in `appState.workers` can prevent GC.

---

### [visualizer.js](visualizer.js)

**Plot functions:**

| Function | Canvas element | Notes |
|---|---|---|
| `drawTracePlot(canvas, chains, param)` | `#trace-canvas-{param}` | One polyline per chain |
| `drawDensityPlot(canvas, chains, param)` | `#density-canvas-{param}` | Histogram + 95% CI + mean |
| `drawACFPlot(canvas, samples, param)` | `#acf-canvas-{param}` | Up to lag 40 |
| `renderSummaryTable(container, summaries)` | `#summary-container` | HTML table, R̂ color-coded |

**Chain colors (in order):** `#2196F3 #E91E63 #4CAF50 #FF9800 #9C27B0 #00BCD4`

**Debugging tips:**
- Blank canvas → usually `chains` or `samples` is empty; add a `console.log` before the plot call.
- `niceAxis` can return an empty tick array if min === max (all samples identical, i.e. sampler is stuck).
- Density plot CI uses `Array.sort()` on raw samples — correct but O(n log n); for very large sample counts consider a quantile shortcut.

---

## Common Failure Modes

| Symptom | Likely cause | Where to look |
|---|---|---|
| "No free parameters found" | Variable in data, or no top-level stochastic node | `identifyParameters` in sampler.js; `appState.data` |
| Acceptance rate ≈ 0 | `logPosterior` always returns -Infinity | Precision τ ≤ 0; out-of-support initial value |
| R̂ > 1.1 | Chains haven't converged | Increase `nWarmup`; check priors |
| ESS very low | High autocorrelation | Increase `thin`; check step size adaptation |
| NaN in summary | Invalid arithmetic in deterministic node | `evalExpr` in parser.js; `_evalDeterministics` |
| Worker error in Log tab | Parse failure or missing variable | `worker.js` error handler; check model syntax |
| Blank plots | No samples collected | Worker `done` message; `appState.chains` |
| Wrong posterior scale | tau vs sigma confusion | distributions.js parametrization table above |
