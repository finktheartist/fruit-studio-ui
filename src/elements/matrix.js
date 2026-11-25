// Fruit Studio UI — Piece 06: Porcelain Swatch Matrix (3×2 Multi-Select Fruit Palette + Multi-Pigment Combos!)
// Dieter Rams / Apple sculpted 3×2 matte-porcelain bento palette cradling ALL 6 studio-photographed fruits:
//   - Row 1: Blood Orange · Golden Yuzu · Fuzzy Kiwi
//   - Row 2: Ripe Strawberry · Black Mission Fig · Watermelon
//   - Sweep across any combination of 1..6 fruits in ONE continuous stroke: each cleaved well reveals its glistening cut heart
//     ringed by its distinct translucent nectar pigment (all mixing organically on the RGBA16F WebGL2 fluid layer!)
//   - Tap any selected well to deselect & restore that individual fruit;
//   - Swipe UPWARD across wells to launch ONLY those swiped fruits into a multi-color mid-air bouquet for PENTA / HEXA / OCTA COMBO!

const MATRIX_ITEMS = [
  { key: 'bloodOrange', tag: 'ORANGE' },
  { key: 'yuzu',        tag: 'YUZU'   },
  { key: 'kiwi',        tag: 'KIWI'   },
  { key: 'strawberry',  tag: 'BERRY'  },
  { key: 'fig',         tag: 'FIG'    },
  { key: 'watermelon',  tag: 'MELON'  },
];

function easeOutCubic(t) { const u = Math.max(0, Math.min(1, t)); return 1 - Math.pow(1 - u, 3); }
function easeOutQuint(t) { const u = Math.max(0, Math.min(1, t)); return 1 - Math.pow(1 - u, 5); }

class FruitMatrix {
  constructor(mount, opts = {}) {
    this.width = opts.width || 640;
    this.height = opts.height || 360;
    this.dpr = opts.dpr || Math.min(window.devicePixelRatio || 1, 2);

    this.engine = new StudioLiquidEngine(mount, {
      width: this.width,
      height: this.height,
      dpr: this.dpr,
      audio: opts.audio || null,
      seed: opts.seed,
    });
    this.wrap = this.engine.wrap;
    this.canvas = this.engine.canvas;
    this.scale = Math.min(this.width / 640, this.height / 360);

    const s = this.scale;
    this.cx = this.width * 0.5;
    this.cy = this.height * 0.525; // generous upper headroom above tray for soaring multi-color fruit bouquets!
    this.colSpacing = 114 * s;
    this.rowSpacing = 98 * s;
    this.trayW = 374 * s;
    this.trayH = 224 * s;
    this.wellR = 35 * s;
    this.fruitR = 28 * s;

    this.cells = [];
    this._initCells(false);

    this.pieces = []; // 100% solid multi-fruit soaring caps & diced chunks (NEVER fade out!)
    this.autoRefill = Boolean(opts.autoRefill);
    this.refillTimer = -1;
    this.downX = 0;
    this.downY = 0;
    this.movedFar = false;

    this.onChopTelemetry = opts.onChopTelemetry || null;

    // Single-swipe continuous multi-piece combo & superlinear point system
    this.strokeHits = 0;
    this.strokeAwardedPts = 0;
    this.totalScore = 0;
    this.scoreVisTimer = 0;
    this.scorePulse = 0;
    this.phase = 0;
    this.phaseTimer = 0;
  }

  _initCells(animated = true) {
    this.cells = [];
    for (let i = 0; i < MATRIX_ITEMS.length; i++) {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const item = MATRIX_ITEMS[i];
      this.cells.push({
        idx: i,
        key: item.key,
        tag: item.tag,
        x: this.cx + (col - 1) * this.colSpacing,
        y: this.cy + (row - 0.5) * this.rowSpacing - 4 * this.scale,
        selected: false,
        entryProg: animated ? 0 : 1,
        entryDelay: animated ? i * 0.065 : 0,
        cutAnim: 0,
        tilt: (this.engine.rand() - 0.5) * 0.10,
      });
    }
    this.refillTimer = -1;
  }

  get selectedCount() {
    let n = 0;
    for (const c of this.cells) if (c.selected) n++;
    return n;
  }

  resetTray() {
    this._initCells(true);
    this.phase = 0;
  }

  clearSurface() {
    this.engine.clearCeramic();
    this.totalScore = 0;
    this.scoreVisTimer = 0;
    this._initCells(true);
    this.phase = 0;
  }

