// Fruit Studio UI — Piece 05: Press-to-Burst Fig Confirm Pedestal (Hold-to-Burst + Upward Slash Combos!)
// Dieter Rams / Apple concentric circular matte-porcelain confirm pedestal cradling a macro Black Mission Fig:
//   - Press & Hold (~0.68s): Compresses the velvety dark fig under hydraulic tension while a recessed wine-plum progress ring
//     fills 360° -> HYDRAULIC BURST erupts a radial wine-plum viscous crown, reveals the glistening ruby fig heart & lights `✓`!
//   - Slash / Upward Flick at any time: Cleaves the fig with true swipe angle/speed physics — downward drops halves off-screen,
//     UPWARD launches ONLY the cleaved fig halves soaring upward into hang-time for continuous Double / Triple / Quad / Hexa COMBO!

function easeOutQuint(t) { const u = Math.max(0, Math.min(1, t)); return 1 - Math.pow(1 - u, 5); }
function easeOutCubic(t) { const u = Math.max(0, Math.min(1, t)); return 1 - Math.pow(1 - u, 3); }

class FigPedestal {
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
    this.cy = this.height * 0.48;
    this.outerR = 96 * s;
    this.ringR = 84 * s;
    this.innerR = 72 * s;
    this.fruitR = 50 * s;

    this.confirmed = false;
    this.confirmAnim = 0;     // 0..1 crisp settle of confirmed ruby fig heart + ✓
    this.entryProg = 1.0;
    this.entryDelay = 0;
    this.fruitRot = -0.05;
    this.cooldown = 0;
    this.phase = 0;
    this.phaseTimer = 0;

    // Hold-to-compress hydraulic state
    this.holding = false;
    this.holdProg = 0;        // 0..1 fills 360° wine-plum rim
    this.holdTime = 0.66;     // crisp 0.66s tactile confirmation hold
    this._lastHoldClickStep = 0;
    this.downX = 0;
    this.downY = 0;
    this.isSwiping = false;
    this.resetTimer = -1;

    this.onChopTelemetry = opts.onChopTelemetry || null;

    // 100% solid soaring cleaved fig halves & recursively diced ruby chunks (NEVER fade out!)
    this.pieces = [];

