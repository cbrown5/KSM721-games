"use strict";

// ─── Audio Manager ────────────────────────────────────────────────────────────
var audio = (function () {
  var ctx = null, ok = false;
  try { ctx = new (window.AudioContext || window.webkitAudioContext)(); ok = true; } catch (e) {}
  function tone(f, d, type, vol, delay) {
    if (!ok) return;
    var t = ctx.currentTime + (delay || 0);
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = type || 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(vol || 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + d);
    o.start(t); o.stop(t + d + 0.05);
  }
  return {
    resume: function () { if (ok && ctx.state === 'suspended') ctx.resume(); },
    click:   function () { tone(660, 0.07, 'sine', 0.15, 0); },
    submit:  function () { tone(440, 0.12, 'sine', 0.25, 0); },
    improve: function () { tone(523,0.10,'sine',0.25,0); tone(659,0.10,'sine',0.25,0.12); tone(784,0.15,'sine',0.25,0.24); },
    success: function () { [523,659,784,1047].forEach(function(f,i){ tone(f,0.2,'square',0.2,i*0.15); }); },
    fail:    function () { tone(330,0.10,'sawtooth',0.2,0); tone(294,0.15,'sawtooth',0.2,0.12); }
  };
})();

// ─── Seeded RNG (mulberry32) ──────────────────────────────────────────────────
function mkRng(seed) {
  return function () {
    seed = (seed + 0x6D2B79F5) | 0;
    var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function normRand(rng, mu, sd) {
  var u, v;
  do { u = rng(); } while (u === 0);
  v = rng();
  return (mu || 0) + (sd || 1) * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// ─── Statistics ───────────────────────────────────────────────────────────────
function genData(n, b0, b1, sig, seed) {
  var rng = mkRng(seed >>> 0), x = [], y = [];
  for (var i = 0; i < n; i++) {
    var xi = i / (n - 1) * 10;
    x.push(xi);
    y.push(b0 + b1 * xi + normRand(rng, 0, sig));
  }
  return { x: x, y: y };
}
function computeOLS(x, y) {
  var n = x.length, mx = 0, my = 0, i;
  for (i = 0; i < n; i++) { mx += x[i]; my += y[i]; }
  mx /= n; my /= n;
  var num = 0, den = 0;
  for (i = 0; i < n; i++) { num += (x[i]-mx)*(y[i]-my); den += (x[i]-mx)*(x[i]-mx); }
  var b1 = num/den, b0 = my - b1*mx, ssr = 0;
  for (i = 0; i < n; i++) { var r = y[i]-b0-b1*x[i]; ssr += r*r; }
  return { b0: b0, b1: b1, s2: ssr/n };
}
function calcLogL(x, y, b0, b1) {
  var n = x.length, ssr = 0, i;
  for (i = 0; i < n; i++) { var r = y[i]-b0-b1*x[i]; ssr += r*r; }
  var s2 = ssr / n;
  if (s2 <= 0) return -Infinity;
  return -n/2 * Math.log(2*Math.PI*s2) - ssr/(2*s2);
}

// ─── Difficulty config ────────────────────────────────────────────────────────
var DIFF = {
  Easy:   { b0:5, b1:2.0, sig:2.0, n:30, tol:0.02,  col:0x44bb44, desc:'Strong signal - line is obvious' },
  Medium: { b0:5, b1:1.5, sig:4.0, n:30, tol:0.01,  col:0xddaa00, desc:'Moderate noise - line is visible' },
  Hard:   { b0:5, b1:1.0, sig:6.0, n:30, tol:0.005, col:0xdd4444, desc:'High noise - slope barely visible' }
};

function pCol(r) { return r < 0.80 ? 0xdd4444 : r < 0.95 ? 0xddaa00 : 0x44bb44; }
function niceStep(range, tgt) {
  var r = range/tgt, m = Math.pow(10, Math.floor(Math.log10(r))), n = r/m;
  return n < 1.5 ? m : n < 3.5 ? 2*m : n < 7.5 ? 5*m : 10*m;
}

// ─── START SCENE ──────────────────────────────────────────────────────────────
class StartScene extends Phaser.Scene {
  constructor() { super('Start'); }
  create() {
    var W = this.scale.width, H = this.scale.height, self = this;
    var bg = this.add.graphics();
    bg.fillGradientStyle(0x1a1a2e,0x1a1a2e,0x16213e,0x16213e,1);
    bg.fillRect(0,0,W,H);
    var rng = mkRng(99), g = this.add.graphics();
    for (var i = 0; i < 50; i++) {
      g.fillStyle(0x4fc3f7, 0.05 + rng()*0.2);
      g.fillCircle(rng()*W, rng()*H, 2 + rng()*5);
    }
    this.add.text(W/2, H*0.17, '📈  Likelihood Game', {
      fontSize:'78px', fontFamily:'Segoe UI', color:'#e0f7fa',
      fontStyle:'bold', stroke:'#0d47a1', strokeThickness:5
    }).setOrigin(0.5);
    this.add.text(W/2, H*0.29, 'Fit a regression line to maximise the log-likelihood', {
      fontSize:'33px', fontFamily:'Segoe UI', color:'#b0bec5'
    }).setOrigin(0.5);
    var bx = W/2-310, by = H*0.37, bw = 620, bh = 195;
    var box = this.add.graphics();
    box.fillStyle(0x0d47a1, 0.3); box.fillRoundedRect(bx,by,bw,bh,12);
    box.lineStyle(1,0x4fc3f7,0.4); box.strokeRoundedRect(bx,by,bw,bh,12);
    var lines = [
      'Drag the blue handle to adjust the intercept (b0)',
      'Drag the red handle to adjust the slope (b1)',
      'Press Submit to record your log-likelihood',
      'Get within the tolerance of the maximum to win!'
    ];
    lines.forEach(function(t,i) {
      self.add.text(W/2, by+26+i*42, t, {fontSize:'24px',fontFamily:'Segoe UI',color:'#cfd8dc'}).setOrigin(0.5);
    });
    this._btn(W/2, H*0.72, 220, 58, 'Start Game', 0x1565c0, 0x4fc3f7, function() {
      self.scene.start('Diff');
    });
    var us = new URLSearchParams(window.location.search).get('seed');
    if (us) this.add.text(W/2, H*0.92, 'Seed: '+us, {fontSize:'18px',color:'#546e7a'}).setOrigin(0.5);
  }
  _btn(cx, cy, w, h, lbl, fill, bdr, cb) {
    var g = this.add.graphics();
    function draw(ov) {
      g.clear();
      g.fillStyle(ov ? bdr : fill, 1); g.fillRoundedRect(cx-w/2,cy-h/2,w,h,9);
      g.lineStyle(2,bdr,1); g.strokeRoundedRect(cx-w/2,cy-h/2,w,h,9);
    }
    draw(false);
    var t = this.add.text(cx,cy,lbl,{fontSize:'29px',fontFamily:'Segoe UI',color:'#fff',fontStyle:'bold'}).setOrigin(0.5);
    var z = this.add.zone(cx,cy,w,h).setInteractive({useHandCursor:true});
    z.on('pointerover',  function(){ draw(true);  t.setColor('#1a1a2e'); audio.click(); });
    z.on('pointerout',   function(){ draw(false); t.setColor('#fff'); });
    z.on('pointerdown',  function(){ audio.resume(); cb(); });
  }
}

// ─── DIFFICULTY SCENE ─────────────────────────────────────────────────────────
class DiffScene extends Phaser.Scene {
  constructor() { super('Diff'); }
  create() {
    var W = this.scale.width, H = this.scale.height, self = this;
    var bg = this.add.graphics();
    bg.fillGradientStyle(0x1a1a2e,0x1a1a2e,0x16213e,0x16213e,1);
    bg.fillRect(0,0,W,H);
    this.add.text(W/2, H*0.11, 'Select Difficulty', {
      fontSize:'63px', fontFamily:'Segoe UI', color:'#e0f7fa', fontStyle:'bold'
    }).setOrigin(0.5);
    var keys = Object.keys(DIFF), cw = 290, ch = 245, gap = 44;
    var tot = keys.length*cw + (keys.length-1)*gap, sx = (W-tot)/2;
    keys.forEach(function(name, idx) {
      var cfg = DIFF[name], cx = sx + idx*(cw+gap) + cw/2, cy = H*0.50;
      var card = self.add.graphics();
      function draw(ov) {
        card.clear();
        card.fillStyle(ov ? cfg.col : 0x0d1b2a, ov ? 0.85 : 0.75);
        card.fillRoundedRect(cx-cw/2,cy-ch/2,cw,ch,14);
        card.lineStyle(3,cfg.col,1); card.strokeRoundedRect(cx-cw/2,cy-ch/2,cw,ch,14);
      }
      draw(false);
      var em = name==='Easy'?'Easy':name==='Medium'?'Medium':'Hard';
      self.add.text(cx, cy-ch/2+42, em, {fontSize:'38px',fontFamily:'Segoe UI',color:'#fff',fontStyle:'bold'}).setOrigin(0.5);
      self.add.text(cx, cy-8, cfg.desc, {fontSize:'20px',fontFamily:'Segoe UI',color:'#b0bec5',wordWrap:{width:cw-20},align:'center'}).setOrigin(0.5);
      self.add.text(cx, cy+54, 'b1 = '+cfg.b1+'   sigma = '+cfg.sig, {fontSize:'20px',fontFamily:'Segoe UI',color:'#90a4ae'}).setOrigin(0.5);
      self.add.text(cx, cy+82, 'Tolerance: '+(cfg.tol*100).toFixed(1)+'%', {fontSize:'19px',fontFamily:'Segoe UI',color:'#78909c'}).setOrigin(0.5);
      var z = self.add.zone(cx,cy,cw,ch).setInteractive({useHandCursor:true});
      z.on('pointerover',  function(){ draw(true);  audio.click(); });
      z.on('pointerout',   function(){ draw(false); });
      z.on('pointerdown',  function(){
        audio.resume();
        var us = new URLSearchParams(window.location.search).get('seed');
        var seed = us ? parseInt(us) : Math.floor(Math.random()*1e9);
        self.scene.start('Game', {diff:name, seed:seed});
      });
    });
    var bk = this.add.text(W/2, H*0.88, 'Back', {fontSize:'26px',fontFamily:'Segoe UI',color:'#78909c'}).setOrigin(0.5).setInteractive({useHandCursor:true});
    bk.on('pointerover',  function(){ bk.setColor('#b0bec5'); });
    bk.on('pointerout',   function(){ bk.setColor('#78909c'); });
    bk.on('pointerdown',  function(){ self.scene.start('Start'); });
  }
}

// ─── GAME SCENE ───────────────────────────────────────────────────────────────
class GameScene extends Phaser.Scene {
  constructor() { super('Game'); }

  init(d) {
    this.diffName = d.diff;
    this.cfg = DIFF[d.diff];
    this.seed = d.seed;
    this.won = false;
    this._celebRunning = false;
    this._celebPigs = [];
    this._celebConfetti = [];
    this._celebGfx = null;
    this._celebT = 0;
  }

  create() {
    var W = this.scale.width, H = this.scale.height, self = this;
    this.add.graphics().fillStyle(0x0d1b2a,1).fillRect(0,0,W,H);

    var d = genData(this.cfg.n, this.cfg.b0, this.cfg.b1, this.cfg.sig, this.seed);
    this.dx = d.x; this.dy = d.y;
    var o = computeOLS(d.x, d.y);
    this.ob0 = o.b0; this.ob1 = o.b1;
    this.maxLL = calcLogL(d.x, d.y, o.b0, o.b1);

    var my = 0;
    for (var i = 0; i < d.y.length; i++) my += d.y[i];
    my /= d.y.length;
    this.b0 = parseFloat(my.toFixed(4)); this.b1 = 0;
    this.attempts = []; this.bestLL = -Infinity;

    this.px = 70; this.py = 72; this.pw = 720; this.ph = 490;
    this.hx = 70; this.hy = this.py+this.ph+54; this.hw = 720; this.hh = 185;
    this.panX = this.px+this.pw+32; this.panY = 58; this.panW = W-this.panX-18;

    this.xMin = 0; this.xMax = 10;
    var mn = d.y[0], mx = d.y[0];
    for (var i = 1; i < d.y.length; i++) { if(d.y[i]<mn)mn=d.y[i]; if(d.y[i]>mx)mx=d.y[i]; }
    var pad = (mx-mn)*0.15+2;
    this.yMin = mn-pad; this.yMax = mx+pad;

    this._buildHeader();
    this._buildPlot();
    this._buildHistPlot();
    this._buildPanel();
    this._buildHandles();
    this._redrawPlot();
    this._redrawHist();
    this._updatePanel();
  }

  sx(xi) { return this.px + (xi-this.xMin)/(this.xMax-this.xMin)*this.pw; }
  sy(yi) { return this.py + this.ph - (yi-this.yMin)/(this.yMax-this.yMin)*this.ph; }
  toDataY(sy) { return this.yMin + (1-(sy-this.py)/this.ph)*(this.yMax-this.yMin); }

  _buildHeader() {
    var W = this.scale.width;
    this.add.text(W/2, 26, 'Likelihood Game  -  '+this.diffName, {
      fontSize:'33px', fontFamily:'Segoe UI', color:'#e0f7fa', fontStyle:'bold'
    }).setOrigin(0.5);
  }

  _buildPlot() {
    var g = this.add.graphics();
    g.fillStyle(0x0a1628,1); g.fillRect(this.px,this.py,this.pw,this.ph);
    g.lineStyle(1,0x1e3a5f,1); g.strokeRect(this.px,this.py,this.pw,this.ph);
    this.add.text(this.px+this.pw/2, this.py+this.ph+28, 'x', {fontSize:'28px',fontFamily:'Segoe UI',color:'#78909c'}).setOrigin(0.5);
    this.add.text(this.px-46, this.py+this.ph/2, 'y', {fontSize:'28px',fontFamily:'Segoe UI',color:'#78909c'}).setOrigin(0.5).setAngle(-90);
    this.add.text(this.px+this.pw/2, this.py-18, 'Scatter Plot  -  drag handles to adjust line', {fontSize:'21px',fontFamily:'Segoe UI',color:'#546e7a'}).setOrigin(0.5);
    this.plotGfx = this.add.graphics();
    this._xTicks = []; this._yTicks = [];
  }

  _redrawPlot() {
    var g = this.plotGfx; g.clear();
    var px=this.px, py=this.py, pw=this.pw, ph=this.ph;
    var i, gx, gy, sx, sy;

    g.lineStyle(1,0x1e3a5f,0.45);
    for (gx=0; gx<=10; gx+=2) {
      sx=this.sx(gx);
      g.beginPath(); g.moveTo(sx,py); g.lineTo(sx,py+ph); g.strokePath();
    }
    var ys = niceStep(this.yMax-this.yMin,6), y0 = Math.ceil(this.yMin/ys)*ys;
    for (gy=y0; gy<=this.yMax+0.001; gy+=ys) {
      sy=this.sy(gy);
      g.beginPath(); g.moveTo(px,sy); g.lineTo(px+pw,sy); g.strokePath();
    }

    g.lineStyle(1,0x37474f,1);
    g.beginPath(); g.moveTo(px,py+ph); g.lineTo(px+pw,py+ph); g.strokePath();
    g.beginPath(); g.moveTo(px,py); g.lineTo(px,py+ph); g.strokePath();

    var xv = [0,2,4,6,8,10];
    while (this._xTicks.length < xv.length) {
      this._xTicks.push(this.add.text(0,0,'',{fontSize:'20px',fontFamily:'Segoe UI',color:'#546e7a'}).setOrigin(0.5,0));
    }
    for (i=0; i<xv.length; i++) this._xTicks[i].setPosition(this.sx(xv[i]),py+ph+5).setText(''+xv[i]);

    var yv = [];
    for (gy=y0; gy<=this.yMax+0.001; gy+=ys) yv.push(gy);
    while (this._yTicks.length < yv.length) {
      this._yTicks.push(this.add.text(0,0,'',{fontSize:'20px',fontFamily:'Segoe UI',color:'#546e7a'}).setOrigin(1,0.5));
    }
    for (i=0; i<yv.length; i++) this._yTicks[i].setPosition(px-5,this.sy(yv[i])).setText(yv[i].toFixed(0));
    for (i=yv.length; i<this._yTicks.length; i++) this._yTicks[i].setText('');

    for (i=0; i<this.dx.length; i++) {
      sx=this.sx(this.dx[i]); sy=this.sy(this.dy[i]);
      g.fillStyle(0x4fc3f7,0.85); g.fillCircle(sx,sy,6);
      g.lineStyle(1,0x0288d1,0.5); g.strokeCircle(sx,sy,6);
    }

    g.lineStyle(3,0xffa726,0.95);
    g.beginPath();
    g.moveTo(this.sx(this.xMin),this.sy(this.b0+this.b1*this.xMin));
    g.lineTo(this.sx(this.xMax),this.sy(this.b0+this.b1*this.xMax));
    g.strokePath();

    if (this.iHandle && this.sHandle) {
      var iy = Phaser.Math.Clamp(this.sy(this.b0), this.py, this.py+this.ph);
      this.iHandle.setPosition(this.px, iy);
      if (this.iLbl) this.iLbl.setPosition(this.px-24, iy);
      var sy2 = Phaser.Math.Clamp(this.sy(this.b0+this.b1*this.xMax), this.py, this.py+this.ph);
      this.sHandle.setPosition(this.px+this.pw, sy2);
      if (this.sLbl) this.sLbl.setPosition(this.px+this.pw+24, sy2);
    }
  }

  _buildHandles() {
    var self = this;
    var iy  = Phaser.Math.Clamp(this.sy(this.b0), this.py, this.py+this.ph);
    var sy2 = Phaser.Math.Clamp(this.sy(this.b0+this.b1*this.xMax), this.py, this.py+this.ph);

    this.iHandle = this.add.circle(this.px, iy, 15, 0x1565c0, 1).setStrokeStyle(2,0x4fc3f7).setInteractive({draggable:true,useHandCursor:true});
    this.sHandle = this.add.circle(this.px+this.pw, sy2, 15, 0xb71c1c, 1).setStrokeStyle(2,0xef5350).setInteractive({draggable:true,useHandCursor:true});
    this.iLbl = this.add.text(this.px-24, iy, 'b0', {fontSize:'19px',fontFamily:'Segoe UI',color:'#4fc3f7'}).setOrigin(0.5);
    this.sLbl = this.add.text(this.px+this.pw+24, sy2, 'b1', {fontSize:'19px',fontFamily:'Segoe UI',color:'#ef5350'}).setOrigin(0.5);

    this.input.setDraggable([this.iHandle, this.sHandle]);

    this.iHandle.on('drag', function(ptr, dx, dy) {
      if (self.won) return;
      var ny = Phaser.Math.Clamp(dy, self.py, self.py+self.ph);
      self.b0 = parseFloat(self.toDataY(ny).toFixed(4));
      self._redrawPlot(); self._updatePanel();
    });
    this.sHandle.on('drag', function(ptr, dx, dy) {
      if (self.won) return;
      var ny = Phaser.Math.Clamp(dy, self.py, self.py+self.ph);
      var yAtMax = self.toDataY(ny);
      self.b1 = parseFloat(((yAtMax - self.b0) / self.xMax).toFixed(4));
      self._redrawPlot(); self._updatePanel();
    });

    this.input.keyboard.on('keydown', function(e) {
      if (self.won) return;
      var step = e.shiftKey ? 0.05 : 0.005;
      if (e.key==='ArrowUp')    { self.b0 = parseFloat((self.b0+step).toFixed(4)); self._redrawPlot(); self._updatePanel(); }
      if (e.key==='ArrowDown')  { self.b0 = parseFloat((self.b0-step).toFixed(4)); self._redrawPlot(); self._updatePanel(); }
      if (e.key==='ArrowRight') { self.b1 = parseFloat((self.b1+step).toFixed(4)); self._redrawPlot(); self._updatePanel(); }
      if (e.key==='ArrowLeft')  { self.b1 = parseFloat((self.b1-step).toFixed(4)); self._redrawPlot(); self._updatePanel(); }
    });
  }

  _buildHistPlot() {
    var g = this.add.graphics();
    g.fillStyle(0x0a1628,1); g.fillRect(this.hx,this.hy,this.hw,this.hh);
    g.lineStyle(1,0x1e3a5f,1); g.strokeRect(this.hx,this.hy,this.hw,this.hh);
    this.add.text(this.hx+this.hw/2, this.hy-16, 'Log-Likelihood History', {fontSize:'21px',fontFamily:'Segoe UI',color:'#546e7a'}).setOrigin(0.5);
    this.add.text(this.hx+this.hw/2, this.hy+this.hh+16, 'Attempt', {fontSize:'21px',fontFamily:'Segoe UI',color:'#78909c'}).setOrigin(0.5);
    this.add.text(this.hx-16, this.hy+this.hh/2, 'log L', {fontSize:'20px',fontFamily:'Segoe UI',color:'#78909c'}).setOrigin(0.5).setAngle(-90);
    this.histGfx = this.add.graphics();
  }

  _redrawHist() {
    var g = this.histGfx; g.clear();
    var hx=this.hx, hy=this.hy, hw=this.hw, hh=this.hh;
    var atts = this.attempts;
    if (atts.length === 0) return;

    var minL = atts[0], maxL = this.maxLL, i;
    for (i=0; i<atts.length; i++) if (atts[i]<minL) minL=atts[i];
    var range = maxL-minL; if (range < 0.001) range = 1;
    var threshLL = this.maxLL * (1 + this.cfg.tol);
    var lMin = Math.min(minL, threshLL) - range*0.12;
    var lMax = maxL + range*0.12;
    if (lMax <= lMin) lMax = lMin + 1;

    var n = atts.length;
    function lx(idx) { return hx+14 + (n > 1 ? (idx/(n-1)) : 0.5) * (hw-28); }
    function ly(v) { return hy+hh-8 - (v-lMin)/(lMax-lMin)*(hh-16); }

    g.lineStyle(1.5,0x66bb6a,0.8);
    var mly = ly(maxL);
    g.beginPath(); g.moveTo(hx+2,mly); g.lineTo(hx+hw-2,mly); g.strokePath();

    var tly = ly(threshLL);
    g.lineStyle(1.5,0xddaa00,0.8);
    g.beginPath(); g.moveTo(hx+2,tly); g.lineTo(hx+hw-2,tly); g.strokePath();

    for (i=1; i<atts.length; i++) {
      g.lineStyle(1.5,0x4fc3f7,0.65);
      g.beginPath(); g.moveTo(lx(i-1),ly(atts[i-1])); g.lineTo(lx(i),ly(atts[i])); g.strokePath();
    }
    for (i=0; i<atts.length; i++) {
      var col = (atts[i]===this.bestLL) ? 0xffa726 : 0x4fc3f7;
      g.fillStyle(col,1); g.fillCircle(lx(i),ly(atts[i]),5);
    }

    if (!this._histMaxLbl) {
      this._histMaxLbl    = this.add.text(0,0,'max', {fontSize:'16px',fontFamily:'Segoe UI',color:'#66bb6a'}).setOrigin(0,0.5);
      this._histThreshLbl = this.add.text(0,0,'-'+(this.cfg.tol*100).toFixed(1)+'%', {fontSize:'16px',fontFamily:'Segoe UI',color:'#ddaa00'}).setOrigin(0,0.5);
    }
    this._histMaxLbl.setPosition(hx+hw-28, mly).setVisible(true);
    this._histThreshLbl.setPosition(hx+hw-28, tly).setVisible(true);
  }

  // Side panel
  _buildPanel() {
    var px=this.panX, py=this.panY, pw=this.panW, self=this;
    var H=this.scale.height;
    var panH = H - py - 14;
    var bg=this.add.graphics();
    bg.fillStyle(0x0a1628,0.9); bg.fillRoundedRect(px,py,pw,panH,10);
    bg.lineStyle(1,0x1e3a5f,0.8); bg.strokeRoundedRect(px,py,pw,panH,10);

    var cx = px+pw/2;
    this.add.text(cx, py+18, this.diffName+' Mode', {fontSize:'24px',fontFamily:'Segoe UI',color:this._diffColor(),fontStyle:'bold'}).setOrigin(0.5);

    this.add.text(px+12, py+50, 'Parameters', {fontSize:'20px',fontFamily:'Segoe UI',color:'#78909c',fontStyle:'bold'});
    this.add.text(px+12, py+74, '\u03B2\u2080 (intercept):', {fontSize:'19px',fontFamily:'Segoe UI',color:'#90a4ae'});
    this.b0Txt = this.add.text(px+pw-12, py+74, '\u2014', {fontSize:'20px',fontFamily:'Segoe UI',color:'#4fc3f7',fontStyle:'bold'}).setOrigin(1,0);
    this.add.text(px+12, py+100, '\u03B2\u2081 (slope):', {fontSize:'19px',fontFamily:'Segoe UI',color:'#90a4ae'});
    this.b1Txt = this.add.text(px+pw-12, py+100, '\u2014', {fontSize:'20px',fontFamily:'Segoe UI',color:'#ef5350',fontStyle:'bold'}).setOrigin(1,0);

    var dg=this.add.graphics(); dg.lineStyle(1,0x1e3a5f,0.6); dg.beginPath(); dg.moveTo(px+10,py+126); dg.lineTo(px+pw-10,py+126); dg.strokePath();

    this.add.text(px+12, py+136, 'Log-Likelihood', {fontSize:'20px',fontFamily:'Segoe UI',color:'#78909c',fontStyle:'bold'});
    this.add.text(px+12, py+160, 'Current:', {fontSize:'18px',fontFamily:'Segoe UI',color:'#90a4ae'});
    this.curLLTxt = this.add.text(px+pw-12, py+160, '\u2014', {fontSize:'18px',fontFamily:'Segoe UI',color:'#cfd8dc'}).setOrigin(1,0);
    this.add.text(px+12, py+182, 'Maximum:', {fontSize:'18px',fontFamily:'Segoe UI',color:'#90a4ae'});
    this.maxLLTxt = this.add.text(px+pw-12, py+182, this.maxLL.toFixed(2), {fontSize:'18px',fontFamily:'Segoe UI',color:'#66bb6a'}).setOrigin(1,0);
    this.add.text(px+12, py+204, 'Threshold (within '+(this.cfg.tol*100).toFixed(1)+'%):', {fontSize:'16px',fontFamily:'Segoe UI',color:'#90a4ae'});
    this.thrLLTxt = this.add.text(px+pw-12, py+204, (this.maxLL*(1+this.cfg.tol)).toFixed(2), {fontSize:'18px',fontFamily:'Segoe UI',color:'#ddaa00'}).setOrigin(1,0);

    var dg2=this.add.graphics(); dg2.lineStyle(1,0x1e3a5f,0.6); dg2.beginPath(); dg2.moveTo(px+10,py+228); dg2.lineTo(px+pw-10,py+228); dg2.strokePath();

    this.add.text(px+12, py+238, 'Progress', {fontSize:'20px',fontFamily:'Segoe UI',color:'#78909c',fontStyle:'bold'});
    this.pctTxt = this.add.text(px+pw-12, py+238, '0%', {fontSize:'18px',fontFamily:'Segoe UI',color:'#cfd8dc'}).setOrigin(1,0);
    var barBg=this.add.graphics(); barBg.fillStyle(0x1e3a5f,1); barBg.fillRoundedRect(px+10,py+260,pw-20,20,6);
    this.barGfx = this.add.graphics();

    var dg3=this.add.graphics(); dg3.lineStyle(1,0x1e3a5f,0.6); dg3.beginPath(); dg3.moveTo(px+10,py+294); dg3.lineTo(px+pw-10,py+294); dg3.strokePath();

    this.add.text(px+12, py+304, 'Attempts:', {fontSize:'18px',fontFamily:'Segoe UI',color:'#90a4ae'});
    this.attTxt = this.add.text(px+pw-12, py+304, '0', {fontSize:'20px',fontFamily:'Segoe UI',color:'#cfd8dc',fontStyle:'bold'}).setOrigin(1,0);
    this.add.text(px+12, py+328, 'Best log-L:', {fontSize:'18px',fontFamily:'Segoe UI',color:'#90a4ae'});
    this.bestTxt = this.add.text(px+pw-12, py+328, '\u2014', {fontSize:'18px',fontFamily:'Segoe UI',color:'#ffa726'}).setOrigin(1,0);

    var dg4=this.add.graphics(); dg4.lineStyle(1,0x1e3a5f,0.6); dg4.beginPath(); dg4.moveTo(px+10,py+354); dg4.lineTo(px+pw-10,py+354); dg4.strokePath();

    this._makeSubmitBtn(cx, py+394, pw-24, 54);

    var dg5=this.add.graphics(); dg5.lineStyle(1,0x1e3a5f,0.6); dg5.beginPath(); dg5.moveTo(px+10,py+432); dg5.lineTo(px+pw-10,py+432); dg5.strokePath();

    this.olsHintTxt = this.add.text(cx, py+444, '', {fontSize:'16px',fontFamily:'Segoe UI',color:'#546e7a',align:'center',wordWrap:{width:pw-20}}).setOrigin(0.5,0);

    this.add.text(cx, py+548, '\u2328  Arrow keys nudge \u03B2\u2080/\u03B2\u2081\n\u21E7+Arrow = larger step', {
      fontSize:'16px',fontFamily:'Segoe UI',color:'#37474f',align:'center'
    }).setOrigin(0.5,0);

    this._makeSmallBtn(cx, py+638, pw-24, 40, '\u21BA  New Game (same diff)', 0x1a237e, 0x3949ab, function() {
      var us=new URLSearchParams(window.location.search).get('seed');
      var seed=us?parseInt(us):Math.floor(Math.random()*1e9);
      self.scene.start('Game',{diff:self.diffName,seed:seed});
    });
    this._makeSmallBtn(cx, py+688, pw-24, 40, '\u2630  Change Difficulty', 0x1b2838, 0x37474f, function() {
      self.scene.start('Diff');
    });
  }

  _diffColor() {
    var c = this.cfg.col;
    var r=(c>>16)&0xff, g=(c>>8)&0xff, b=c&0xff;
    return 'rgb('+r+','+g+','+b+')';
  }

  _makeSubmitBtn(cx, cy, w, h) {
    var self=this;
    var g=this.add.graphics();
    function draw(ov,dis) {
      g.clear();
      if(dis){g.fillStyle(0x263238,1);g.fillRoundedRect(cx-w/2,cy-h/2,w,h,9);g.lineStyle(1,0x37474f,1);g.strokeRoundedRect(cx-w/2,cy-h/2,w,h,9);return;}
      g.fillStyle(ov?0x1976d2:0x0d47a1,1); g.fillRoundedRect(cx-w/2,cy-h/2,w,h,9);
      g.lineStyle(2,0x4fc3f7,1); g.strokeRoundedRect(cx-w/2,cy-h/2,w,h,9);
    }
    draw(false,false);
    var t=this.add.text(cx,cy,'\uD83D\uDCCA  Submit',{fontSize:'25px',fontFamily:'Segoe UI',color:'#fff',fontStyle:'bold'}).setOrigin(0.5);
    var z=this.add.zone(cx,cy,w,h).setInteractive({useHandCursor:true});
    z.on('pointerover',  function(){ if(!self.won){draw(true,false);} });
    z.on('pointerout',   function(){ if(!self.won){draw(false,false);} });
    // FIX 4: check self.won at call time (not closure time) so Play Again re-enables button
    z.on('pointerdown',  function(){ if(!self.won){audio.resume();self._onSubmit();} });
    this._submitDraw=draw; this._submitTxt=t;
  }

  _makeSmallBtn(cx, cy, w, h, lbl, fill, bdr, cb) {
    var g=this.add.graphics();
    function draw(ov){g.clear();g.fillStyle(ov?bdr:fill,1);g.fillRoundedRect(cx-w/2,cy-h/2,w,h,7);g.lineStyle(1,bdr,1);g.strokeRoundedRect(cx-w/2,cy-h/2,w,h,7);}
    draw(false);
    this.add.text(cx,cy,lbl,{fontSize:'18px',fontFamily:'Segoe UI',color:'#b0bec5'}).setOrigin(0.5);
    var z=this.add.zone(cx,cy,w,h).setInteractive({useHandCursor:true});
    z.on('pointerover',  function(){draw(true); audio.click();});
    z.on('pointerout',   function(){draw(false);});
    z.on('pointerdown',  function(){audio.resume();cb();});
  }

  // Panel update
  _updatePanel() {
    var ll = calcLogL(this.dx, this.dy, this.b0, this.b1);
    this.b0Txt.setText(this.b0.toFixed(4));
    this.b1Txt.setText(this.b1.toFixed(4));
    this.curLLTxt.setText(isFinite(ll)?ll.toFixed(2):'\u2014');

    var ratio = 0;
    if (isFinite(ll) && isFinite(this.maxLL) && this.maxLL < 0) {
      var gap = this.maxLL - ll;
      ratio = Phaser.Math.Clamp(1 - gap / Math.abs(this.maxLL), 0, 1);
    }
    var pct = Math.round(ratio*100);
    this.pctTxt.setText(pct+'%');

    var bx=this.panX+10, by=this.panY+260, bw=this.panW-20, bh=20;
    this.barGfx.clear();
    var col=pCol(ratio);
    this.barGfx.fillStyle(col,0.85);
    this.barGfx.fillRoundedRect(bx,by,Math.max(4,bw*ratio),bh,6);

    this.attTxt.setText(''+this.attempts.length);
    this.bestTxt.setText(isFinite(this.bestLL)?this.bestLL.toFixed(2):'\u2014');
  }

  // Submit
  _onSubmit() {
    var ll = calcLogL(this.dx, this.dy, this.b0, this.b1);
    if (!isFinite(ll)) return;

    var improved = ll > this.bestLL;
    if (improved) this.bestLL = ll;
    this.attempts.push(ll);

    audio.submit();
    if (improved && this.attempts.length > 1) {
      var self=this; setTimeout(function(){audio.improve();},150);
    }

    this._redrawHist();
    this._updatePanel();

    if (this.attempts.length === 3) {
      this.olsHintTxt.setText('Hint: adjust both handles to bring\nlog-likelihood closer to the maximum.');
    }

    var threshold = this.maxLL * (1 + this.cfg.tol);
    var success = isFinite(ll) && this.maxLL < 0 && ll >= threshold;
    if (success) {
      this.won = true;
      audio.success();
      this._submitDraw(false,true);
      this._submitTxt.setText('\u2713  Success!').setColor('#66bb6a');
      // FIX 3: start celebration overlay in-scene (keep graphs visible)
      var self=this;
      this.time.delayedCall(400, function(){ self._startCelebration(); });
    } else if (!improved) {
      audio.fail();
    }
  }

  // FIX 3: In-scene celebration overlay – piggies bounce on top of graphs
  _startCelebration() {
    var W=this.scale.width, H=this.scale.height, self=this;
    this._celebRunning = true;
    this._celebT = 0;

    // Semi-transparent overlay over panel area only (keep graphs visible)
    var ov=this.add.graphics();
    ov.fillStyle(0x000000,0.45);
    ov.fillRect(this.panX, this.panY, this.panW, H-this.panY-14);

    // Success banner
    this.add.text(W/2, H*0.08, '\uD83C\uDF89  Maximum Likelihood Found!  \uD83C\uDF89', {
      fontSize:'43px',fontFamily:'Segoe UI',color:'#ffa726',fontStyle:'bold',
      stroke:'#0d47a1',strokeThickness:3
    }).setOrigin(0.5).setDepth(10);
    this.add.text(W/2, H*0.16, 'Solved in '+this.attempts.length+' attempt'+(this.attempts.length===1?'':'s')+'!', {
      fontSize:'28px',fontFamily:'Segoe UI',color:'#e0f7fa'
    }).setOrigin(0.5).setDepth(10);

    // Confetti
    var rng=mkRng(Date.now()&0xffffffff);
    this._celebConfetti=[];
    for (var i=0;i<80;i++) {
      this._celebConfetti.push({
        x:rng()*W, y:-20-rng()*H*0.5,
        vx:(rng()-0.5)*3, vy:1.5+rng()*3,
        col:[0xffa726,0x4fc3f7,0xef5350,0x66bb6a,0xce93d8][Math.floor(rng()*5)],
        w:6+rng()*8, h:4+rng()*6, rot:rng()*Math.PI*2, rotV:(rng()-0.5)*0.15
      });
    }
    this._celebGfx = this.add.graphics().setDepth(9);

    // Guinea pig sprites from data point positions
    this._celebPigs=[];
    var px=this.px,py=this.py,pw=this.pw,ph=this.ph;
    var xMin=this.xMin,xMax=this.xMax,yMin=this.yMin,yMax=this.yMax;
    for (var i=0;i<this.dx.length;i++) {
      var sx=px+(this.dx[i]-xMin)/(xMax-xMin)*pw;
      var sy=py+ph-(this.dy[i]-yMin)/(yMax-yMin)*ph;
      var pig=this.add.text(sx,sy,'\uD83D\uDC39',{fontSize:'30px'}).setOrigin(0.5).setDepth(11);
      var vx=(rng()-0.5)*320, vy=-(80+rng()*260);
      this._celebPigs.push({obj:pig,vx:vx,vy:vy,x:sx,y:sy});
    }

    // Play Again / Menu buttons
    this._celebBtn(W/2-140, H*0.90, 240, 50, '\u21BA  Play Again', 0x1565c0, 0x4fc3f7, function(){
      var us=new URLSearchParams(window.location.search).get('seed');
      var seed=us?parseInt(us):Math.floor(Math.random()*1e9);
      self.scene.start('Game',{diff:self.diffName,seed:seed});
    });
    this._celebBtn(W/2+140, H*0.90, 240, 50, '\u2630  Menu', 0x1b2838, 0x37474f, function(){
      self.scene.start('Start');
    });
  }

  _celebBtn(cx,cy,w,h,lbl,fill,bdr,cb){
    var g=this.add.graphics().setDepth(12);
    function draw(ov){g.clear();g.fillStyle(ov?bdr:fill,1);g.fillRoundedRect(cx-w/2,cy-h/2,w,h,9);g.lineStyle(2,bdr,1);g.strokeRoundedRect(cx-w/2,cy-h/2,w,h,9);}
    draw(false);
    var t=this.add.text(cx,cy,lbl,{fontSize:'23px',fontFamily:'Segoe UI',color:'#fff',fontStyle:'bold'}).setOrigin(0.5).setDepth(13);
    var z=this.add.zone(cx,cy,w,h).setInteractive({useHandCursor:true}).setDepth(14);
    z.on('pointerover',  function(){draw(true); t.setColor('#1a1a2e'); audio.click();});
    z.on('pointerout',   function(){draw(false);t.setColor('#fff');});
    z.on('pointerdown',  function(){audio.resume();cb();});
  }

  update(time, delta) {
    if (!this._celebRunning) return;
    var dt=delta/1000, W=this.scale.width, H=this.scale.height;
    this._celebT+=dt;

    // Confetti physics
    var g=this._celebGfx; g.clear();
    for (var i=0;i<this._celebConfetti.length;i++) {
      var c=this._celebConfetti[i];
      c.x+=c.vx; c.y+=c.vy; c.rot+=c.rotV;
      if(c.y>H+20){c.y=-20;c.x=Math.random()*W;}
      g.fillStyle(c.col,0.85);
      var cos=Math.cos(c.rot),sin=Math.sin(c.rot);
      var hw=c.w/2,hh=c.h/2;
      var pts=[
        {x:c.x+cos*(-hw)-sin*(-hh), y:c.y+sin*(-hw)+cos*(-hh)},
        {x:c.x+cos*(hw)-sin*(-hh),  y:c.y+sin*(hw)+cos*(-hh)},
        {x:c.x+cos*(hw)-sin*(hh),   y:c.y+sin*(hw)+cos*(hh)},
        {x:c.x+cos*(-hw)-sin*(hh),  y:c.y+sin*(-hw)+cos*(hh)}
      ];
      g.fillPoints(pts,true);
    }

    // Guinea pig bounce
    var gravity=400;
    for (var i=0;i<this._celebPigs.length;i++) {
      var p=this._celebPigs[i];
      p.vy+=gravity*dt;
      p.x+=p.vx*dt; p.y+=p.vy*dt;
      if(p.y>H-30){p.y=H-30;p.vy*=-0.7;p.vx*=0.9;}
      if(p.x<0){p.x=0;p.vx*=-0.8;}
      if(p.x>W){p.x=W;p.vx*=-0.8;}
      p.obj.setPosition(p.x,p.y);
      var sc=1+0.1*Math.sin(this._celebT*8+i);
      p.obj.setScale(sc);
    }
  }
}

// PHASER CONFIG
// FIX 1: Use pixelArt:false and render at full devicePixelRatio for crisp display
var config = {
  type: Phaser.AUTO,
  width: 1400,
  height: 860,
  backgroundColor: '#0d1b2a',
  parent: 'gc',
  pixelArt: false,
  antialias: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 1400,
    height: 860
  },
  scene: [StartScene, DiffScene, GameScene]
};

new Phaser.Game(config);