  pointerDown(x, y) {
    this.strokeHits = 0;
    this.strokeAwardedPts = 0;
    this.downX = x;
    this.downY = y;
    this.movedFar = false;
    this.engine.beginStroke(x, y);
    return true;
  }

  pointerMove(x, y) {
    if (Math.hypot(x - this.downX, y - this.downY) > 12 * this.scale) {
      this.movedFar = true;
    }
    const seg = this.engine.moveStroke(x, y);
    if (!seg) return;

    // 1. Mid-air continuous slicing across soaring multi-color fruit caps & chunks!
    this._checkMidAirReslice(seg);
    // 2. Multi-fruit sweep selection across any intact wells in the 3×2 porcelain tray!
    this._checkMatrixChops(seg);
  }

  pointerUp() {
    this.engine.endStroke();
    // Short tap on an already-selected well cleanly toggles/deselects just that single swatch!
    if (!this.movedFar) {
      for (const cell of this.cells) {
        if (cell.selected && Math.hypot(this.downX - cell.x, this.downY - cell.y) <= this.wellR) {
          cell.selected = false;
          cell.entryProg = 0;
          cell.entryDelay = 0.02;
          cell.cutAnim = 0;
          this.refillTimer = -1;
          if (this.engine.audio) this.engine.audio.playBezelTick(false, this.engine.panForX(cell.x));
          if (this.onChopTelemetry) {
            this.onChopTelemetry({
              fruit: `Deselected ${cell.tag} · ${this.selectedCount}/6`,
              speed: 0,
              angleDeg: 0,
              splitRatio: `${this.selectedCount} / 6 active`,
              curveRate: 0,
            });
          }
          break;
        }
      }
    }
  }

  _awardSwipeCombo(hitX, hitY, fruit, cutAngle, isMidAir) {
    this.strokeHits += 1;
    if (!isMidAir && this.strokeHits < 2) return null;

    const tier = getComboTierInfo(this.strokeHits);
    const deltaPts = Math.max(0, tier.points - this.strokeAwardedPts);
    this.strokeAwardedPts = tier.points;
    this.totalScore += deltaPts;
    this.scoreVisTimer = 8.0;
    this.scorePulse = 1.0;

    this.engine.triggerComboEffect(hitX, hitY, tier.count, tier.points, fruit, cutAngle, this.scale);
    return tier;
  }

