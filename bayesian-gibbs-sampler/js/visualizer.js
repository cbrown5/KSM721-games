/**
 * visualizer.js
 * Canvas-based MCMC visualisation: trace plots, density histograms, ACF plots.
 * No external dependencies. All rendering uses the 2D Canvas API.
 */

'use strict';

// ---------------------------------------------------------------------------
// Colour palette for chains
// ---------------------------------------------------------------------------

const CHAIN_COLORS = [
  '#2196F3', '#E91E63', '#4CAF50', '#FF9800', '#9C27B0', '#00BCD4'
];

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

function minMax(arr) {
  let mn = Infinity, mx = -Infinity;
  for (const v of arr) { if (v < mn) mn = v; if (v > mx) mx = v; }
  return [mn, mx];
}

function nice(val, round = false) {
  const exp = Math.pow(10, Math.floor(Math.log10(Math.abs(val))));
  const f = val / exp;
  let nf;
  if (round) nf = f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10;
  else       nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return nf * exp;
}

function niceAxis(mn, mx, numTicks = 5) {
  const range = nice(mx - mn, false);
  const step  = nice(range / (numTicks - 1), true);
  const lo = Math.floor(mn / step) * step;
  const hi = Math.ceil(mx / step) * step;
  const ticks = [];
  for (let t = lo; t <= hi + step * 0.001; t += step) ticks.push(parseFloat(t.toPrecision(6)));
  return ticks;
}

function formatNum(v, dp = 3) {
  if (Math.abs(v) >= 1e4 || (Math.abs(v) < 0.001 && v !== 0)) return v.toExponential(2);
  return v.toFixed(dp);
}

// ---------------------------------------------------------------------------
// Base plot class
// ---------------------------------------------------------------------------

class BasePlot {
  constructor(canvas, margin = { top: 30, right: 20, bottom: 45, left: 60 }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.margin = margin;
    this.w = canvas.width  - margin.left - margin.right;
    this.h = canvas.height - margin.top  - margin.bottom;
  }

