# BayesJS — Bayesian Gibbs Sampler

A browser-based Bayesian Gibbs sampler that accepts JAGS-syntax model code. No installation required — runs entirely in the browser via JavaScript Web Workers.

## Serving locally

Because the app uses Web Workers (which load scripts from `js/`), it must be served over HTTP — opening `index.html` directly as a `file://` URL will block the workers (the app falls back to main-thread sampling, but the UI may freeze).

**Quickest option — Python:**

```bash
cd bayesian-gibbs-sampler
python3 -m http.server 8080
```

Then open [http://localhost:8080](http://localhost:8080).

**Alternatives:**

```bash
# Node (npx)
npx serve bayesian-gibbs-sampler

# VS Code
# Install the "Live Server" extension, right-click index.html → Open with Live Server
```

## Usage

1. **Load data** — upload a CSV or JSON file, or use one of the built-in examples. CSV files automatically get an `N` variable (row count).
2. **Write a model** — use JAGS syntax in the model editor. Variable names must match your data columns.
3. **Configure sampler** — set number of chains, warmup iterations, samples, and thinning.
4. **Run** — click **Run Sampler** and watch traces update live.

### Built-in examples

| Button | Model |
|--------|-------|
| Linear regression | Normal likelihood, flat priors on intercept/slope/precision |
| Group means | Estimate mean and precision of a single variable |
| Logistic | Bernoulli likelihood with logit link |

## Model syntax

JAGS syntax with `~` for stochastic nodes and `<-` for deterministic nodes:

```jags
model {
  for (i in 1:N) {
    y[i] ~ dnorm(mu[i], tau)
    mu[i] <- alpha + beta * x[i]
  }
  alpha ~ dnorm(0, 0.001)
  beta  ~ dnorm(0, 0.001)
  tau   ~ dgamma(1, 1)
  sigma <- 1 / sqrt(tau)
}
```

Supported distributions are shown in the **Distributions** panel at the bottom-left.

## Output tabs

| Tab | What you see |
|-----|-------------|
| Traces | MCMC trace plot for the selected parameter |
| Posteriors | Posterior density (KDE) |
| ACF | Autocorrelation function (chain 1) |
| Summary | Mean, SD, credible intervals, R-hat, ESS |
| Log | Sampler messages and acceptance rates |

## File structure

```
bayesian-gibbs-sampler/
├── index.html          # Main app
└── js/
    ├── distributions.js  # Sampling & log-density functions
    ├── parser.js         # JAGS model parser → AST
    ├── sampler.js        # Gibbs/MH sampler
    ├── visualizer.js     # Canvas plots
    └── worker.js         # Web Worker wrapper for parallel chains
```
