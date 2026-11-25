// Fruit Studio UI — Piece 02: Berry Stepper Rail (5-Step Segmented Control + Multi-Piece Swipe Combos!)
// Dieter Rams / Apple horizontal recessed matte-white porcelain rail with 5 sculpted concave dimples:
//   - Cradles 5 photorealistic macro Ripe Crimson Strawberries (0/5 -> 5/5)
//   - Sweep across 1..5 berries in ONE continuous stroke: each cleaved well reveals a glistening cut strawberry heart
//     ringed by translucent ruby viscous nectar while launching its severed cap with true swipe physics!
//   - Downward/horizontal swipes drop caps cleanly off the bottom (zero fade-out);
//     UPWARD swipes launch ONLY the swiped berries' caps cleanly upward into upper-frame hang-time!
//   - Keep finger down across multiple berries & mid-air caps for Double / Triple / Quad / Penta / Hexa / Octa COMBO! + points

function easeOutCubic(t) { const u = Math.max(0, Math.min(1, t)); return 1 - Math.pow(1 - u, 3); }
function easeOutQuint(t) { const u = Math.max(0, Math.min(1, t)); return 1 - Math.pow(1 - u, 5); }

class BerryStepper {
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
    this.cy = this.height * 0.52;
    this.slotCount = 5;
    this.slotSpacing = 82 * s;
    this.railW = 446 * s;
    this.railH = 104 * s;
    this.dimpleR = 36 * s;
    this.fruitR = 31 * s;

    this.fruitKey = opts.fruitKey || 'strawberry';
    this.slots = [];
    this._initSlots(false);

    this.pieces = []; // 100% solid soaring severed berry caps & recursively diced chunks (NEVER fade out!)
    this.autoRefill = Boolean(opts.autoRefill);
    this.refillTimer = -1;
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

  _initSlots(animated = true) {
    const startX = this.cx - ((this.slotCount - 1) * 0.5) * this.slotSpacing;
    this.slots = [];
    for (let i = 0; i < this.slotCount; i++) {
      this.slots.push({
        idx: i,
        x: startX + i * this.slotSpacing,
        y: this.cy,
        sliced: false,
        entryProg: animated ? 0 : 1,
        entryDelay: animated ? i * 0.075 : 0,
        cutAnim: 0,       // 0..1 crisp tactile settle squash when sliced heart reveals
        tilt: (this.engine.rand() - 0.5) * 0.08,
      });
    }
    this.refillTimer = -1;
  }

  get activeCount() {
    let n = 0;
    for (const sl of this.slots) if (sl.sliced) n++;
    return n;
  }

  setFruit(key) {
    if (STUDIO_FRUITS[key]) {
      this.fruitKey = key;
      this._initSlots(true);
    }
  }

  refillRail() {
    this._initSlots(true);
    this.phase = 0;
  }

  clearSurface() {
    this.engine.clearCeramic();
    this.totalScore = 0;
    this.scoreVisTimer = 0;
    this._initSlots(true);
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
    // 1. Mid-air continuous slicing across airborne caps & sub-chunks -> Double / Triple / Quad / Penta / Hexa COMBO!
    this._checkMidAirReslice(seg);
    // 2. Sweep cleave across all intact berries along the rail!
    this._checkRailChops(seg);
  }

  pointerUp() {
    this.engine.endStroke();
  }

