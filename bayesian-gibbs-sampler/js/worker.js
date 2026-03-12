/**
 * worker.js
 * Web Worker that runs MCMC chains off the main thread.
 * Loaded by the main app as: new Worker('js/worker.js')
 *
 * Messages IN (from main):
 *   { cmd: 'run', modelSrc, data, options: { nIter, nWarmup, nChains, thin } }
 *
 * Messages OUT (to main):
 *   { type: 'progress', chainId, batch, iteration, totalIter }
 *   { type: 'done',     chainId, samples, acceptanceRates, stepSizes }
 *   { type: 'error',    message }
 */

'use strict';

// Import all modules relative to worker location
// In a browser, use importScripts; in Node (testing) use require
if (typeof importScripts === 'function') {
  importScripts('distributions.js', 'parser.js', 'sampler.js');
}

self.onmessage = function(event) {
  const msg = event.data;

  if (msg.cmd === 'run') {
    try {
      const { modelSrc, data, options, chainId } = msg;
      const nIter   = options.nIter   ?? 2000;
      const nWarmup = options.nWarmup ?? 1000;
      const thin    = options.thin    ?? 1;

      // Parse and compile the model
      const ast = parseJAGS(modelSrc);
      const compiled = compileModel(ast);

      // Set up the sampler
      const sampler = new GibbsSampler(compiled, data, { nIter, nWarmup, thin });

      // Run chain with progress callbacks
      const result = sampler.runChain(null, (batch, iteration) => {
        self.postMessage({
          type: 'progress',
          chainId,
          batch,
          iteration,
          totalIter: nWarmup + nIter
        });
      });

      self.postMessage({
        type: 'done',
        chainId,
        samples: result.samples,
        acceptanceRates: result.acceptanceRates,
        stepSizes: result.stepSizes,
        paramNames: sampler.paramNames
      });

    } catch (e) {
      self.postMessage({ type: 'error', message: e.message + '\n' + (e.stack || '') });
    }
  }
};