  _checkMidAirReslice(seg) {
    const s = this.scale;
    const speed = seg.speed || 1000;
    const curveRate = seg.curveRate || 0;
    const E = Math.max(0.16, Math.min(1.65, (speed - 180) / 1450));
    const newlySpawned = [];

    for (let i = this.pieces.length - 1; i >= 0; i--) {
      const pc = this.pieces[i];
      if (pc.depth >= 4) continue;
      if (pc.immuneTimer > 0) continue;
      if (!pc.juggled && pc.age < 0.16) continue;

      const hitR = pc.r * (pc.depth === 1 ? 1.08 : pc.depth === 2 ? 0.86 : 0.72);
      const cut = computeCircleCutGeometry(seg.x1, seg.y1, seg.x2, seg.y2, pc.x, pc.y, hitR, hitR);
      if (!cut) continue;

      const fruit = STUDIO_FRUITS[pc.key];
      const worldRot = pc.rot;
      const relAng = cut.cutAngle - worldRot;
      const px = pc.pivotLocalX || 0;
      const py = pc.pivotLocalY || 0;
      const nx = -Math.sin(relAng), ny = Math.cos(relAng);
      const centroidProj = nx * px + ny * py;
      const planeOffset = Math.max(-0.46, Math.min(0.46, (centroidProj + cut.offsetNorm * pc.r * 0.20) / pc.r));
      const basePlanes = pc.clipPlanes && pc.clipPlanes.length > 0 ? pc.clipPlanes : [];

      this.pieces.splice(i, 1);

      for (const newSide of [-1, 1]) {
        const childPlanes = [...basePlanes, { ang: relAng, offset: planeOffset, side: newSide }];
        const shiftDist = pc.r * (pc.depth === 1 ? 0.24 : 0.16);
        const childPx = px + nx * newSide * shiftDist;
        const childPy = py + ny * newSide * shiftDist;
        const cw = Math.cos(worldRot), sw = Math.sin(worldRot);
        const worldShiftX = (nx * newSide * shiftDist) * cw - (ny * newSide * shiftDist) * sw;
        const worldShiftY = (nx * newSide * shiftDist) * sw + (ny * newSide * shiftDist) * cw;

        const sep = (68 + 86 * Math.min(1.1, E)) * (0.88 + this.engine.rand() * 0.24) * s;
        const along = (16 + 56 * Math.min(1.1, E)) * s;
        const centerPullX = (this.cx - pc.x) * 0.26;
        const rawVx = pc.vx * 0.26 + centerPullX + cut.perpX * newSide * sep + cut.ux * along;
        const vx = Math.max(-200 * s, Math.min(200 * s, rawVx));
        const topGuard = Math.max(0.32, Math.min(1.0, (pc.y - 36 * s) / (118 * s)));
        const popVy = -(200 + 60 * Math.min(1.0, E) + this.engine.rand() * 36) * topGuard * s + cut.perpY * newSide * sep * 0.24;

        newlySpawned.push({
          kind: 'chunk',
          key: pc.key,
          depth: pc.depth + 1,
          clipPlanes: childPlanes,
          x: pc.x + worldShiftX,
          y: pc.y + worldShiftY,
          r: pc.r,
          vx,
          vy: Math.max(-290 * s, Math.min(-85 * s, popVy)),
          z: Math.max(16 * s, pc.z + 8 * s),
          vz: (95 + 85 * Math.min(1.1, E)) * s,
          pivotLocalX: childPx,
          pivotLocalY: childPy,
          rot: worldRot,
          vrot: newSide * (2.6 + 2.2 * Math.min(1.2, E)) + curveRate * 0.28,
          juggled: true,
          immuneTimer: 0.15,
          kissed: false,
          age: 0,
        });
      }

      const splatScale = s * Math.max(0.42, 0.72 - pc.depth * 0.10);
      this.engine.triggerMacroChop(pc.x, pc.y, seg.vx || seg.dx, seg.vy || seg.dy, fruit, {
        scale: splatScale,
        speed,
        offsetNorm: cut.offsetNorm * 0.35,
        curveRate,
      });

      const tier = this._awardSwipeCombo(pc.x, pc.y, fruit, cut.cutAngle, true);
      if (this.onChopTelemetry && tier) {
        this.onChopTelemetry({
          fruit: `${tier.label} (+${tier.points.toLocaleString()})`,
          speed: Math.round(speed),
          angleDeg: Math.round((cut.cutAngle * 180) / Math.PI),
          splitRatio: `${this.strokeHits} in one swipe · ${this.totalScore.toLocaleString()} pts`,
          curveRate: Number(curveRate.toFixed(1)),
        });
      }
    }

    for (const ch of newlySpawned) this.pieces.push(ch);
  }