  _awardSwipeCombo(hitX, hitY, fruit, cutAngle, isMidAir) {
    this.strokeHits += 1;
    // Trigger named COMBO! & superlinear points on any mid-air slice OR whenever >= 2 berries/pieces are sliced in one swipe!
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

      const hitR = pc.r * (pc.depth === 1 ? 1.05 : pc.depth === 2 ? 0.85 : 0.72);
      const cut = computeCircleCutGeometry(seg.x1, seg.y1, seg.x2, seg.y2, pc.x, pc.y, hitR, hitR);
      if (!cut) continue;

      const fruit = STUDIO_FRUITS[pc.key];
      const worldRot = pc.rot;
      const relAng = cut.cutAngle - worldRot;
      const px = pc.pivotLocalX || 0;
      const py = pc.pivotLocalY || 0;
      const nx = -Math.sin(relAng), ny = Math.cos(relAng);
      const centroidProj = nx * px + ny * py;
      const planeOffset = Math.max(-0.46, Math.min(0.46, (centroidProj + cut.offsetNorm * pc.r * 0.18) / pc.r));

      const basePlanes = pc.clipPlanes && pc.clipPlanes.length > 0
        ? pc.clipPlanes
        : [];

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
        const centerPullX = (this.cx - pc.x) * 0.24;
        const rawVx = pc.vx * 0.26 + centerPullX + cut.perpX * newSide * sep + cut.ux * along;
        const vx = Math.max(-200 * s, Math.min(200 * s, rawVx));
        const topGuard = Math.max(0.32, Math.min(1.0, (pc.y - 36 * s) / (118 * s)));
        const popVy = -(205 + 62 * Math.min(1.0, E) + this.engine.rand() * 38) * topGuard * s + cut.perpY * newSide * sep * 0.24;

        newlySpawned.push({
          kind: 'chunk',
          key: pc.key,
          depth: pc.depth + 1,
          clipPlanes: childPlanes,
          x: pc.x + worldShiftX,
          y: pc.y + worldShiftY,
          r: pc.r,
          vx,
          vy: Math.max(-295 * s, Math.min(-85 * s, popVy)),
          z: Math.max(16 * s, pc.z + 8 * s),
          vz: (95 + 88 * Math.min(1.1, E)) * s,
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

  _checkRailChops(seg) {
    const s = this.scale;
    const speed = seg.speed || 950;
    const curveRate = seg.curveRate || 0;
    const E = Math.max(0.10, Math.min(1.65, (speed - 180) / 1450));
    const fruit = STUDIO_FRUITS[this.fruitKey];

    for (const sl of this.slots) {
      if (sl.sliced || sl.entryProg < 0.65) continue;
      const cut = computeCircleCutGeometry(
        seg.x1, seg.y1, seg.x2, seg.y2,
        sl.x, sl.y, this.fruitR, this.fruitR * 1.12
      );
      if (!cut) continue;

      sl.sliced = true;
      sl.cutAnim = 0;

      const { ux, uy, perpX, perpY, cutAngle, offsetNorm } = cut;
      // REAL SWIPE PHYSICS: Swiping UPWARD launches ONLY this swiped berry's severed cap soaring cleanly upward!
      // Downward / horizontal swipes send the cap parting smoothly off the bottom of the screen!
      const isUpwardLaunch = uy < -0.22;
      const upFactor = isUpwardLaunch ? Math.min(1.0, (-uy - 0.18) / 0.58) : 0;

      let vxInit, vyInit;
      if (isUpwardLaunch) {
        const inwardX = (this.cx - sl.x) * 0.32;
        const spreadX = (ux * (52 + 34 * Math.min(1, E)) + (this.engine.rand() - 0.5) * 28) * s;
        vxInit = Math.max(-165 * s, Math.min(165 * s, inwardX + spreadX));
        vyInit = -(258 + 64 * upFactor + 24 * Math.min(1.0, E) + this.engine.rand() * 18) * s;
      } else {
        const rawVx = (ux * (55 + 115 * E) + perpX * (this.engine.rand() > 0.5 ? 1 : -1) * (45 + 65 * E)) * s;
        const rawVy = (uy * (55 + 115 * E) - (42 + 45 * Math.min(1.0, E))) * s;
        vxInit = Math.max(-220 * s, Math.min(220 * s, rawVx));
        vyInit = Math.max(-185 * s, Math.min(210 * s, rawVy));
      }

      // Spawn the glossy severed strawberry cap (solid studio cross-section cap that can be diced mid-air!)
      this.pieces.push({
        kind: 'cap',
        key: this.fruitKey,
        depth: 1,
        clipPlanes: [],
        x: sl.x,
        y: sl.y - 4 * s,
        r: this.fruitR * 0.94,
        vx: vxInit,
        vy: vyInit,
        z: (8 + 10 * E) * s,
        vz: (isUpwardLaunch ? 145 : (65 + 135 * E)) * s,
        pivotLocalX: 0,
        pivotLocalY: 0,
        rot: sl.tilt,
        vrot: (ux >= 0 ? 1 : -1) * (1.8 + 2.2 * E) + curveRate * 0.32,
        juggled: isUpwardLaunch,
        immuneTimer: 0.16,
        kissed: false,
        age: 0,
      });

      if (isUpwardLaunch) {
        this.engine.spawnDripTrail(sl.x, sl.y, vxInit, vyInit * 0.72, fruit, 4, s);
        if (this.engine.audio) this.engine.audio.playUpwardScoop(this.engine.panForX(sl.x));
      }

      // Rich cascading translucent ruby viscous splat blooming cleanly out of this concave dimple!
      this.engine.triggerMacroChop(sl.x, sl.y, seg.vx || seg.dx, seg.vy || seg.dy, fruit, {
        scale: s * 0.72,
        speed,
        offsetNorm: offsetNorm * 0.4,
        curveRate,
      });

      const tier = this._awardSwipeCombo(sl.x, sl.y, fruit, cutAngle, false);
      const count = this.activeCount;
      this.phase = 1;
      this.phaseTimer = 0;

      if (count === this.slotCount && this.autoRefill) {
        this.refillTimer = 1.65;
      }

      if (this.onChopTelemetry) {
        this.onChopTelemetry({
          fruit: tier
            ? `${tier.label} (+${tier.points.toLocaleString()}) · ${count}/5`
            : (isUpwardLaunch ? `↑ Launched · ${count}/5 ${fruit.label}` : `${fruit.label} · ${count}/5`),
          speed: Math.round(speed),
          angleDeg: Math.round((cutAngle * 180) / Math.PI),
          splitRatio: tier ? `${this.strokeHits} in one swipe · ${this.totalScore.toLocaleString()} pts` : `${count} / 5 active`,
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
      if (this.phase === 1 && this.phaseTimer > 0.14) this.phase = 2;
      else if (this.phase === 2 && this.phaseTimer > 0.75) this.phase = 3;
      else if (this.phase === 3 && this.phaseTimer > 3.2) this.phase = 0;
    }

    // Auto-refill gracefully after all 5 berries are cleaved & airborne combo finishes!
    if (this.refillTimer > 0) {
      if (this.pieces.length === 0) {
        this.refillTimer -= h;
      } else {
        this.refillTimer = Math.max(0.45, this.refillTimer - h * 0.35);
      }
      if (this.refillTimer <= 0) {
        this._initSlots(true);
      }
    }

    for (const sl of this.slots) {
      if (sl.entryDelay > 0) {
        sl.entryDelay = Math.max(0, sl.entryDelay - simDt);
        if (sl.entryDelay <= 0 && this.engine.audio && sl.idx === 0) {
          this.engine.audio.playCeramicSettle(0);
        }
      } else if (sl.entryProg < 1) {
        sl.entryProg = Math.min(1, sl.entryProg + simDt * 2.15);
      }
      if (sl.sliced && sl.cutAnim < 1) {
        sl.cutAnim = Math.min(1, sl.cutAnim + simDt * 4.2);
      }
    }

    // Continuous 2D ballistic gravity — severed caps & diced chunks stay 100% solid until falling off-screen!
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
      if (pc.z <= 0) {
        pc.z = 0;
        if (pc.vz < -28 * s) {
          const impactSpd = Math.abs(pc.vz);
          pc.vz = impactSpd * 0.24;
          if (!pc.kissed && pc.x > 16 && pc.x < this.width - 16 && pc.y > 16 && pc.y < this.height - 16) {
            pc.kissed = true;
            const strength = Math.min(1, impactSpd / (190 * s));
            this.engine.spawnContactKiss(pc.x, pc.y, pc.r * 0.72, STUDIO_FRUITS[pc.key], strength);
            if (this.engine.audio) this.engine.audio.playWetKiss(this.engine.panForX(pc.x), strength);
          }
        } else {
          pc.vz = 0;
        }
      }

      pc.vrot *= Math.exp(-0.42 * simDt);
      pc.rot += pc.vrot * simDt;

      const fellBottom = pc.y > this.height + pc.r * 2.1;
      const fellSides = pc.x < -pc.r * 2.4 || pc.x > this.width + pc.r * 2.4;
      if (fellBottom || fellSides) {
        this.pieces.splice(i, 1);
      }
    }
  }

  _drawPorcelainRail(ctx) {
    const s = this.scale;
    const x = this.cx - this.railW * 0.5;
    const y = this.cy - this.railH * 0.5;
    const rad = this.railH * 0.5;

    // 1. Sleek pill-shaped matte alabaster porcelain rail with soft gallery drop shadow
    ctx.save();
    ctx.shadowColor = 'rgba(72, 56, 40, 0.15)';
    ctx.shadowBlur = 22 * s;
    ctx.shadowOffsetX = 4 * s;
    ctx.shadowOffsetY = 10 * s;
    roundRectPath(ctx, x, y, this.railW, this.railH, rad);
    const outerG = ctx.createLinearGradient(x, y, x, y + this.railH);
    outerG.addColorStop(0.0, 'rgba(255, 253, 250, 0.96)');
    outerG.addColorStop(0.55, 'rgba(246, 241, 233, 0.93)');
    outerG.addColorStop(1.0, 'rgba(230, 222, 210, 0.95)');
    ctx.fillStyle = outerG;
    ctx.fill();
    ctx.restore();

    roundRectPath(ctx, x, y, this.railW, this.railH, rad);
    ctx.strokeStyle = 'rgba(138, 122, 104, 0.26)';
    ctx.lineWidth = 1.2 * s;
    ctx.stroke();

    roundRectPath(ctx, x + 1.5 * s, y + 1.5 * s, this.railW - 3 * s, this.railH - 3 * s, rad - 1.5 * s);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.78)';
    ctx.lineWidth = 1.0 * s;
    ctx.stroke();

    // 2. Five sculpted concave circular porcelain dimples (with warm translucent ruby nectar glow when cleaved!)
    const fruit = STUDIO_FRUITS[this.fruitKey];
    for (const sl of this.slots) {
      const dr = this.dimpleR;
      ctx.save();
      ctx.beginPath();
      ctx.arc(sl.x, sl.y, dr, 0, Math.PI * 2);
      const wellG = ctx.createRadialGradient(sl.x + dr * 0.28, sl.y + dr * 0.30, dr * 0.1, sl.x, sl.y, dr);
      wellG.addColorStop(0.0, 'rgba(252, 249, 244, 0.92)');
      wellG.addColorStop(0.70, 'rgba(235, 228, 218, 0.76)');
      wellG.addColorStop(1.0, 'rgba(210, 200, 186, 0.76)');
      ctx.fillStyle = wellG;
      ctx.fill();

      ctx.clip();
      ctx.beginPath();
      ctx.arc(sl.x + 1.6 * s, sl.y + 3.0 * s, dr, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(112, 94, 74, 0.20)';
      ctx.lineWidth = 3.5 * s;
      ctx.stroke();

      // Delicate translucent pooled fruit nectar lining the concave dimple once sliced!
      if (sl.sliced) {
        const poolA = easeOutCubic(sl.cutAnim) * 0.36;
        const ng = ctx.createRadialGradient(sl.x, sl.y, dr * 0.15, sl.x, sl.y, dr * 0.98);
        ng.addColorStop(0.0, `${fruit.liquidMid}AA`);
        ng.addColorStop(0.72, `${fruit.liquidMid}66`);
        ng.addColorStop(1.0, `${fruit.liquidLight}00`);
        ctx.globalAlpha = poolA;
        ctx.fillStyle = ng;
        ctx.beginPath();
        ctx.arc(sl.x, sl.y, dr * 0.98, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      ctx.beginPath();
      ctx.arc(sl.x, sl.y, dr, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.72)';
      ctx.lineWidth = 0.95 * s;
      ctx.stroke();
    }
  }

  _drawBerryCap(ctx, pc) {
    const map = getLoadedFruits();
    if (!map || !map[pc.key]) return;
    const img = map[pc.key].cut;
    const drawR = pc.r * 1.136;
    const zLift = Math.max(0, pc.z);
    const zScale = 1 + Math.min(0.24, zLift / 380);

    ctx.save();
    ctx.translate(pc.x, pc.y);

    // Soft photographic lift-off shadow
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

    this._drawPorcelainRail(ctx);

    // Draw each of the 5 berries inside their porcelain dimples (whole if intact, glistening cut heart if sliced!)
    for (const sl of this.slots) {
      if (sl.entryDelay > 0 || sl.entryProg <= 0.001) continue;
      const e = easeOutQuint(sl.entryProg);
      const sc = 0.72 + 0.28 * e;
      const aU = Math.min(1, sl.entryProg / 0.24);
      const alpha = aU * aU * (3 - 2 * aU);

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(sl.x, sl.y);
      if (!sl.sliced) {
        const rot = sl.tilt + 0.30 * (1 - e);
        ctx.scale(sc, sc);
        drawPhotoWholeFruit(ctx, 0, 0, this.fruitR, this.fruitKey, rot, alpha);
      } else if (map && map[this.fruitKey]) {
        // Tactile settle pulse as glistening cut strawberry cross-section reveals cleanly in its dimple!
        const pulse = 1.0 + Math.sin(Math.min(1, sl.cutAnim) * Math.PI) * 0.07;
        const drawR = this.fruitR * 1.10 * pulse;
        ctx.fillStyle = 'rgba(68, 42, 32, 0.16)';
        ctx.beginPath();
        ctx.ellipse(2 * s, 4 * s, this.fruitR * 0.82, this.fruitR * 0.88, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.rotate(sl.tilt * 0.7);
        ctx.drawImage(map[this.fruitKey].cut, -drawR, -drawR, drawR * 2, drawR * 2);
      }
      ctx.restore();
    }

    // 100% solid airborne severed caps & recursively diced berry wedges (NEVER fade out!)
    const sorted = this.pieces.length > 1 ? [...this.pieces].sort((a, b) => a.z - b.z) : this.pieces;
    for (const pc of sorted) {
      if (pc.kind === 'cap') {
        this._drawBerryCap(ctx, pc);
      } else {
        drawPhotoSlicedChunk3D(
          ctx, pc.x, pc.y, pc.r, pc.key, pc.rot, pc.clipPlanes, pc.z, pc.pivotLocalX, pc.pivotLocalY
        );
      }
    }

    // Whisper-clean editorial porcelain PTS badge (appears ONLY when combo Easter egg is active!)
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

    // Editorial 4-beat footer showing live segmented count (0/5 .. 5/5)
    const active = this.activeCount;
    const phases = [`01 POISED · ${active}/5`, '02 SWEEP CLEAVE', '03 CASCADE SPLAT', `04 SETTLED · ${active}/5`];
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `500 ${Math.round(10 * s)}px -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", system-ui, sans-serif`;
    const yFoot = this.height - 22 * s;
    const spacing = 128 * s;
    const x0 = this.width * 0.5 - spacing * 1.5;
    phases.forEach((lbl, idx) => {
      ctx.fillStyle = idx === this.phase ? 'rgba(34, 28, 24, 0.78)' : 'rgba(62, 54, 46, 0.28)';
      ctx.fillText(lbl, x0 + idx * spacing, yFoot);
    });
    ctx.restore();

    this.engine.endRender();
  }
}


class FruitStepperElement extends FruitElement {
  static formAssociated = true;
  static observedAttributes = ['value', 'label', 'name', 'auto-refill', 'disabled'];

  constructor() {
    super();
    this._lastVal = 0;
    this._downPt = null;
    this._moved = 0;
    this._changedOnStroke = false;
  }

  _createDemo(mount, opts) {
    return new BerryStepper(mount, { ...opts, autoRefill: this.hasAttribute('auto-refill') });
  }

  _syncFromAttrs() {
    this.setAttribute('role', 'slider');
    this.setAttribute('aria-valuemin', '0');
    this.setAttribute('aria-valuemax', '5');
    this.setAttribute('aria-label', this.getAttribute('label') || 'Berry stepper');
    if (this._demo) this._demo.autoRefill = this.hasAttribute('auto-refill');
    const v = Math.max(0, Math.min(5, Math.round(Number(this.getAttribute('value') || 0)) || 0));
    this._setQuiet(v);
  }

  attributeChangedCallback(name, _oldVal, newVal) {
    if (!this._demo) return;
    if (name === 'label') this.setAttribute('aria-label', newVal || 'Berry stepper');
    else if (name === 'auto-refill') this._demo.autoRefill = newVal !== null;
    else if (name === 'value') {
      const v = Math.max(0, Math.min(5, Math.round(Number(newVal || 0)) || 0));
      if (v !== this._demo.activeCount) this._setQuiet(v);
    }
  }

  _setQuiet(v) {
    if (this._demo) {
      for (let i = 0; i < this._demo.slots.length; i++) {
        const sl = this._demo.slots[i];
        sl.sliced = i < v;
        sl.cutAnim = sl.sliced ? 1 : 0;
        sl.entryProg = 1;
        sl.entryDelay = 0;
      }
      this._demo.refillTimer = -1;
    }
    this._lastVal = v;
    this.setAttribute('aria-valuenow', String(v));
    if (this._internals?.setFormValue) this._internals.setFormValue(String(v));
  }

  _syncValue(fireInput, fireChange) {
    if (!this._demo) return;
    const v = this._demo.activeCount;
    if (v !== this._lastVal) {
      this._lastVal = v;
      this._changedOnStroke = true;
      this.setAttribute('aria-valuenow', String(v));
      if (this._internals?.setFormValue) this._internals.setFormValue(String(v));
      const detail = { value: v, score: this.score };
      if (fireInput) this.emit('input', detail);
      if (fireChange) this.emit('change', detail);
    }
  }

  _chopSlot(idx) {
    const d = this._demo;
    if (!d) return;
    const sl = d.slots[idx];
    if (!sl || sl.sliced) return;
    sl.entryProg = 1;
    sl.entryDelay = 0;
    const r = d.fruitR * 1.35;
    d.pointerDown(sl.x - r * 0.85, sl.y - r * 0.9);
    d.pointerMove(sl.x, sl.y);
    d.pointerMove(sl.x + r * 0.85, sl.y + r * 0.9);
    d.pointerUp();
    this._syncValue(true, true);
  }

  _restoreSlot(idx) {
    const d = this._demo;
    if (!d) return;
    const sl = d.slots[idx];
    if (!sl || !sl.sliced) return;
    sl.sliced = false;
    sl.cutAnim = 0;
    sl.entryProg = 0;
    sl.entryDelay = 0.02;
    d.refillTimer = -1;
    d.engine.audio?.playBezelTick(false, d.engine.panForX(sl.x));
    this._syncValue(true, true);
  }

  _onPointerDown(p) {
    this._downPt = p;
    this._moved = 0;
    this._changedOnStroke = false;
  }

  _onPointerMove(p) {
    if (this._downPt) this._moved = Math.max(this._moved, Math.hypot(p.x - this._downPt.x, p.y - this._downPt.y));
    this._syncValue(true, false);
  }

  _onPointerUp() {
    const d = this._demo;
    if (this._changedOnStroke) {
      this.emit('change', { value: this._lastVal, score: this.score });
    } else if (d && this._downPt && this._moved < 16 * d.scale) {
      for (const sl of d.slots) {
        if (Math.hypot(this._downPt.x - sl.x, this._downPt.y - sl.y) <= d.dimpleR * 1.05) {
          if (sl.sliced) this._restoreSlot(sl.idx);
          else this._chopSlot(sl.idx);
          break;
        }
      }
    }
    this._downPt = null;
  }

  _afterStep() {
    this._syncValue(true, true);
  }

  _afterClear() {
    this._syncValue(true, true);
  }

  _onKeyDown(e) {
    const d = this._demo;
    if (!d) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = d.slots.find((sl) => !sl.sliced);
      if (next) this._chopSlot(next.idx);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      for (let i = d.slots.length - 1; i >= 0; i--) {
        if (d.slots[i].sliced) { this._restoreSlot(i); break; }
      }
    } else if (e.key === 'Home') {
      e.preventDefault();
      this.refill();
    } else if (e.key === 'End') {
      e.preventDefault();
      for (const sl of d.slots) if (!sl.sliced) this._chopSlot(sl.idx);
    }
  }

  get value() { return this._demo ? this._demo.activeCount : (Number(this.getAttribute('value')) || 0); }
  set value(v) {
    const clamped = Math.max(0, Math.min(5, Math.round(Number(v) || 0)));
    this._setQuiet(clamped);
  }

  refill() {
    this._demo?.refillRail();
    this._syncValue(true, true);
  }
}

customElements.define('fruit-stepper', FruitStepperElement);
