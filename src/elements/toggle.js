// Fruit Studio UI v4 — Piece 01: Porcelain Chop Toggle (Butter-Smooth Apple-Grade Choreography!)
// Improvements:
//   - Zero-snap 3D fruit split: halves start flush at openProg = 0 and glide smoothly open in 3D while separating
//   - Critically-damped smooth Apple spring entry for the incoming fruit (no jarring empty pause or bouncy pop-in!)
//   - Smooth damped air-glide drift & soft fade on cleaved fruit halves

const FRUIT_CYCLE = ['bloodOrange', 'yuzu', 'kiwi', 'watermelon'];

function easeOutCubic(t) { const u = Math.max(0, Math.min(1, t)); return 1 - Math.pow(1 - u, 3); }
function easeOutQuint(t) { const u = Math.max(0, Math.min(1, t)); return 1 - Math.pow(1 - u, 5); }

class ChopToggle {
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
    this.trackW = 248 * s;
    this.trackH = 114 * s;
    this.fruitR = 45 * s;
    this.slotOffset = 65 * s;

    this.cycleIndex = 0;
    this.isOn = false;
    this.knobX = this.cx - this.slotOffset;
    this.knobTargetX = this.knobX;
    this.knobRot = -0.05;
    this.knobTargetRot = -0.05;
    this.knobEntry = 1.0; // 0..1 critically-damped smooth glide-in
    this.knobDelay = 0;
    this.cooldown = 0;

    // Gentle organic idle breathing (barely perceptible micro-settle)
    this.phase = 0;
    this.phaseTimer = 0;
    this.labelAlpha = 1.0;
    this.onChopTelemetry = opts.onChopTelemetry || null;

    this.halves = [];