    // Single-swipe continuous multi-piece combo & superlinear point system
    this.strokeHits = 0;
    this.strokeAwardedPts = 0;
    this.totalScore = 0;
    this.scoreVisTimer = 0;
    this.scorePulse = 0;
  }

  resetPedestal() {
    this.confirmed = false;
    this.confirmAnim = 0;
    this.holding = false;
    this.holdProg = 0;
    this._lastHoldClickStep = 0;
    this.entryProg = 0;
    this.entryDelay = 0.08;
    this.fruitRot = (this.engine.rand() - 0.5) * 0.30;
    this.resetTimer = -1;
    this.phase = 0;
  }

  clearSurface() {
    this.engine.clearCeramic();
    this.totalScore = 0;
    this.scoreVisTimer = 0;
    this.resetPedestal();
  }

  pointerDown(x, y) {
    this.strokeHits = 0;
    this.strokeAwardedPts = 0;
    this.downX = x;
    this.downY = y;
    this.isSwiping = false;
    this.engine.beginStroke(x, y);

    const dist = Math.hypot(x - this.cx, y - this.cy);
    if (dist <= this.outerR * 1.02 && this.entryDelay <= 0 && this.entryProg >= 0.72) {
      if (this.confirmed) {
        // Holding/tapping on an already-confirmed pedestal starts a clean reset on tap (or allows slicing!)
        this._tappedConfirmed = true;
      } else {
        this._tappedConfirmed = false;
        this.holding = true;
        this.holdProg = 0;
        this._lastHoldClickStep = 0;
        this.phase = 1;
        this.phaseTimer = 0;
        if (this.engine.audio) this.engine.audio.playBezelTick(false, this.engine.panForX(x));
      }
    } else {
      this._tappedConfirmed = false;
    }
    return true;
  }

  pointerMove(x, y) {
    const travel = Math.hypot(x - this.downX, y - this.downY);
    if (travel >= 20 * this.scale) {
      this.holding = false;
      this.isSwiping = true;
      this._tappedConfirmed = false;
    }

    const seg = this.engine.moveStroke(x, y);
    if (!seg) return;

    // 1. Mid-air continuous multi-piece slicing on soaring fig halves & ruby quarters -> COMBO!
    this._checkMidAirReslice(seg);

    // 2. Direct swipe cleave through the fig pedestal (works poised OR confirmed to launch combos!)
    if (this.isSwiping || Math.hypot(this.downX - this.cx, this.downY - this.cy) > this.outerR * 0.98) {
      this._checkPedestalChop(seg);
    }
  }

  pointerUp() {
    this.engine.endStroke();
    if (this._tappedConfirmed && !this.isSwiping) {
      this.resetPedestal();
    }
    this._tappedConfirmed = false;
    this.holding = false;
    this.isSwiping = false;
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

  _triggerHydraulicBurst() {
    const s = this.scale;
    const fruit = STUDIO_FRUITS.fig;
    this.holding = false;
    this.holdProg = 1.0;
    this.confirmed = true;
    this.confirmAnim = 0;
    this.cooldown = 0.34;
    this.phase = 2;
    this.phaseTimer = 0;

    // Erupt sumptuous 360° wine-plum viscous hydraulic crown over the alabaster pedestal!
    this.engine.triggerHydraulicBurst(this.cx, this.cy, fruit, { scale: s, ringR: 68 });

    // Split two glossy velvety fig shell halves symmetrically outward (falling naturally off-screen, zero fade-out!)
    const cutAng = Math.PI * 0.5 + (this.engine.rand() - 0.5) * 0.16;
    const perpX = -Math.sin(cutAng), perpY = Math.cos(cutAng);
    for (const side of [-1, 1]) {
      this.pieces.push({
        kind: 'half',
        key: 'fig',
        depth: 1,
        side,
        cutAngle: cutAng,
        offsetNorm: 0,
        baseRot: this.fruitRot,
        x: this.cx + perpX * side * 12 * s,
        y: this.cy + perpY * side * 12 * s,
        r: this.fruitR * 0.94,
        vx: perpX * side * (145 + this.engine.rand() * 35) * s,
        vy: -(110 + this.engine.rand() * 35) * s,
        z: 10 * s,
        vz: (115 + this.engine.rand() * 30) * s,
        pivotLocalY: side * this.fruitR * 0.40,
        rot: 0,
        vrot: side * (2.2 + this.engine.rand() * 0.8),
        openProg: 0.12,
        juggled: false,
        immuneTimer: 0.16,
        kissed: false,
        age: 0,
      });
    }

    if (this.onChopTelemetry) {
      this.onChopTelemetry({
        fruit: 'Hydraulic Burst · Confirmed ✓',
        speed: 0,
        angleDeg: 360,
        splitRatio: 'Black Mission Fig · 360° crown',
        curveRate: 0,
      });
    }
  }

  _checkMidAirReslice(seg) {
    const s = this.scale;
    const speed = seg.speed || 1000;
    const curveRate = seg.curveRate || 0;
    const E = Math.max(0.16, Math.min(1.65, (speed - 180) / 1450));
    const fruit = STUDIO_FRUITS.fig;
    const newlySpawned = [];

    for (let i = this.pieces.length - 1; i >= 0; i--) {
      const pc = this.pieces[i];
      if (pc.depth >= 4) continue;
      if (pc.immuneTimer > 0) continue;
      if (!pc.juggled && pc.age < 0.16) continue;

      const hitR = pc.r * (pc.depth === 1 ? 0.96 : pc.depth === 2 ? 0.80 : 0.68);
      const cut = computeCircleCutGeometry(seg.x1, seg.y1, seg.x2, seg.y2, pc.x, pc.y, hitR, hitR);
      if (!cut) continue;

      const worldRot = pc.kind === 'half' ? (pc.cutAngle + pc.rot) : pc.rot;
      const relAng = cut.cutAngle - worldRot;
      const px = pc.pivotLocalX || 0;
      const py = pc.pivotLocalY || 0;
      const nx = -Math.sin(relAng), ny = Math.cos(relAng);
      const centroidProj = nx * px + ny * py;
      const planeOffset = Math.max(-0.46, Math.min(0.46, (centroidProj + cut.offsetNorm * pc.r * 0.22) / pc.r));
      const basePlanes = pc.kind === 'half'
        ? [{ ang: 0, offset: pc.offsetNorm || 0, side: pc.side }]
        : (pc.clipPlanes || []);

      this.pieces.splice(i, 1);

      for (const newSide of [-1, 1]) {
        const childPlanes = [...basePlanes, { ang: relAng, offset: planeOffset, side: newSide }];
        const shiftDist = pc.r * (pc.depth === 1 ? 0.22 : 0.15);
        const childPx = px + nx * newSide * shiftDist;
        const childPy = py + ny * newSide * shiftDist;
        const cw = Math.cos(worldRot), sw = Math.sin(worldRot);
        const worldShiftX = (nx * newSide * shiftDist) * cw - (ny * newSide * shiftDist) * sw;
        const worldShiftY = (nx * newSide * shiftDist) * sw + (ny * newSide * shiftDist) * cw;

        const sep = (74 + 90 * Math.min(1.1, E)) * (0.88 + this.engine.rand() * 0.24) * s;
        const along = (18 + 60 * Math.min(1.1, E)) * s;
        const centerPullX = (this.cx - pc.x) * 0.26;
        const rawVx = pc.vx * 0.28 + centerPullX + cut.perpX * newSide * sep + cut.ux * along;
        const vx = Math.max(-210 * s, Math.min(210 * s, rawVx));
        const topGuard = Math.max(0.32, Math.min(1.0, (pc.y - 38 * s) / (118 * s)));
        const popVy = -(210 + 64 * Math.min(1.0, E) + this.engine.rand() * 38) * topGuard * s + cut.perpY * newSide * sep * 0.24;

        newlySpawned.push({
          kind: 'chunk',
          key: 'fig',
          depth: pc.depth + 1,
          clipPlanes: childPlanes,
          x: pc.x + worldShiftX,
          y: pc.y + worldShiftY,
          r: pc.r,
          vx,
          vy: Math.max(-295 * s, Math.min(-88 * s, popVy)),
          z: Math.max(16 * s, pc.z + 8 * s),
          vz: (100 + 88 * Math.min(1.1, E)) * s,
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

      const splatScale = s * Math.max(0.45, 0.80 - pc.depth * 0.10);
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

  _checkPedestalChop(seg) {
    if (this.cooldown > 0 || this.entryProg < 0.72) return false;
    const cut = computeCircleCutGeometry(
      seg.x1, seg.y1, seg.x2, seg.y2,
      this.cx, this.cy, this.fruitR, this.fruitR * 1.04
    );
    if (!cut) return false;

    const s = this.scale;
    const fruit = STUDIO_FRUITS.fig;
    const { ux, uy, perpX, perpY, cutAngle, offsetNorm, massNeg, massPos, cutMidX, cutMidY } = cut;
    const speed = seg.speed || 980;
    const curveRate = seg.curveRate || 0;
    const E = Math.max(0.14, Math.min(1.65, (speed - 180) / 1450));

    // REAL SWIPE PHYSICS: Swiping UPWARD launches ONLY this swiped fig's cleaved halves upward into hang-time!
    const isUpwardLaunch = uy < -0.22;
    const upFactor = isUpwardLaunch ? Math.min(1.0, (-uy - 0.18) / 0.58) : 0;

    for (const side of [-1, 1]) {
      const m = side < 0 ? massNeg : massPos;
      const invMass = Math.min(2.2, 0.5 / m);
      const pivotLocalY = side * this.fruitR * (0.40 * (1 - side * offsetNorm * 0.35));

      let vxInit, vyInit;
      if (isUpwardLaunch) {
        const sepX = (side * (48 + 30 * Math.min(1, E)) + ux * (42 + 28 * E)) * s;
        vxInit = Math.max(-165 * s, Math.min(165 * s, sepX));
        vyInit = -(258 + 68 * upFactor + 26 * Math.min(1, E) + (side > 0 ? 14 : 0)) * s;
      } else {
        const rawVx = (perpX * side * (86 + 112 * E) + ux * (28 + 115 * E)) * Math.pow(invMass, 0.45) * s;
        const rawVy = (perpY * side * (86 + 112 * E) + uy * (28 + 115 * E) - (22 + 28 * E)) * Math.pow(invMass, 0.45) * s;
        vxInit = Math.max(-230 * s, Math.min(230 * s, rawVx));
        vyInit = Math.max(-190 * s, Math.min(220 * s, rawVy));
      }

      this.pieces.push({
        kind: 'half',
        key: 'fig',
        depth: 1,
        side,
        cutAngle,
        offsetNorm,
        baseRot: this.fruitRot,
        x: this.cx + perpX * pivotLocalY,
        y: this.cy + perpY * pivotLocalY,
        r: this.fruitR,
        vx: vxInit,
        vy: vyInit,
        z: (6 + 10 * E) * s,
        vz: (isUpwardLaunch ? 142 : (62 + 145 * E)) * s,
        pivotLocalY,
        rot: 0,
        vrot: side * (1.3 + 2.0 * E) * Math.pow(invMass, 0.45) + curveRate * 0.32,
        openProg: 0,
        juggled: isUpwardLaunch,
        immuneTimer: 0.16,
        kissed: false,
        age: 0,
      });
    }

    if (isUpwardLaunch) {
      this.engine.spawnDripTrail(cutMidX, cutMidY, ux * 80 * s, -220 * s, fruit, 5, s);
      if (this.engine.audio) this.engine.audio.playUpwardScoop(this.engine.panForX(this.cx));
    }

    this.engine.triggerMacroChop(cutMidX, cutMidY, seg.vx || seg.dx, seg.vy || seg.dy, fruit, {
      scale: s * 0.95,
      speed,
      offsetNorm,
      curveRate,
    });

    const tier = this._awardSwipeCombo(cutMidX, cutMidY, fruit, cutAngle, false);

    this.holding = false;
    this.holdProg = 1.0;
    this.confirmed = !this.confirmed;
    this.confirmAnim = 0;
    this.cooldown = 0.34;
    this.phase = 2;
    this.phaseTimer = 0;

    // If slashed while confirmed, smoothly roll a fresh whole Black Mission Fig onto the pedestal!
    if (!this.confirmed) {
      this.entryProg = 0;
      this.entryDelay = 0.28;
      this.holdProg = 0;
    }

    if (this.onChopTelemetry) {
      this.onChopTelemetry({
        fruit: tier
          ? `${tier.label} (+${tier.points.toLocaleString()})`
          : (isUpwardLaunch ? '↑ Fig Launched · Swipe mid-air!' : (this.confirmed ? 'Black Mission Fig · Confirmed ✓' : 'Fresh Fig Ready')),
        speed: Math.round(speed),
        angleDeg: Math.round((cutAngle * 180) / Math.PI),
        splitRatio: tier ? `${this.strokeHits} in one swipe · ${this.totalScore.toLocaleString()} pts` : `${Math.round(massNeg * 100)}/${Math.round(massPos * 100)} split`,
        curveRate: Number(curveRate.toFixed(1)),
      });
    }

    return true;
  }

  step(dt) {
    const simDt = this.engine.step(dt);
    const h = Math.min(0.033, Math.max(0.001, dt));
    const s = this.scale;

    if (this.cooldown > 0) this.cooldown = Math.max(0, this.cooldown - h);
    if (this.scoreVisTimer > 0) this.scoreVisTimer = Math.max(0, this.scoreVisTimer - h);
    if (this.scorePulse > 0) this.scorePulse = Math.max(0, this.scorePulse - h * 4.2);

    // Hydraulic hold & compress ramp!
    if (this.holding && !this.confirmed) {
      this.holdProg = Math.min(1, this.holdProg + h / this.holdTime);
      const clickStep = Math.floor(this.holdProg * 4);
      if (clickStep > this._lastHoldClickStep && clickStep < 4) {
        this._lastHoldClickStep = clickStep;
        if (this.engine.audio) this.engine.audio.playBezelTick(clickStep === 2, 0);
      }
      if (this.holdProg >= 1.0) {
        this._triggerHydraulicBurst();
      }
    } else if (!this.confirmed && this.holdProg > 0) {
      this.holdProg = Math.max(0, this.holdProg - h * 3.8);
    }

    if (this.confirmed && this.confirmAnim < 1) {
      this.confirmAnim = Math.min(1, this.confirmAnim + simDt * 3.8);
    }

    if (this.phase > 0) {
      this.phaseTimer += h;
      if (this.phase === 2 && this.phaseTimer > 0.62) this.phase = 3;
      else if (this.phase === 3 && this.phaseTimer > 3.6 && !this.holding) this.phase = this.confirmed ? 3 : 0;
    }

    if (this.entryDelay > 0) {
      this.entryDelay = Math.max(0, this.entryDelay - simDt);
      if (this.entryDelay <= 0 && this.engine.audio) {
        this.engine.audio.playCeramicSettle(0);
      }
    } else if (this.entryProg < 1) {
      this.entryProg = Math.min(1, this.entryProg + simDt * 1.95);
    }

    // Continuous ballistic gravity — 100% solid fig halves & ruby quarters until falling off-screen!
    const gravY = 560 * s;
    const gravZ = 680 * s;
    for (let i = this.pieces.length - 1; i >= 0; i--) {
      const pc = this.pieces[i];
      pc.age += simDt;
      if (pc.immuneTimer > 0) pc.immuneTimer = Math.max(0, pc.immuneTimer - simDt);
      if (pc.kind === 'half') pc.openProg = Math.min(1, pc.openProg + simDt * 4.2);

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
            this.engine.spawnContactKiss(pc.x, pc.y, pc.r * 0.65, STUDIO_FRUITS.fig, strength);
            if (this.engine.audio) this.engine.audio.playWetKiss(this.engine.panForX(pc.x), strength);
          }
        } else {
          pc.vz = 0;
        }
      }

      pc.vrot *= Math.exp(-0.42 * simDt);
      pc.rot += pc.vrot * simDt;

      if (pc.y > this.height + pc.r * 1.95 || pc.x < -pc.r * 2.2 || pc.x > this.width + pc.r * 2.2) {
        this.pieces.splice(i, 1);
      }
    }
  }

  _drawPorcelainPedestal(ctx) {
    const s = this.scale;
    const cx = this.cx, cy = this.cy;
    const fruit = STUDIO_FRUITS.fig;
    const R = this.outerR;
    const ringR = this.ringR;
    const inR = this.innerR;

    // 1. Outer concentric matte-alabaster pedestal plinth
    ctx.save();
    ctx.shadowColor = 'rgba(72, 56, 40, 0.16)';
    ctx.shadowBlur = 24 * s;
    ctx.shadowOffsetX = 4 * s;
    ctx.shadowOffsetY = 11 * s;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    const outerG = ctx.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
    outerG.addColorStop(0.0, 'rgba(255, 253, 250, 0.97)');
    outerG.addColorStop(0.55, 'rgba(245, 240, 232, 0.93)');
    outerG.addColorStop(1.0, 'rgba(229, 221, 208, 0.95)');
    ctx.fillStyle = outerG;
    ctx.fill();
    ctx.restore();

    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(138, 122, 104, 0.28)';
    ctx.lineWidth = 1.2 * s;
    ctx.stroke();

    // 2. Recessed circular hydraulic progress channel (`ringR`)
    ctx.beginPath();
    ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(128, 114, 98, 0.16)';
    ctx.lineWidth = 5.2 * s;
    ctx.stroke();

    // Wine-plum circular fill arc ramping 0 -> 360° during Hold & Compress!
    const prog = this.confirmed ? 1.0 : this.holdProg;
    if (prog > 0.005) {
      const startA = -Math.PI * 0.5;
      const endA = startA + prog * Math.PI * 2;
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, ringR, startA, endA);
      ctx.strokeStyle = this.confirmed ? `${fruit.accent}CC` : fruit.accent;
      ctx.lineWidth = (5.0 + (this.holding ? 0.8 : 0)) * s;
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.restore();
    }

    // 3. Raised inner porcelain saucer cup cradling the Black Mission Fig
    const pressSink = this.holding ? this.holdProg * 2.2 * s : 0;
    ctx.save();
    ctx.shadowColor = 'rgba(72, 56, 40, 0.12)';
    ctx.shadowBlur = (10 - pressSink * 2) * s;
    ctx.shadowOffsetY = (4 - pressSink) * s;
    ctx.beginPath();
    ctx.arc(cx, cy, inR, 0, Math.PI * 2);
    const cupG = ctx.createRadialGradient(cx + inR * 0.22, cy + inR * 0.26, inR * 0.1, cx, cy, inR);
    cupG.addColorStop(0.0, 'rgba(255, 253, 250, 0.98)');
    cupG.addColorStop(0.72, 'rgba(244, 238, 230, 0.94)');
    cupG.addColorStop(1.0, 'rgba(224, 215, 202, 0.92)');
    ctx.fillStyle = cupG;
    ctx.fill();
    ctx.restore();

    // Subtle concave inner well shading + wine-plum glow once confirmed
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, inR - 8 * s, 0, Math.PI * 2);
    const wellG = ctx.createRadialGradient(cx + 14 * s, cy + 16 * s, 6 * s, cx, cy, inR - 8 * s);
    wellG.addColorStop(0.0, 'rgba(252, 249, 244, 0.92)');
    wellG.addColorStop(0.75, 'rgba(234, 227, 217, 0.78)');
    wellG.addColorStop(1.0, 'rgba(212, 202, 188, 0.74)');
    ctx.fillStyle = wellG;
    ctx.fill();

    if (this.confirmed) {
      const ca = easeOutCubic(this.confirmAnim) * 0.26;
      const ng = ctx.createRadialGradient(cx, cy, 10 * s, cx, cy, inR - 8 * s);
      ng.addColorStop(0.0, `${fruit.liquidMid}AA`);
      ng.addColorStop(0.70, `${fruit.liquidMid}55`);
      ng.addColorStop(1.0, `${fruit.liquidLight}00`);
      ctx.globalAlpha = ca;
      ctx.fillStyle = ng;
      ctx.fill();
    }
    ctx.restore();

    ctx.beginPath();
    ctx.arc(cx, cy, inR, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.82)';
    ctx.lineWidth = 1.0 * s;
    ctx.stroke();

    // 4. Delicate debossed checkmark `✓` carved into the bottom 6-o'clock ceramic collar (just like Concept 08!)
    const ckX = cx;
    const ckY = cy + inR - 9.5 * s;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(ckX - 4.2 * s, ckY + 0.2 * s);
    ctx.lineTo(ckX - 1.2 * s, ckY + 3.2 * s);
    ctx.lineTo(ckX + 4.8 * s, ckY - 3.0 * s);
    ctx.strokeStyle = this.confirmed ? fruit.accent : 'rgba(116, 102, 88, 0.34)';
    ctx.lineWidth = (this.confirmed ? 1.85 : 1.25) * s;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.restore();
  }

  render() {
    const ctx = this.engine.beginRender();
    const s = this.scale;
    const map = getLoadedFruits();
    const fruit = STUDIO_FRUITS.fig;

    this._drawPorcelainPedestal(ctx);

    // Whole Black Mission Fig (poised / compressing) OR Confirmed Jewel-Ruby Halved Fig Heart!
    if (this.entryDelay <= 0 && this.entryProg > 0.001) {
      const e = easeOutQuint(this.entryProg);
      const sc = 0.72 + 0.28 * e;
      const aU = Math.min(1, this.entryProg / 0.24);
      const alpha = aU * aU * (3 - 2 * aU);

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(this.cx, this.cy);

      if (!this.confirmed) {
        // Tactile hydraulic press compression + subtle pressure micro-tremble + beading wine droplets!
        const hp = this.holdProg;
        const squashX = 1 + hp * 0.085;
        const squashY = 1 - hp * 0.065;
        const tremorX = this.holding && hp > 0.35 ? Math.sin(this.engine.time * 54) * hp * 1.1 * s : 0;
        const tremorY = this.holding && hp > 0.35 ? Math.cos(this.engine.time * 47) * hp * 1.1 * s : 0;
        ctx.translate(tremorX, tremorY);
        ctx.scale(sc * squashX, sc * squashY);
        drawPhotoWholeFruit(ctx, 0, 0, this.fruitR, 'fig', this.fruitRot + 0.30 * (1 - e), alpha);

        // Emerging glossy wine-plum tension droplets beading around the fig skin as pressure climbs!
        if (hp > 0.18) {
          const beadN = 7;
          const bVis = Math.min(1, (hp - 0.18) / 0.55);
          for (let i = 0; i < beadN; i++) {
            const a = (i / beadN) * Math.PI * 2 + 0.4;
            const br = this.fruitR * (0.94 + 0.08 * hp);
            const bx = Math.cos(a) * br;
            const by = Math.sin(a) * br;
            const dr = (1.6 + 2.2 * bVis) * (0.75 + (i % 3) * 0.16) * s;
            ctx.beginPath();
            ctx.arc(bx, by, dr, 0, Math.PI * 2);
            ctx.fillStyle = `${fruit.liquidMid}DD`;
            ctx.fill();
            ctx.beginPath();
            ctx.arc(bx - dr * 0.3, by - dr * 0.3, dr * 0.35, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 232, 240, 0.85)';
            ctx.fill();
          }
        }
      } else if (map && map.fig) {
        // Confirmed glistening jewel-ruby Black Mission Fig cross-section nestled cleanly inside the porcelain cup!
        const pulse = 1.0 + Math.sin(Math.min(1, this.confirmAnim) * Math.PI) * 0.06;
        const drawR = this.fruitR * 1.08 * pulse;
        ctx.fillStyle = 'rgba(62, 34, 42, 0.16)';
        ctx.beginPath();
        ctx.ellipse(2 * s, 5 * s, this.fruitR * 0.86, this.fruitR * 0.84, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.drawImage(map.fig.cut, -drawR, -drawR * 1.04, drawR * 2, drawR * 2);
      }

      ctx.restore();
    }

    // 100% solid airborne cleaved fig halves & recursively diced ruby chunks (NEVER fade out!)
    const sorted = this.pieces.length > 1 ? [...this.pieces].sort((a, b) => a.z - b.z) : this.pieces;
    for (const pc of sorted) {
      if (pc.kind === 'half') {
        drawPhotoSlicedHalf3D(
          ctx, pc.x, pc.y, pc.r, pc.key, pc.cutAngle, pc.side, pc.rot,
          1.0, pc.openProg, pc.baseRot, pc.offsetNorm, pc.z, pc.pivotLocalY
        );
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

    // Editorial 4-beat footer matching Concept 08!
    const phases = ['01 POISED', '02 HOLD & COMPRESS', '03 HYDRAULIC BURST', this.confirmed ? '04 CONFIRMED ✓' : '04 CONFIRMED'];
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `500 ${Math.round(10 * s)}px -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", system-ui, sans-serif`;
    const yFoot = this.height - 20 * s;
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


class FruitButtonElement extends FruitElement {
  static observedAttributes = ['confirmed', 'label', 'disabled'];

  constructor() {
    super();
    this._lastConfirmed = false;
  }

  _createDemo(mount, opts) {
    const demo = new FigPedestal(mount, opts);
    this._lastConfirmed = demo.confirmed;
    return demo;
  }

  _syncFromAttrs() {
    this.setAttribute('role', 'button');
    this.setAttribute('aria-label', this.getAttribute('label') || 'Confirm');
    const want = this.hasAttribute('confirmed');
    if (this._demo) {
      this._demo.confirmed = want;
      this._demo.confirmAnim = want ? 1 : 0;
      this._lastConfirmed = want;
    }
    this.setAttribute('aria-pressed', String(want));
  }

  attributeChangedCallback(name, _oldVal, newVal) {
    if (!this._demo) return;
    if (name === 'label') this.setAttribute('aria-label', newVal || 'Confirm');
    else if (name === 'confirmed') {
      const want = newVal !== null;
      this._demo.confirmed = want;
      this._demo.confirmAnim = want ? 1 : 0;
      this._lastConfirmed = want;
      this.setAttribute('aria-pressed', String(want));
    }
  }

  _checkConfirm() {
    if (!this._demo) return;
    if (this._demo.confirmed !== this._lastConfirmed) {
      this._lastConfirmed = this._demo.confirmed;
      this.setAttribute('aria-pressed', String(this._lastConfirmed));
      if (this._lastConfirmed) {
        this.emit('confirm', { confirmed: true, score: this.score });
      } else {
        this.emit('reset', { confirmed: false });
      }
    }
  }

  _afterStep() {
    this._checkConfirm();
  }

  _onPointerUp() {
    this._checkConfirm();
  }

  _afterClear() {
    this._checkConfirm();
  }

  _onKeyDown(e) {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (this._demo?.confirmed) this.reset();
      else this.burst();
    }
  }

  get confirmed() { return this._demo ? this._demo.confirmed : this.hasAttribute('confirmed'); }
  set confirmed(v) {
    if (v) this.setAttribute('confirmed', '');
    else this.removeAttribute('confirmed');
  }

  burst() {
    if (!this._demo || this._demo.confirmed) return;
    this._demo.entryProg = 1;
    this._demo.entryDelay = 0;
    this._demo._triggerHydraulicBurst();
    this._checkConfirm();
  }

  reset() {
    this._demo?.resetPedestal();
    this._checkConfirm();
  }
}

customElements.define('fruit-button', FruitButtonElement);