  clear(bg = '#1a1a2e') {
    const { ctx, canvas } = this;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  _dataX(x, xMin, xMax) { return this.margin.left + (x - xMin) / (xMax - xMin) * this.w; }
  _dataY(y, yMin, yMax) { return this.margin.top  + (1 - (y - yMin) / (yMax - yMin)) * this.h; }

  drawAxes(xTicks, yTicks, xMin, xMax, yMin, yMax, xLabel = '', yLabel = '') {
    const { ctx, margin, w, h } = this;
    ctx.save();

    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    for (const t of yTicks) {
      const y = this._dataY(t, yMin, yMax);
      ctx.beginPath(); ctx.moveTo(margin.left, y); ctx.lineTo(margin.left + w, y); ctx.stroke();
    }
    for (const t of xTicks) {
      const x = this._dataX(t, xMin, xMax);
      ctx.beginPath(); ctx.moveTo(x, margin.top); ctx.lineTo(x, margin.top + h); ctx.stroke();
    }

    // Axes
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(margin.left, margin.top); ctx.lineTo(margin.left, margin.top + h); // y-axis
    ctx.moveTo(margin.left, margin.top + h); ctx.lineTo(margin.left + w, margin.top + h); // x-axis
    ctx.stroke();

    // Tick labels
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '11px monospace';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (const t of yTicks) {
      const y = this._dataY(t, yMin, yMax);
      ctx.fillText(formatNum(t, 2), margin.left - 6, y);
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (const t of xTicks) {
      const x = this._dataX(t, xMin, xMax);
      ctx.fillText(formatNum(t, 2), x, margin.top + h + 6);
    }

    // Axis labels
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    if (xLabel) ctx.fillText(xLabel, margin.left + w / 2, margin.top + h + 30);
    if (yLabel) {
      ctx.save();
      ctx.translate(14, margin.top + h / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(yLabel, 0, 0);
      ctx.restore();
    }

    ctx.restore();
  }

  title(text) {
    const { ctx, canvas, margin } = this;
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(text, margin.left + this.w / 2, 8);
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// Trace plot
// ---------------------------------------------------------------------------

function drawTracePlot(canvas, chainSamples, paramName, warmup = 0) {
  /**
   * chainSamples: array of chains, each chain is array of sample objects.
   * paramName: which parameter to plot.
   */
  const plot = new BasePlot(canvas);
  plot.clear();

  const allVals = chainSamples.flatMap(c => c.map(s => s[paramName]));
  if (allVals.length === 0) return;

  const [yMin, yMax] = minMax(allVals);
  const yPad = (yMax - yMin) * 0.05 || 0.1;
  const yLo = yMin - yPad, yHi = yMax + yPad;
  const xLo = 0, xHi = chainSamples[0].length;

  const xTicks = niceAxis(xLo, xHi, 6);
  const yTicks = niceAxis(yLo, yHi, 6);

  plot.drawAxes(xTicks, yTicks, xLo, xHi, yLo, yHi, 'Iteration', paramName);
  plot.title(`Trace: ${paramName}`);

  const { ctx } = plot;
  ctx.save();

  chainSamples.forEach((chain, ci) => {
    ctx.strokeStyle = CHAIN_COLORS[ci % CHAIN_COLORS.length];
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    chain.forEach((s, i) => {
      const x = plot._dataX(i, xLo, xHi);
      const y = plot._dataY(s[paramName], yLo, yHi);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
  });

  ctx.restore();
}

// ---------------------------------------------------------------------------
// Density (histogram) plot
// ---------------------------------------------------------------------------

function drawDensityPlot(canvas, chainSamples, paramName, bins = 40) {
  const plot = new BasePlot(canvas);
  plot.clear();

  const allVals = chainSamples.flatMap(c => c.map(s => s[paramName]));
  if (allVals.length === 0) return;

  const [xMin, xMax] = minMax(allVals);
  const xPad = (xMax - xMin) * 0.05 || 0.1;
  const xLo = xMin - xPad, xHi = xMax + xPad;

  // Build histogram
  const binEdges = [];
  for (let b = 0; b <= bins; b++) binEdges.push(xLo + (xHi - xLo) * b / bins);
  const counts = new Float64Array(bins);
  for (const v of allVals) {
    const b = Math.min(bins - 1, Math.floor((v - xLo) / (xHi - xLo) * bins));
    if (b >= 0) counts[b]++;
  }

  // Normalise to density
  const binW = (xHi - xLo) / bins;
  const density = Array.from(counts).map(c => c / (allVals.length * binW));
  const yHi = Math.max(...density) * 1.1 || 0.1;

  const xTicks = niceAxis(xLo, xHi, 6);
  const yTicks = niceAxis(0, yHi, 5);

  plot.drawAxes(xTicks, yTicks, xLo, xHi, 0, yHi, paramName, 'Density');
  plot.title(`Posterior: ${paramName}`);

  const { ctx, margin } = plot;
  ctx.save();

  // Draw bars
  ctx.fillStyle = 'rgba(33, 150, 243, 0.65)';
  ctx.strokeStyle = 'rgba(33, 150, 243, 0.9)';
  ctx.lineWidth = 0.5;
  density.forEach((d, i) => {
    const x1 = plot._dataX(binEdges[i],   xLo, xHi);
    const x2 = plot._dataX(binEdges[i+1], xLo, xHi);
    const y1 = plot._dataY(d, 0, yHi);
    const y2 = plot._dataY(0, 0, yHi);
    ctx.fillRect(x1, y1, x2 - x1 - 1, y2 - y1);
    ctx.strokeRect(x1, y1, x2 - x1 - 1, y2 - y1);
  });

  // 95% credible interval lines
  const sorted = [...allVals].sort((a, b) => a - b);
  const n = sorted.length;
  const lo95 = sorted[Math.floor(0.025 * n)];
  const hi95 = sorted[Math.floor(0.975 * n)];

  ctx.strokeStyle = 'rgba(255, 87, 34, 0.85)';
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 3]);
  for (const qv of [lo95, hi95]) {
    const qx = plot._dataX(qv, xLo, xHi);
    ctx.beginPath(); ctx.moveTo(qx, margin.top); ctx.lineTo(qx, margin.top + plot.h); ctx.stroke();
  }
  ctx.setLineDash([]);

  // Mean line
  const mean = allVals.reduce((a,b) => a+b, 0) / n;
  ctx.strokeStyle = 'rgba(255, 235, 59, 0.9)';
  ctx.lineWidth = 2;
  const mx = plot._dataX(mean, xLo, xHi);
  ctx.beginPath(); ctx.moveTo(mx, margin.top); ctx.lineTo(mx, margin.top + plot.h); ctx.stroke();

  ctx.restore();
}

// ---------------------------------------------------------------------------
// ACF plot
// ---------------------------------------------------------------------------

function drawACFPlot(canvas, samples, paramName, maxLag = 40) {
  const vals = samples.map(s => s[paramName]);
  const n = vals.length;
  const mean = vals.reduce((a,b) => a+b, 0) / n;
  const variance = vals.reduce((s,v) => s + (v-mean)**2, 0) / n;

  const acf = [1];
  for (let lag = 1; lag <= Math.min(maxLag, n - 1); lag++) {
    let cov = 0;
    for (let i = 0; i < n - lag; i++) cov += (vals[i] - mean) * (vals[i+lag] - mean);
    acf.push(variance > 0 ? cov / (n * variance) : 0);
  }

  const plot = new BasePlot(canvas, { top: 30, right: 20, bottom: 45, left: 55 });
  plot.clear();

  const xTicks = niceAxis(0, acf.length - 1, 6);
  const yTicks = niceAxis(-0.3, 1, 6);

  plot.drawAxes(xTicks, yTicks, 0, acf.length - 1, -0.3, 1, 'Lag', 'ACF');
  plot.title(`ACF: ${paramName}`);

  const { ctx } = plot;
  ctx.save();

  // 95% significance bounds ±1.96/sqrt(n)
  const bound = 1.96 / Math.sqrt(n);
  ctx.strokeStyle = 'rgba(255, 87, 34, 0.5)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 3]);
  for (const bv of [bound, -bound]) {
    const by = plot._dataY(bv, -0.3, 1);
    ctx.beginPath(); ctx.moveTo(plot.margin.left, by); ctx.lineTo(plot.margin.left + plot.w, by); ctx.stroke();
  }
  ctx.setLineDash([]);

  // Bars
  acf.forEach((r, lag) => {
    const x = plot._dataX(lag, 0, acf.length - 1);
    const yBase = plot._dataY(0, -0.3, 1);
    const yTop  = plot._dataY(r, -0.3, 1);
    ctx.fillStyle = Math.abs(r) > bound ? 'rgba(33,150,243,0.8)' : 'rgba(150,150,200,0.5)';
    ctx.fillRect(x - 3, Math.min(yTop, yBase), 6, Math.abs(yTop - yBase));
  });

  ctx.restore();
}

// ---------------------------------------------------------------------------
// Summary table renderer
// ---------------------------------------------------------------------------

function renderSummaryTable(container, summaries) {
  /**
   * summaries: { paramName: { mean, sd, q025, q500, q975, ess, rhat } }
   */
  const cols = ['Parameter', 'Mean', 'SD', '2.5%', 'Median', '97.5%', 'ESS', 'R-hat'];
  let html = `<table class="summary-table">
    <thead><tr>${cols.map(c => `<th>${c}</th>`).join('')}</tr></thead>
    <tbody>`;

  for (const [name, s] of Object.entries(summaries)) {
    const rhatCell = isNaN(s.rhat) ? '<td>—</td>' :
      `<td class="${s.rhat < 1.1 ? 'good' : 'warn'}">${s.rhat.toFixed(3)}</td>`;

    html += `<tr>
      <td class="param-name">${name}</td>
      <td>${formatNum(s.mean)}</td>
      <td>${formatNum(s.sd)}</td>
      <td>${formatNum(s.q025)}</td>
      <td>${formatNum(s.q500)}</td>
      <td>${formatNum(s.q975)}</td>
      <td>${s.ess}</td>
      ${rhatCell}
    </tr>`;
  }
  html += '</tbody></table>';
  container.innerHTML = html;
}

// Export
const vizExports = { drawTracePlot, drawDensityPlot, drawACFPlot, renderSummaryTable, CHAIN_COLORS };

if (typeof module !== 'undefined') {
  module.exports = vizExports;
} else {
  Object.assign(window, vizExports);
}