    // Single-swipe continuous multi-piece combo & superlinear point system!
    this.strokeHits = 0;          // total pieces sliced during current continuous finger-down swipe
    this.strokeAwardedPts = 0;    // points already credited on this swipe (prevents double counting as tier climbs!)
    this.totalScore = 0;
    this.scoreVisTimer = 0;       // fades editorial PTS pill gently in on combo, back out when idle
    this.scorePulse = 0;
  }

  get currentFruitKey() {
    return FRUIT_CYCLE[this.cycleIndex % FRUIT_CYCLE.length];
  }

  setFruit(key) {
    const idx = FRUIT_CYCLE.indexOf(key);
    if (idx >= 0) {
      this.cycleIndex = idx;
      this.knobEntry = 0;
      this.knobDelay = 0;
    }
  }

  clearSurface() {
    this.engine.clearCeramic();
    this.totalScore = 0;
    this.scoreVisTimer = 0;
    this.phase = 0;
  }

  pointerDown(x, y) {
    this.strokeHits = 0;
    this.strokeAwardedPts = 0;
    this.engine.beginStroke(x, y);
    return true;
  }

  pointerMove(x, y) {
    const seg = this.engine.moveStroke(x, y);
    if (!seg) return;
    // 1. Mid-air continuous multi-piece re-slicing (keep finger down across 2, 3, 4, 5+ pieces -> Double/Triple/Quad/Penta COMBO!)
    this._checkMidAirReslice(seg);
    // 2. Primary porcelain toggle chop (swiping UP through the fruit launches ONLY that fruit's halves upward into hang-time!)
    this._checkChop(seg);
  }

  pointerUp() {
    this.engine.endStroke();
  }

  _awardSwipeCombo(hitX, hitY, fruit, cutAngle, isMidAir) {
    this.strokeHits += 1;
    // Trigger named COMBO! & superlinear points on any mid-air slice OR whenever >= 2 pieces are cut in one swipe!
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

  // Continuous multi-piece mid-air re-slicing! Keep finger down across 2, 3, 4, 5+ pieces in ONE swipe -> Double/Triple/Quad/Penta COMBO!
  _checkMidAirReslice(seg) {
    const s = this.scale;
    const speed = seg.speed || 1000;
    const curveRate = seg.curveRate || 0;
    const E = Math.max(0.16, Math.min(1.65, (speed - 180) / 1450));
    const newlySpawned = [];

    for (let i = this.halves.length - 1; i >= 0; i--) {
      const fh = this.halves[i];
      if (fh.depth >= 4) continue; // whole -> halves -> quarters -> eighths -> sixteenths!
      if (fh.immuneTimer > 0) continue; // short 0.15s spawn cooldown prevents same-pixel double-cut while allowing continuous sweeping!
      if (!fh.juggled && fh.age < 0.18) continue;

      const hitR = fh.r * (fh.depth === 1 ? 0.96 : fh.depth === 2 ? 0.80 : 0.66);
      const cut = computeCircleCutGeometry(seg.x1, seg.y1, seg.x2, seg.y2, fh.x, fh.y, hitR, hitR);
      if (!cut) continue;

      const fruit = STUDIO_FRUITS[fh.key];
      const worldRot = fh.depth === 1 ? (fh.cutAngle + fh.rot) : fh.rot;
      const relAng = cut.cutAngle - worldRot;
      const px = fh.pivotLocalX || 0;
      const py = fh.pivotLocalY || 0;
      const nx = -Math.sin(relAng), ny = Math.cos(relAng);
      const centroidProj = nx * px + ny * py;
      const planeOffset = Math.max(-0.48, Math.min(0.48, (centroidProj + cut.offsetNorm * fh.r * 0.20) / fh.r));

      const basePlanes = fh.clipPlanes && fh.clipPlanes.length > 0
        ? fh.clipPlanes
        : [{ ang: 0, offset: fh.offsetNorm || 0, side: fh.side }];

      this.halves.splice(i, 1);

      for (const newSide of [-1, 1]) {
        const childPlanes = [...basePlanes, { ang: relAng, offset: planeOffset, side: newSide }];
        const shiftDist = fh.r * (fh.depth === 1 ? 0.23 : fh.depth === 2 ? 0.16 : 0.11);
        const childPx = px + nx * newSide * shiftDist;
        const childPy = py + ny * newSide * shiftDist;
        const cw = Math.cos(worldRot), sw = Math.sin(worldRot);
        const worldShiftX = (nx * newSide * shiftDist) * cw - (ny * newSide * shiftDist) * sw;
        const worldShiftY = (nx * newSide * shiftDist) * sw + (ny * newSide * shiftDist) * cw;

        const sep = (75 + 95 * Math.min(1.1, E)) * (0.88 + this.engine.rand() * 0.24) * s;
        const along = (18 + 65 * Math.min(1.1, E)) * s;
        // Buoyant hang-time lift + gentle center pull keeps split quarters nicely grouped in-frame for Triple / Quad / Penta sweeps!
        const centerPullX = (this.cx - fh.x) * 0.26;
        const rawVx = fh.vx * 0.28 + centerPullX + cut.perpX * newSide * sep + cut.ux * along;
        const vx = Math.max(-210 * s, Math.min(210 * s, rawVx));
        const popVy = -(255 + 75 * Math.min(1.0, E) + this.engine.rand() * 55) * s + cut.perpY * newSide * sep * 0.35;

        newlySpawned.push({
          key: fh.key,
          depth: fh.depth + 1,
          clipPlanes: childPlanes,
          x: fh.x + worldShiftX,
          y: fh.y + worldShiftY,
          r: fh.r,
          vx,
          vy: Math.max(-390 * s, Math.min(-140 * s, popVy)),
          z: Math.max(16 * s, fh.z + 8 * s),
          vz: (105 + 95 * Math.min(1.1, E)) * s,
          cutAngle: cut.cutAngle,
          baseRot: fh.baseRot,
          offsetNorm: 0,
          chordRatio: Math.max(0.45, 0.78 - fh.depth * 0.12),
          pivotLocalX: childPx,
          pivotLocalY: childPy,
          side: newSide,
          rot: worldRot,
          vrot: newSide * (2.5 + 2.2 * Math.min(1.2, E)) + curveRate * 0.28,
          openProg: 1.0,
          openRate: 4.0,
          juggled: true,
          immuneTimer: 0.15,
          kissed: false,
          age: 0,
        });
      }

      const splatScale = s * Math.max(0.48, 0.90 - fh.depth * 0.14);
      this.engine.triggerMacroChop(fh.x, fh.y, seg.vx || seg.dx, seg.vy || seg.dy, fruit, {
        scale: splatScale,
        speed,
        offsetNorm: cut.offsetNorm * 0.35,
        curveRate,
      });

      const tier = this._awardSwipeCombo(fh.x, fh.y, fruit, cut.cutAngle, true);
      if (this.onChopTelemetry && tier) {
        this.onChopTelemetry({
          fruit: `${tier.label} (+${tier.points.toLocaleString()}) · ${fruit.label}`,
          speed: Math.round(speed),
          angleDeg: Math.round((cut.cutAngle * 180) / Math.PI),
          splitRatio: `${this.strokeHits} in one swipe · total ${this.totalScore.toLocaleString()} pts`,
          curveRate: Number(curveRate.toFixed(1)),
        });
      }
    }

    for (const ch of newlySpawned) this.halves.push(ch);
  }

  _checkChop(seg) {
    if (this.cooldown > 0 || this.knobEntry < 0.65) return false;
    const cut = computeCircleCutGeometry(
      seg.x1, seg.y1, seg.x2, seg.y2,
      this.knobX, this.cy, this.fruitR, this.fruitR * 1.04
    );
    if (!cut) return false;

    const s = this.scale;
    const { ux, uy, perpX, perpY, cutAngle, offsetNorm, chordRatio, massNeg, massPos, cutMidX, cutMidY } = cut;
    const speed = seg.speed || 900;
    const curveRate = seg.curveRate || 0;
    const E = Math.max(0.08, Math.min(1.65, (speed - 180) / 1450));

    // EASTER EGG: Swiping UPWARD through the fruit (uy < -0.22) launches BOTH cleaved halves soaring UPWARD into hang-time!
    // Swiping horizontally or downward lets them part cleanly and fall naturally off the bottom edge!
    const isUpwardLaunch = uy < -0.22;
    const upFactor = isUpwardLaunch ? Math.min(1.0, (-uy - 0.18) / 0.58) : 0;

    const choppedKey = this.currentFruitKey;
    const fruit = STUDIO_FRUITS[choppedKey];
    const chopX = this.knobX;
    const chopY = this.cy;
    const baseRot = this.knobRot;

    for (const side of [-1, 1]) {
      const mass = side < 0 ? massNeg : massPos;
      const invMass = 0.5 / Math.max(0.15, mass);
      const pivotLocalY = side < 0
        ? this.fruitR * (offsetNorm - 1) * 0.5
        : this.fruitR * (offsetNorm + 1) * 0.5;

      const sep = (66 + 175 * E) * Math.pow(invMass, 0.78) * (0.94 + this.engine.rand() * 0.12) * s;
      const along = (14 + 130 * E) * (0.45 + 0.55 * invMass) * (0.92 + this.engine.rand() * 0.16) * s;

      const vrot =
        side * (0.70 + 1.65 * E) * Math.pow(invMass, 0.72) +
        curveRate * 0.28 +
        offsetNorm * (0.45 + 0.85 * E);

      let vxInit, vyInit;
      if (isUpwardLaunch) {
        // Calibrated upward launch: peaks cleanly inside upper frame (y ~ 52..82, NEVER clips off top edge!) with lush hang-time!
        const inwardX = (this.cx - chopX) * 0.52;
        const spreadX = (side * (76 + 34 * Math.min(1, E)) + ux * 58) * s;
        vxInit = Math.max(-175 * s, Math.min(175 * s, inwardX + spreadX));
        vyInit = -(265 + 78 * upFactor + 28 * Math.min(1.0, E) + (side < 0 ? 18 : -12)) * s;
      } else {
        // Horizontal / downward swipe -> natural ballistic part & clean fall off bottom!
        const rawVx = perpX * side * sep + ux * along;
        const rawVy = perpY * side * sep + uy * along - (20 + 28 * Math.min(1.0, E)) * s;
        vxInit = Math.max(-230 * s, Math.min(230 * s, rawVx));
        vyInit = Math.max(-195 * s, Math.min(220 * s, rawVy));
      }

      this.halves.push({
        key: choppedKey,
        depth: 1,
        clipPlanes: [{ ang: 0, offset: offsetNorm, side }],
        x: chopX + perpX * pivotLocalY,
        y: chopY + perpY * pivotLocalY,
        r: this.fruitR,
        vx: vxInit,
        vy: vyInit,
        z: (4 + 10 * E) * s,
        vz: (isUpwardLaunch ? 145 : (48 + 160 * E)) * Math.pow(invMass, 0.45) * s,
        cutAngle,
        baseRot,
        offsetNorm,
        chordRatio,
        pivotLocalX: 0,
        pivotLocalY,
        side,
        rot: 0,
        vrot,
        openProg: 0,
        openRate: 1 / (0.36 - 0.12 * Math.min(1.0, E)),
        juggled: isUpwardLaunch,
        immuneTimer: 0.16,
        kissed: false,
        age: 0,
      });

      if (isUpwardLaunch) {
        this.engine.spawnDripTrail(chopX, chopY, vxInit, vyInit * 0.72, fruit, 4, s);
      }
    }

    if (isUpwardLaunch && this.engine.audio) {
      this.engine.audio.playUpwardScoop(this.engine.panForX(chopX));
    }

    this.engine.triggerMacroChop(cutMidX, cutMidY, seg.vx || seg.dx, seg.vy || seg.dy, fruit, {
      scale: s,
      speed,
      offsetNorm,
      curveRate,
    });

    // Count toggle fruit toward current continuous swipe (if swipe ALSO hit mid-air pieces, upgrades to DOUBLE/TRIPLE/QUAD/PENTA COMBO!)
    const tier = this._awardSwipeCombo(cutMidX, cutMidY, fruit, cutAngle, false);

    if (this.onChopTelemetry) {
      this.onChopTelemetry({
        fruit: tier
          ? `${tier.label} (+${tier.points.toLocaleString()}) · ${fruit.label}`
          : (isUpwardLaunch ? `↑ Upward Launch · ${fruit.label}` : fruit.label),
        speed: Math.round(speed),
        angleDeg: Math.round((cutAngle * 180) / Math.PI),
        offsetPct: Math.round(offsetNorm * 100),
        splitRatio: tier
          ? `${this.strokeHits} in one swipe · total ${this.totalScore.toLocaleString()} pts`
          : (isUpwardLaunch ? 'slice mid-air for COMBO!' : `${Math.round(Math.max(massNeg, massPos) * 100)}/${Math.round(Math.min(massNeg, massPos) * 100)}`),
        curveRate: Number(curveRate.toFixed(1)),
      });
    }

    this.isOn = !this.isOn;
    this.cycleIndex = (this.cycleIndex + 1) % FRUIT_CYCLE.length;
    this.knobTargetX = this.cx + (this.isOn ? this.slotOffset : -this.slotOffset);
    this.knobX = this.knobTargetX;
    this.knobTargetRot = (this.engine.rand() - 0.5) * 0.28;
    this.knobEntry = 0;
    this.knobDelay = 0.22;
    this.cooldown = 0.44;
    this.labelAlpha = -0.35;

    this.phase = 1;
    this.phaseTimer = 0;
    return true;
  }

  step(dt) {
    const simDt = this.engine.step(dt);
    const h = Math.min(0.033, Math.max(0.001, dt));
    const s = this.scale;

    if (this.cooldown > 0) this.cooldown = Math.max(0, this.cooldown - h);
    if (this.scoreVisTimer > 0) this.scoreVisTimer = Math.max(0, this.scoreVisTimer - h);
    if (this.scorePulse > 0) this.scorePulse = Math.max(0, this.scorePulse - h * 4.2);

    if (this.phase > 0) {
      this.phaseTimer += h;
      if (this.phase === 1 && this.phaseTimer > 0.14) this.phase = 2;
      else if (this.phase === 2 && this.phaseTimer > 0.78) this.phase = 3;
      else if (this.phase === 3 && this.phaseTimer > 3.6) this.phase = 0;
    }

    this.labelAlpha = Math.min(1, this.labelAlpha + h * 2.8);

    if (this.knobDelay > 0) {
      this.knobDelay = Math.max(0, this.knobDelay - simDt);
      if (this.knobDelay <= 0 && this.engine.audio) {
        this.engine.audio.playCeramicSettle(this.engine.panForX(this.knobTargetX));
      }
    } else if (this.knobEntry < 1) {
      this.knobEntry = Math.min(1, this.knobEntry + simDt * 1.95);
    }

    // Smooth continuous ballistic gravity — pieces stay 100% solid until falling completely off-screen!
    const gravY = 560 * s;
    const gravZ = 680 * s;
    for (let i = this.halves.length - 1; i >= 0; i--) {
      const fh = this.halves[i];
      fh.age += simDt;
      if (fh.immuneTimer > 0) fh.immuneTimer = Math.max(0, fh.immuneTimer - simDt);

      const dragX = Math.exp(-0.55 * simDt);
      fh.vx *= dragX;
      fh.vy += gravY * simDt;
      fh.x += fh.vx * simDt;
      fh.y += fh.vy * simDt;

      fh.vz -= gravZ * simDt;
      fh.z += fh.vz * simDt;
      if (fh.z <= 0) {
        fh.z = 0;
        if (fh.vz < -28 * s) {
          const impactSpd = Math.abs(fh.vz);
          fh.vz = impactSpd * 0.24;
          if (!fh.kissed && fh.x > 16 && fh.x < this.width - 16 && fh.y > 16 && fh.y < this.height - 16) {
            fh.kissed = true;
            const strength = Math.min(1, impactSpd / (190 * s));
            this.engine.spawnContactKiss(fh.x, fh.y, fh.r * fh.chordRatio, STUDIO_FRUITS[fh.key], strength);
            if (this.engine.audio) {
              this.engine.audio.playWetKiss(this.engine.panForX(fh.x), strength);
            }
          }
        } else {
          fh.vz = 0;
        }
      }

      fh.vrot *= Math.exp(-0.42 * simDt);
      fh.rot += fh.vrot * simDt;
      fh.openProg = Math.min(1, fh.openProg + simDt * fh.openRate);

      const fellBottom = fh.y > this.height + fh.r * 1.95;
      const fellSides = fh.x < -fh.r * 2.2 || fh.x > this.width + fh.r * 2.2;
      if (fellBottom || fellSides) {
        this.halves.splice(i, 1);
      }
    }
  }

  _drawPorcelainTrack(ctx) {
    const s = this.scale;
    const x = this.cx - this.trackW * 0.5;
    const y = this.cy - this.trackH * 0.5;
    const r = this.trackH * 0.5;

    ctx.save();
    ctx.shadowColor = 'rgba(72, 56, 40, 0.14)';
    ctx.shadowBlur = 22 * s;
    ctx.shadowOffsetX = 4 * s;
    ctx.shadowOffsetY = 10 * s;
    roundRectPath(ctx, x, y, this.trackW, this.trackH, r);
    const outerG = ctx.createLinearGradient(x, y, x, y + this.trackH);
    outerG.addColorStop(0.0, 'rgba(255, 253, 250, 0.94)');
    outerG.addColorStop(0.5, 'rgba(246, 241, 233, 0.90)');
    outerG.addColorStop(1.0, 'rgba(232, 224, 212, 0.92)');
    ctx.fillStyle = outerG;
    ctx.fill();
    ctx.restore();

    roundRectPath(ctx, x, y, this.trackW, this.trackH, r);
    ctx.strokeStyle = 'rgba(148, 132, 114, 0.24)';
    ctx.lineWidth = 1.2 * s;
    ctx.stroke();

    const inset = 6.5 * s;
    const ix = x + inset, iy = y + inset;
    const iw = this.trackW - inset * 2, ih = this.trackH - inset * 2;
    const ir = ih * 0.5;

    roundRectPath(ctx, ix, iy, iw, ih, ir);
    const wellG = ctx.createLinearGradient(ix, iy, ix, iy + ih);
    wellG.addColorStop(0.0, 'rgba(218, 208, 194, 0.62)');
    wellG.addColorStop(0.35, 'rgba(238, 232, 222, 0.55)');
    wellG.addColorStop(1.0, 'rgba(252, 249, 244, 0.85)');
    ctx.fillStyle = wellG;
    ctx.fill();

    ctx.save();
    roundRectPath(ctx, ix, iy, iw, ih, ir);
    ctx.clip();
    roundRectPath(ctx, ix + 1 * s, iy + 2.5 * s, iw - 2 * s, ih, ir);
    ctx.strokeStyle = 'rgba(116, 98, 78, 0.18)';
    ctx.lineWidth = 3 * s;
    ctx.stroke();
    ctx.restore();

    roundRectPath(ctx, ix, iy, iw, ih, ir);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.72)';
    ctx.lineWidth = 1.0 * s;
    ctx.stroke();

    // Smoothly cross-faded debossed Swiss ON / OFF typography
    ctx.save();
    ctx.globalAlpha = easeOutCubic(this.labelAlpha);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `400 ${Math.round(23 * s)}px -apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", system-ui, sans-serif`;
    const labelX = this.cx + (this.isOn ? -58 * s : 58 * s);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.fillText(this.isOn ? 'ON' : 'OFF', labelX, this.cy + 1.2 * s);
    ctx.fillStyle = 'rgba(118, 106, 94, 0.68)';
    ctx.fillText(this.isOn ? 'ON' : 'OFF', labelX, this.cy);
    ctx.restore();
  }

  render() {
    const ctx = this.engine.beginRender();
    const s = this.scale;

    this._drawPorcelainTrack(ctx);

    // Smoothly gliding & physically solid incoming fruit (easeOutQuint roll-in, fast solid alpha -> ZERO ghost look!)
    if (this.knobDelay <= 0 && this.knobEntry > 0.001) {
      const e = easeOutQuint(this.knobEntry);
      const slideX = (this.isOn ? -32 : 32) * s * (1 - e);
      const sc = 0.72 + 0.28 * e;
      const rot = this.knobTargetRot + (this.isOn ? -0.34 : 0.34) * (1 - e);
      const aU = Math.min(1, this.knobEntry / 0.24);
      const alpha = aU * aU * (3 - 2 * aU);
      ctx.save();
      ctx.translate(this.knobTargetX + slideX, this.cy);
      ctx.scale(sc, sc);
      drawPhotoWholeFruit(ctx, 0, 0, this.fruitR, this.currentFruitKey, rot, alpha);
      ctx.restore();
    }

    // 100% solid fruit halves & recursively quartered wedges (ZERO fade-out — they physically fall off-screen!)
    const sortedHalves = this.halves.length > 1
      ? [...this.halves].sort((a, b) => a.z - b.z)
      : this.halves;
    for (const fh of sortedHalves) {
      if (fh.depth === 1) {
        drawPhotoSlicedHalf3D(
          ctx, fh.x, fh.y, fh.r, fh.key, fh.cutAngle, fh.side, fh.rot,
          1.0, fh.openProg, fh.baseRot, fh.offsetNorm, fh.z, fh.pivotLocalY
        );
      } else {
        drawPhotoSlicedChunk3D(
          ctx, fh.x, fh.y, fh.r, fh.key, fh.rot, fh.clipPlanes,
          fh.z, fh.pivotLocalX, fh.pivotLocalY
        );
      }
    }

    // Whisper-clean editorial porcelain PTS badge (appears ONLY when the combo Easter egg is active!)
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

    // Editorial 4-beat footer
    const phases = ['01 POISED', '02 CLEAVE', '03 SPLAT', '04 SETTLED'];
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `500 ${Math.round(10 * s)}px -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", system-ui, sans-serif`;
    const yFoot = this.height - 22 * s;
    const spacing = 110 * s;
    const x0 = this.width * 0.5 - spacing * 1.5;
    phases.forEach((lbl, idx) => {
      ctx.fillStyle = idx === this.phase ? 'rgba(34, 28, 24, 0.78)' : 'rgba(62, 54, 46, 0.28)';
      ctx.fillText(lbl, x0 + idx * spacing, yFoot);
    });
    ctx.restore();

    this.engine.endRender();
  }
}