  _checkMatrixChops(seg) {
    const s = this.scale;
    const speed = seg.speed || 960;
    const curveRate = seg.curveRate || 0;
    const E = Math.max(0.10, Math.min(1.65, (speed - 180) / 1450));

    for (const cell of this.cells) {
      if (cell.selected || cell.entryProg < 0.65) continue;
      const cut = computeCircleCutGeometry(
        seg.x1, seg.y1, seg.x2, seg.y2,
        cell.x, cell.y, this.fruitR, this.fruitR * 1.12
      );
      if (!cut) continue;

      cell.selected = true;
      cell.cutAnim = 0;

      const fruit = STUDIO_FRUITS[cell.key];
      const { ux, uy, perpX, cutAngle, offsetNorm } = cut;

      // STRICT UPWARD RULE: ONLY fruits swiped upward (`uy < -0.22`) launch upward into hang-time!
      const isUpwardLaunch = uy < -0.22;
      const upFactor = isUpwardLaunch ? Math.min(1.0, (-uy - 0.18) / 0.58) : 0;

      let vxInit, vyInit;
      if (isUpwardLaunch) {
        const inwardX = (this.cx - cell.x) * 0.36;
        const spreadX = (ux * (48 + 30 * Math.min(1, E)) + (this.engine.rand() - 0.5) * 26) * s;
        vxInit = Math.max(-165 * s, Math.min(165 * s, inwardX + spreadX));
        // Row-aware launch velocity so both top-row AND bottom-row caps peak gracefully right in the upper frame!
        const rowBoost = cell.idx >= 3 ? 52 : 0;
        vyInit = -(228 + rowBoost + 62 * upFactor + 22 * Math.min(1, E)) * s;
      } else {
        const rawVx = (ux * (55 + 110 * E) + perpX * (this.engine.rand() > 0.5 ? 1 : -1) * (42 + 60 * E)) * s;
        const rawVy = (uy * (55 + 110 * E) - (38 + 42 * Math.min(1, E))) * s;
        vxInit = Math.max(-220 * s, Math.min(220 * s, rawVx));
        vyInit = Math.max(-180 * s, Math.min(210 * s, rawVy));
      }

      this.pieces.push({
        kind: 'cap',
        key: cell.key,
        depth: 1,
        clipPlanes: [],
        x: cell.x,
        y: cell.y - 3 * s,
        r: this.fruitR * 0.96,
        vx: vxInit,
        vy: vyInit,
        z: (8 + 10 * E) * s,
        vz: (isUpwardLaunch ? 142 : (62 + 130 * E)) * s,
        pivotLocalX: 0,
        pivotLocalY: 0,
        rot: cell.tilt,
        vrot: (ux >= 0 ? 1 : -1) * (1.8 + 2.2 * E) + curveRate * 0.32,
        juggled: isUpwardLaunch,
        immuneTimer: 0.16,
        kissed: false,
        age: 0,
      });

      if (isUpwardLaunch) {
        this.engine.spawnDripTrail(cell.x, cell.y, vxInit, vyInit * 0.72, fruit, 4, s);
        if (this.engine.audio) this.engine.audio.playUpwardScoop(this.engine.panForX(cell.x));
      }

      // Multi-pigment viscous splatter blooming organically in this fruit's true natural nectar hue!
      this.engine.triggerMacroChop(cell.x, cell.y, seg.vx || seg.dx, seg.vy || seg.dy, fruit, {
        scale: s * 0.68,
        speed,
        offsetNorm: offsetNorm * 0.4,
        curveRate,
      });

      const tier = this._awardSwipeCombo(cell.x, cell.y, fruit, cutAngle, false);
      const count = this.selectedCount;
      this.phase = 1;
      this.phaseTimer = 0;

      if (count === this.cells.length && this.autoRefill) {
        this.refillTimer = 1.95;
      }

      if (this.onChopTelemetry) {
        this.onChopTelemetry({
          fruit: tier
            ? `${tier.label} (+${tier.points.toLocaleString()}) · ${count}/6`
            : (isUpwardLaunch ? `↑ ${cell.tag} Launched · ${count}/6` : `Selected ${cell.tag} · ${count}/6`),
          speed: Math.round(speed),
          angleDeg: Math.round((cutAngle * 180) / Math.PI),
          splitRatio: tier ? `${this.strokeHits} in one swipe · ${this.totalScore.toLocaleString()} pts` : `${count} / 6 selected`,
          curveRate: Number(curveRate.toFixed(1)),
        });
      }
    }
  }