class FruitToggleElement extends FruitElement {
  static formAssociated = true;
  static observedAttributes = ['checked', 'fruit', 'label', 'name', 'value', 'disabled'];

  constructor() {
    super();
    this._checked = false;
    this._downPt = null;
    this._moved = 0;
    this._choppedOnStroke = false;
  }

  _createDemo(mount, opts) {
    const demo = new ChopToggle(mount, opts);
    this._lastOn = demo.isOn;
    return demo;
  }

  _syncFromAttrs() {
    this.setAttribute('role', 'switch');
    this.setAttribute('aria-label', this.getAttribute('label') || 'Chop toggle');
    const wantFruit = this.getAttribute('fruit');
    if (wantFruit && this._demo) this._demo.setFruit(wantFruit);
    const wantOn = this.hasAttribute('checked');
    this._applyChecked(wantOn, false);
  }

  attributeChangedCallback(name, _oldVal, newVal) {
    if (!this._demo) return;
    if (name === 'label') this.setAttribute('aria-label', newVal || 'Chop toggle');
    else if (name === 'fruit' && newVal) this._demo.setFruit(newVal);
    else if (name === 'checked') this._applyChecked(newVal !== null, false);
    else if (name === 'value') this._syncForm();
  }

  _applyChecked(on, notify = false) {
    this._checked = Boolean(on);
    if (this._demo) {
      this._demo.isOn = this._checked;
      this._demo.knobTargetX = this._checked ? this._demo.cx + this._demo.slotOffset : this._demo.cx - this._demo.slotOffset;
      this._demo.knobX = this._demo.knobTargetX;
      this._demo.knobTargetRot = this._checked ? 0.06 : -0.05;
      this._demo.knobRot = this._demo.knobTargetRot;
      this._lastOn = this._checked;
    }
    this.setAttribute('aria-checked', String(this._checked));
    this._syncForm();
    if (notify) this.emit('change', { checked: this._checked, fruit: this.fruit, score: this.score });
  }

  _syncForm() {
    if (this._internals?.setFormValue) {
      this._internals.setFormValue(this._checked ? (this.getAttribute('value') || 'on') : null);
    }
  }

  _checkChanged() {
    if (!this._demo) return;
    if (this._demo.isOn !== this._lastOn) {
      this._lastOn = this._demo.isOn;
      this._checked = this._demo.isOn;
      this._choppedOnStroke = true;
      this.setAttribute('aria-checked', String(this._checked));
      this._syncForm();
      this.emit('change', { checked: this._checked, fruit: this.fruit, score: this.score });
    }
  }

  _syntheticChop() {
    const d = this._demo;
    if (!d) return;
    d.cooldown = 0;
    d.knobEntry = 1;
    d.knobDelay = 0;
    const x = d.knobX, y = d.cy, r = d.fruitR * 1.45;
    d.pointerDown(x - r * 0.85, y - r * 0.95);
    d.pointerMove(x, y);
    d.pointerMove(x + r * 0.85, y + r * 0.95);
    d.pointerUp();
    this._checkChanged();
  }

  _onPointerDown(p) {
    this._downPt = p;
    this._moved = 0;
    this._choppedOnStroke = false;
  }

  _onPointerMove(p) {
    if (this._downPt) this._moved = Math.max(this._moved, Math.hypot(p.x - this._downPt.x, p.y - this._downPt.y));
    this._checkChanged();
  }