  step(dt) {
    const simDt = this.engine.step(dt);
    const h = Math.min(0.033, Math.max(0.001, dt));
    const s = this.scale;

    if (this.scoreVisTimer > 0) this.scoreVisTimer = Math.max(0, this.scoreVisTimer - h);
    if (this.scorePulse > 0) this.scorePulse = Math.max(0, this.scorePulse - h * 4.2);

    if (this.phase > 0) {
      this.phaseTimer += h;
      if (this.phase === 1 && this.phaseTimer > 0.16) this.phase = 2;
      else if (this.phase === 2 && this.phaseTimer > 0.72) this.phase = 3;
      else if (this.phase === 3 && this.phaseTimer > 3.2) this.phase = 0;
    }

    if (this.refillTimer > 0) {
      if (this.pieces.length === 0) this.refillTimer -= h;
      else this.refillTimer = Math.max(0.45, this.refillTimer - h * 0.35);
      if (this.refillTimer <= 0) this._initCells(true);
    }

    for (const cell of this.cells) {
      if (cell.entryDelay > 0) {
        cell.entryDelay = Math.max(0, cell.entryDelay - simDt);
        if (cell.entryDelay <= 0 && this.engine.audio && cell.idx === 0) {
          this.engine.audio.playCeramicSettle(0);
        }
      } else if (cell.entryProg < 1) {
        cell.entryProg = Math.min(1, cell.entryProg + simDt * 2.15);
      }
      if (cell.selected && cell.cutAnim < 1) {
        cell.cutAnim = Math.min(1, cell.cutAnim + simDt * 4.2);
      }
    }

    const gravY = 560 * s;
    const gravZ = 680 * s;
    for (let i = this.pieces.length - 1; i >= 0; i--) {
      const pc = this.pieces[i];
      pc.age += simDt;
      if (pc.immuneTimer > 0) pc.immuneTimer = Math.max(0, pc.immuneTimer - simDt);

      pc.vx *= Math.exp(-0.55 * simDt);
      pc.vy += gravY * simDt;
      pc.x += pc.vx * simDt;
      pc.y += pc.vy * simDt;

      pc.vz -= gravZ * simDt;
      pc.z += pc.vz * simDt;
      if (pc.z < 0) {
        pc.z = 0;
        const impactSpd = -pc.vz;
        if (impactSpd > 35 * s) {
          pc.vz = impactSpd * 0.24;
          if (!pc.kissed && pc.y > 0 && pc.y < this.height) {
            pc.kissed = true;
            const strength = Math.min(1, impactSpd / (190 * s));
            this.engine.spawnContactKiss(pc.x, pc.y, pc.r * 0.65, STUDIO_FRUITS[pc.key], strength);
            if (this.engine.audio) this.engine.audio.playWetKiss(this.engine.panForX(pc.x), strength);
          }
        } else {
          pc.vz = 0;
        }
      }

      pc.vrot *= Math.exp(-0.42 * simDt);
      pc.rot += pc.vrot * simDt;

      if (pc.y > this.height + pc.r * 2.1 || pc.x < -pc.r * 2.4 || pc.x > this.width + pc.r * 2.4) {
        this.pieces.splice(i, 1);
      }
    }
  }

  _drawPorcelainTray(ctx) {
    const s = this.scale;
    const x = this.cx - this.trayW * 0.5;
    const y = this.cy - this.trayH * 0.5;
    const rad = 28 * s;

    // 1. Sculpted 3×2 matte-alabaster porcelain bento tray
    ctx.save();
    ctx.shadowColor = 'rgba(72, 56, 40, 0.15)';
    ctx.shadowBlur = 24 * s;
    ctx.shadowOffsetX = 4 * s;
    ctx.shadowOffsetY = 10 * s;
    roundRectPath(ctx, x, y, this.trayW, this.trayH, rad);
    const outerG = ctx.createLinearGradient(x, y, x, y + this.trayH);
    outerG.addColorStop(0.0, 'rgba(255, 253, 250, 0.97)');
    outerG.addColorStop(0.55, 'rgba(246, 241, 233, 0.93)');
    outerG.addColorStop(1.0, 'rgba(230, 222, 210, 0.95)');
    ctx.fillStyle = outerG;
    ctx.fill();
    ctx.restore();

    roundRectPath(ctx, x, y, this.trayW, this.trayH, rad);
    ctx.strokeStyle = 'rgba(138, 122, 104, 0.26)';
    ctx.lineWidth = 1.2 * s;
    ctx.stroke();

    roundRectPath(ctx, x + 1.5 * s, y + 1.5 * s, this.trayW - 3 * s, this.trayH - 3 * s, rad - 1.5 * s);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.80)';
    ctx.lineWidth = 1.0 * s;
    ctx.stroke();