  _onPointerUp() {
    this._checkChanged();
    const d = this._demo;
    if (d && this._downPt && !this._choppedOnStroke && this._moved < 18 * d.scale) {
      if (Math.abs(this._downPt.x - d.cx) <= d.trackW * 0.56 && Math.abs(this._downPt.y - d.cy) <= d.trackH * 0.62) {
        this._syntheticChop();
      }
    }
    this._downPt = null;
  }

  _onKeyDown(e) {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      this._syntheticChop();
    }
  }

  get checked() { return this._demo ? this._demo.isOn : this.hasAttribute('checked'); }
  set checked(v) {
    const on = Boolean(v);
    if (on !== this.hasAttribute('checked')) {
      if (on) this.setAttribute('checked', '');
      else this.removeAttribute('checked');
    }
    this._applyChecked(on, false);
  }

  get fruit() { return this._demo ? this._demo.currentFruitKey : (this.getAttribute('fruit') || 'bloodOrange'); }
  set fruit(k) {
    if (k) this.setAttribute('fruit', k);
    this._demo?.setFruit(k);
  }

  get value() { return this.getAttribute('value') || 'on'; }
  set value(v) { this.setAttribute('value', String(v)); this._syncForm(); }

  toggle() { this._syntheticChop(); }
}

customElements.define('fruit-toggle', FruitToggleElement);