    // 2. Six concave circular porcelain swatch wells + micro-debossed fruit labels
    for (const cell of this.cells) {
      const dr = this.wellR;
      const fruit = STUDIO_FRUITS[cell.key];

      ctx.save();
      ctx.beginPath();
      ctx.arc(cell.x, cell.y, dr, 0, Math.PI * 2);
      const wellG = ctx.createRadialGradient(cell.x + dr * 0.28, cell.y + dr * 0.30, dr * 0.1, cell.x, cell.y, dr);
      wellG.addColorStop(0.0, 'rgba(252, 249, 244, 0.92)');
      wellG.addColorStop(0.70, 'rgba(235, 228, 218, 0.78)');
      wellG.addColorStop(1.0, 'rgba(210, 200, 186, 0.76)');
      ctx.fillStyle = wellG;
      ctx.fill();

      ctx.clip();
      ctx.beginPath();
      ctx.arc(cell.x + 1.6 * s, cell.y + 3.0 * s, dr, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(112, 94, 74, 0.20)';
      ctx.lineWidth = 3.5 * s;
      ctx.stroke();

      // Delicate translucent pooled fruit nectar matching this well's specific fruit when selected!
      if (cell.selected) {
        const poolA = easeOutCubic(cell.cutAnim) * 0.36;
        const ng = ctx.createRadialGradient(cell.x, cell.y, dr * 0.15, cell.x, cell.y, dr * 0.98);
        ng.addColorStop(0.0, `${fruit.liquidMid}AA`);
        ng.addColorStop(0.70, `${fruit.liquidMid}66`);
        ng.addColorStop(1.0, `${fruit.liquidLight}00`);
        ctx.globalAlpha = poolA;
        ctx.fillStyle = ng;
        ctx.beginPath();
        ctx.arc(cell.x, cell.y, dr * 0.98, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      ctx.beginPath();
      ctx.arc(cell.x, cell.y, dr, 0, Math.PI * 2);
      ctx.strokeStyle = cell.selected ? `${fruit.accent}88` : 'rgba(255, 255, 255, 0.76)';
      ctx.lineWidth = (cell.selected ? 1.35 : 0.95) * s;
      ctx.stroke();

      // Whisper-clean micro-debossed fruit tag underneath each well
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.font = `600 ${Math.round(8.2 * s)}px -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", system-ui, sans-serif`;
      ctx.fillStyle = cell.selected ? fruit.accent : 'rgba(92, 80, 68, 0.44)';
      ctx.fillText(cell.tag, cell.x, cell.y + dr + 5 * s);
      ctx.restore();
    }
  }

  _drawFlyingCap(ctx, pc) {
    const map = getLoadedFruits();
    if (!map || !map[pc.key]) return;
    const img = map[pc.key].cut;
    const drawR = pc.r * 1.136;
    const zLift = Math.max(0, pc.z);
    const zScale = 1 + Math.min(0.24, zLift / 380);

    ctx.save();
    ctx.translate(pc.x, pc.y);

    const shWx = pc.r * 0.08 + zLift * 0.24;
    const shWy = pc.r * 0.14 + zLift * 0.34;
    const shAlpha = Math.max(0.035, 0.14 * (1 - zLift / 240));
    const shR = pc.r * (0.94 + zLift / 220);
    ctx.save();
    ctx.translate(shWx, shWy);
    const shG = ctx.createRadialGradient(0, 0, shR * 0.14, 0, 0, shR);
    shG.addColorStop(0.0, `rgba(66, 50, 34, ${shAlpha})`);
    shG.addColorStop(0.55, `rgba(66, 50, 34, ${shAlpha * 0.48})`);
    shG.addColorStop(1.0, 'rgba(66, 50, 34, 0)');
    ctx.fillStyle = shG;
    ctx.beginPath();
    ctx.ellipse(0, 0, shR, shR * 0.88, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.scale(zScale, zScale);
    ctx.rotate(pc.rot);
    ctx.drawImage(img, -drawR, -drawR, drawR * 2, drawR * 2);
    ctx.restore();
  }

  render() {
    const ctx = this.engine.beginRender();
    const s = this.scale;
    const map = getLoadedFruits();

    this._drawPorcelainTray(ctx);

    // Draw all 6 distinct studio fruits inside their porcelain swatch wells
    for (const cell of this.cells) {
      if (cell.entryDelay > 0 || cell.entryProg <= 0.001) continue;
      const e = easeOutQuint(cell.entryProg);
      const sc = 0.72 + 0.28 * e;
      const aU = Math.min(1, cell.entryProg / 0.24);
      const alpha = aU * aU * (3 - 2 * aU);

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(cell.x, cell.y);
      if (!cell.selected) {
        const rot = cell.tilt + 0.30 * (1 - e);
        ctx.scale(sc, sc);
        drawPhotoWholeFruit(ctx, 0, 0, this.fruitR, cell.key, rot, alpha);
      } else if (map && map[cell.key]) {
        const pulse = 1.0 + Math.sin(Math.min(1, cell.cutAnim) * Math.PI) * 0.07;
        const drawR = this.fruitR * 1.11 * pulse;
        ctx.fillStyle = 'rgba(68, 42, 32, 0.16)';
        ctx.beginPath();
        ctx.ellipse(2 * s, 4 * s, this.fruitR * 0.84, this.fruitR * 0.86, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.rotate(cell.tilt * 0.7);
        ctx.drawImage(map[cell.key].cut, -drawR, -drawR, drawR * 2, drawR * 2);
      }
      ctx.restore();
    }

    // 100% solid multi-fruit airborne caps & recursively diced chunks (NEVER fade out!)
    const sorted = this.pieces.length > 1 ? [...this.pieces].sort((a, b) => a.z - b.z) : this.pieces;
    for (const pc of sorted) {
      if (pc.kind === 'cap') {
        this._drawFlyingCap(ctx, pc);
      } else {
        drawPhotoSlicedChunk3D(
          ctx, pc.x, pc.y, pc.r, pc.key, pc.rot, pc.clipPlanes, pc.z, pc.pivotLocalX, pc.pivotLocalY
        );
      }
    }

    // Whisper-clean editorial porcelain PTS badge (appears ONLY when combos activate!)
    if (this.totalScore > 0 && this.scoreVisTimer > 0.01) {
      const visA = this.scoreVisTimer < 0.8 ? this.scoreVisTimer / 0.8 : 1.0;
      const pulseSc = 1 + this.scorePulse * 0.10;
      const bx = 22 * s, by = 22 * s;
      const valStr = this.totalScore.toLocaleString();

      ctx.save();
      ctx.globalAlpha = visA;
      ctx.translate(bx, by);
      ctx.scale(pulseSc, pulseSc);

      ctx.font = `700 ${Math.round(13.5 * s)}px -apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", system-ui, sans-serif`;
      const valW = ctx.measureText(valStr).width;
      const pillW = 46 * s + valW + 18 * s;
      const pillH = 28 * s;

      roundRectPath(ctx, 0, 0, pillW, pillH, pillH * 0.5);
      ctx.fillStyle = 'rgba(255, 253, 249, 0.86)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(130, 114, 96, 0.22)';
      ctx.lineWidth = 1.0 * s;
      ctx.stroke();

      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = `600 ${Math.round(9.5 * s)}px -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", system-ui, sans-serif`;
      ctx.fillStyle = 'rgba(92, 78, 64, 0.55)';
      ctx.fillText('PTS', 12 * s, pillH * 0.5 + 0.5 * s);

      ctx.font = `700 ${Math.round(13.5 * s)}px -apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", system-ui, sans-serif`;
      ctx.fillStyle = '#1C1815';
      ctx.fillText(valStr, 39 * s, pillH * 0.5);
      ctx.restore();
    }

    // Editorial 4-beat footer showing live multi-select count (0/6 .. 6/6)
    const count = this.selectedCount;
    const phases = [`01 POISED · ${count}/6`, '02 MULTI-SELECT', '03 BOTANICAL SPLAT', `04 SELECTED · ${count}/6`];
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `500 ${Math.round(10 * s)}px -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", system-ui, sans-serif`;
    const yFoot = this.height - 19 * s;
    const spacing = 132 * s;
    const x0 = this.width * 0.5 - spacing * 1.5;
    phases.forEach((lbl, idx) => {
      ctx.fillStyle = idx === this.phase ? 'rgba(34, 28, 24, 0.78)' : 'rgba(62, 54, 46, 0.28)';
      ctx.fillText(lbl, x0 + idx * spacing, yFoot);
    });
    ctx.restore();

    this.engine.endRender();
  }
}


class FruitMatrixElement extends FruitElement {
  static formAssociated = true;
  static observedAttributes = ['value', 'label', 'name', 'auto-refill', 'disabled'];

  constructor() {
    super();
    this._lastSig = '';
    this._downPt = null;
    this._moved = 0;
    this._changedOnStroke = false;
    this._keyIndex = 0;
  }

  _createDemo(mount, opts) {
    return new FruitMatrix(mount, { ...opts, autoRefill: this.hasAttribute('auto-refill') });
  }

  _syncFromAttrs() {
    this.setAttribute('role', 'group');
    this.setAttribute('aria-label', this.getAttribute('label') || 'Fruit swatch matrix');
    if (this._demo) this._demo.autoRefill = this.hasAttribute('auto-refill');
    const raw = (this.getAttribute('value') || '').split(',').map((s) => s.trim()).filter(Boolean);
    this._setSelectedQuiet(raw);
  }

  attributeChangedCallback(name, _oldVal, newVal) {
    if (!this._demo) return;
    if (name === 'label') this.setAttribute('aria-label', newVal || 'Fruit swatch matrix');
    else if (name === 'auto-refill') this._demo.autoRefill = newVal !== null;
    else if (name === 'value') {
      const raw = (newVal || '').split(',').map((s) => s.trim()).filter(Boolean);
      if (raw.join(',') !== this._lastSig) this._setSelectedQuiet(raw);
    }
  }

  _currentKeys() {
    if (!this._demo) return [];
    return this._demo.cells.filter((c) => c.selected).map((c) => c.key);
  }

  _setSelectedQuiet(keys) {
    const set = new Set(keys);
    if (this._demo) {
      for (const cell of this._demo.cells) {
        cell.selected = set.has(cell.key);
        cell.cutAnim = cell.selected ? 1 : 0;
        cell.entryProg = 1;
        cell.entryDelay = 0;
      }
      this._demo.refillTimer = -1;
    }
    const list = this._currentKeys();
    this._lastSig = list.join(',');
    if (this._internals?.setFormValue) this._internals.setFormValue(this._lastSig);
  }

  _syncSelection(notify = true) {
    if (!this._demo) return;
    const list = this._currentKeys();
    const sig = list.join(',');
    if (sig !== this._lastSig) {
      this._lastSig = sig;
      this._changedOnStroke = true;
      if (this._internals?.setFormValue) this._internals.setFormValue(sig);
      if (notify) this.emit('change', { selected: list, value: sig, count: list.length, score: this.score });
    }
  }

  _chopCell(cell) {
    const d = this._demo;
    if (!d || !cell || cell.selected) return;
    cell.entryProg = 1;
    cell.entryDelay = 0;
    const r = d.fruitR * 1.4;
    d.pointerDown(cell.x - r * 0.85, cell.y - r * 0.9);
    d.pointerMove(cell.x, cell.y);
    d.pointerMove(cell.x + r * 0.85, cell.y + r * 0.9);
    d.pointerUp();
    this._syncSelection(true);
  }

  _onPointerDown(p) {
    this._downPt = p;
    this._moved = 0;
    this._changedOnStroke = false;
  }

  _onPointerMove(p) {
    if (this._downPt) this._moved = Math.max(this._moved, Math.hypot(p.x - this._downPt.x, p.y - this._downPt.y));
    this._syncSelection(false);
  }

  _onPointerUp() {
    const d = this._demo;
    this._syncSelection(false);
    if (this._changedOnStroke) {
      const list = this._currentKeys();
      this.emit('change', { selected: list, value: list.join(','), count: list.length, score: this.score });
    } else if (d && this._downPt && this._moved < 14 * d.scale) {
      for (const cell of d.cells) {
        if (!cell.selected && Math.hypot(this._downPt.x - cell.x, this._downPt.y - cell.y) <= d.wellR * 1.05) {
          this._chopCell(cell);
          break;
        }
      }
    }
    this._downPt = null;
  }

  _afterStep() {
    this._syncSelection(true);
  }

  _afterClear() {
    this._syncSelection(true);
  }

  _onKeyDown(e) {
    const d = this._demo;
    if (!d) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); this._keyIndex = (this._keyIndex + 1) % d.cells.length; }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); this._keyIndex = (this._keyIndex + d.cells.length - 1) % d.cells.length; }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); this._keyIndex = (this._keyIndex + 3) % d.cells.length; }
    else if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      this.toggleFruit(d.cells[this._keyIndex].key);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      this.reset();
    }
  }

  get selected() { return this._currentKeys(); }
  set selected(arr) { this._setSelectedQuiet(Array.isArray(arr) ? arr : []); }

  get value() { return this._currentKeys().join(','); }
  set value(v) { this._setSelectedQuiet(String(v || '').split(',').map((s) => s.trim()).filter(Boolean)); }

  toggleFruit(key) {
    const d = this._demo;
    if (!d) return;
    const cell = d.cells.find((c) => c.key === key);
    if (!cell) return;
    if (cell.selected) {
      cell.selected = false;
      cell.entryProg = 0;
      cell.entryDelay = 0.02;
      cell.cutAnim = 0;
      d.refillTimer = -1;
      d.engine.audio?.playBezelTick(false, d.engine.panForX(cell.x));
      this._syncSelection(true);
    } else {
      this._chopCell(cell);
    }
  }

  reset() {
    this._demo?.resetTray();
    this._syncSelection(true);
  }
}

customElements.define('fruit-matrix', FruitMatrixElement);
