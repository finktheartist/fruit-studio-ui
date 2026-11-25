// Fruit Studio Berry stepper: A five-step segmented stepper rail holding five macro-photographed strawberries.
// Sweep across one to five berries in a single stroke to cleave them, reveal their glossy ruby hearts and splash
// crimson nectar across the porcelain; swipe upward to launch caps into mid-air combos.
//
// One file, no dependencies. Load it with a script tag and use <fruit-stepper>. then use <fruit-stepper value="0"
// label="Intensity"></fruit-stepper>. Read el.value (0–5); it fires input while sweeping and change when the
// stroke ends. Works in forms with a name.
//
// Built by tools/build.mjs in github.com/finktheartist/fruit-studio-ui: the shared core (WebGL2 viscous nectar
// fluid optics, macro 3D
// fruit physics, Web Audio foley and FruitElement base), the photographed fruit WebP sprites this control uses,
// and the custom element.
// >>> fruit studio core (core.js; edit that, not this)
// Fruit Studio UI — Shared Core (WebGL2 Viscous Nectar Optics, Macro Fruit Physics, Web Audio Foley & Base Element)
if (!window.FruitStudio) {
(() => {
'use strict';

// Fruit Studio UI v5 — Full-Resolution WebGL2 Organic Viscous Fruit-Nectar Splat & Optical Engine
// Calibrated directly against real macro studio viscous fruit-splat photography (Concept 04):
//   - Physical Beer-Lambert exponential absorption (luminous translucent thin edges -> rich deep syrup core,
//     ZERO opaque acrylic paint, ZERO muddy olive-brown on golden yuzu!)
//   - Scale-accurate fluid physics via per-primitive `beadness` channel:
//       * `beadness = 0` (pools & curving viscous tongues): domain-warped organic stone-ragged scalloped edges,
//         flat glossy viscous meniscus plateau, crisp wet capillary rim, gentle translucent stone grain beneath
//       * `beadness = 1` (millimeter satellite beads): surface-tension plump 3D round/oval domes,
//         bright transmitted lens caustic, crisp pinpoint studio specular glint & warm tinted micro-shadow
//   - Full 1280x720 fluid thickness MRTs + pure-GPU zero-readback premultiplied compositing

const FIELD_VS_PX = `#version 300 es
precision highp float;

uniform vec2 uRes;

in vec2 aQuad;     // (-1..1, -1..1)
// Per-instance viscous fluid primitive:
//   iGeom:   (cx_px, cy_px, halfLen_px, maxRad_px)
//   iShape:  (angle_rad, rStartNorm, rEndNorm, neckPinch)
//   iOptics: (density, heightZNorm, pulpBoost, beadness)
//   iColor:  (r, g, b, opacity)
in vec4 iGeom;
in vec4 iShape;
in vec4 iOptics;
in vec4 iColor;

out vec2 vLocal;
out float vHalfLen;
out float vMaxRad;
out vec3 vProfile;
out vec4 vOptics;
out vec3 vTint;

void main() {
  float halfLen = iGeom.z;
  float maxRad  = iGeom.w;
  float padX = halfLen + maxRad * 1.15;
  float padY = maxRad * 1.15;

  vec2 localPx = vec2(aQuad.x * padX, aQuad.y * padY);
  float c = cos(iShape.x);
  float s = sin(iShape.x);
  vec2 rotPx = vec2(localPx.x * c - localPx.y * s, localPx.x * s + localPx.y * c);
  vec2 px = iGeom.xy + rotPx;

  vec2 ndc = (px / uRes) * 2.0 - 1.0;
  ndc.y = -ndc.y;

  vLocal = localPx;
  vHalfLen = halfLen;
  vMaxRad = maxRad;
  vProfile = iShape.yzw;
  vOptics = iOptics;
  vTint = iColor.rgb;

  gl_Position = vec4(ndc, 0.0, 1.0);
}
`;

const FIELD_FS = `#version 300 es
precision highp float;

in vec2 vLocal;
in float vHalfLen;
in float vMaxRad;
in vec3 vProfile;
in vec4 vOptics;
in vec3 vTint;

layout(location = 0) out vec4 oField;
layout(location = 1) out vec4 oTint;

void main() {
  float hl = max(vHalfLen, 0.001);
  float clampedX = clamp(vLocal.x, -vHalfLen, vHalfLen);
  float t = vHalfLen > 0.25 ? (clampedX / (2.0 * hl) + 0.5) : 0.5;

  float rBase = mix(vProfile.x, vProfile.y, t);
  float pinchWave = sin(t * 3.14159265);
  float rFactor = max(0.12, rBase * (1.0 - vProfile.z * pinchWave * pinchWave));
  float localR = max(0.65, vMaxRad * rFactor);

  vec2 diff = vec2(vLocal.x - clampedX, vLocal.y);
  float distNorm = length(diff) / localR;
  if (distNorm >= 1.0) discard;

  // Smooth C2 fluid kernel
  float w = 1.0 - distNorm * distNorm;
  float k = w * w * w;
  float phi = k * vOptics.x;

  // R = thickness phi, G = zNorm*phi, B = beadness*phi, A = pulpBoost*phi
  oField = vec4(phi, phi * vOptics.y, phi * vOptics.w, phi * vOptics.z);
  oTint  = vec4(vTint * phi, phi);
}
`;

const FULLSCREEN_VS = `#version 300 es
precision highp float;
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

const VISCOUS_COMMON = `
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise2(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
    mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm2(vec2 p) {
  float v = 0.58 * noise2(p);
  p = mat2(0.80, -0.60, 0.60, 0.80) * p * 2.04;
  v += 0.42 * noise2(p);
  return v;
}

// Physically-based luminous pressed fruit-nectar optics!
// - Beer-Lambert exponential absorption: thin edges stay delicately stained & translucent,
//   thick menisci & plump beads deepen naturally in chromatic saturation (yellow -> warm amber, NEVER olive-black!)
// - Subtle organic pulp scatter + lens caustic glow + crisp wet specular glints (ZERO plastic balloon glare!)
vec3 shadeFruitNectar(
  vec3 bgRefracted,
  vec3 tint,
  vec3 N,
  float rawDepth,
  float phi,
  float iso,
  float beadness,
  vec2 uv,
  float isAirborne
) {
  // 1. Physical chromatic Beer-Lambert absorption coefficients
  vec3 invTint = max(vec3(0.0), vec3(1.0) - tint);
  vec3 sigma = invTint * vec3(3.65, 3.90, 4.15) + vec3(0.08, 0.115, 0.165);

  // Subtle raised capillary meniscus ridge right inside the wet boundary of pools
  float edgeBand = exp(-pow((phi - (iso + 0.085)) / 0.072, 2.0));
  // Effective optical thickness: delicate on thin stone-wetting edges, sumptuous & deep in thick pools & beads!
  float opticalThick = clamp(
    pow(rawDepth, 0.70) * (0.76 + 0.42 * beadness + 0.28 * isAirborne) +
    edgeBand * (1.0 - beadness * 0.5) * 0.24 +
    (1.0 - N.z) * 0.26,
    0.05,
    1.72
  );

  // Real Beer-Lambert light transmission through translucent fruit nectar!
  vec3 transmitted = bgRefracted * exp(-sigma * opticalThick);

  // 2. Delicate suspended fruit pulp clouding & sunlit internal Mie scatter (subtle, rich — NOT flat neon!)
  float pulpCloud = fbm2(uv * vec2(74.0, 42.0));
  float pulpSpeck = smoothstep(0.76, 0.94, noise2(uv * vec2(195.0, 112.0)));
  vec3 deepNectar = tint * exp(-sigma * 0.35);
  vec3 nectarScatter = mix(tint * 0.92, deepNectar, clamp(opticalThick * 0.55, 0.0, 0.78));
  nectarScatter += mix(tint, vec3(1.0, 0.97, 0.90), 0.50) * pulpSpeck * 0.14 * smoothstep(0.08, 0.42, rawDepth);

  // Keep thin pool sheets very translucent so warm alabaster shows through; add silky pulpy depth in thick pools & air!
  float pulpMix = clamp(
    smoothstep(0.10, 0.88, opticalThick) * (0.14 + 0.12 * pulpCloud) + isAirborne * 0.10,
    0.03,
    0.32
  );
  vec3 juice = mix(transmitted, nectarScatter, pulpMix);

  // 3. Real optical lens caustic brightening (strong on convex plump 3D beads, whisper-subtle on flat pool interiors!)
  vec3 L = normalize(vec3(-0.42, -0.46, 0.78));
  vec3 V = vec3(0.0, 0.0, 1.0);
  float causticDir = clamp(dot(N, normalize(vec3(0.45, 0.48, 0.75))), 0.0, 1.0);
  float caustic = pow(causticDir, 3.2) * smoothstep(0.04, 0.35, rawDepth) * (0.08 + 0.40 * beadness);
  vec3 causticTint = bgRefracted * exp(-sigma * opticalThick * 0.46);
  juice += causticTint * caustic * 0.52;

  // 4. Crisp natural capillary coffee-ring pigment darkening at the exact contact edge
  float contactRing = smoothstep(0.038, 0.0, abs(phi - (iso + 0.022)));
  vec3 ringAbsorb = exp(-sigma * (0.28 + 0.18 * (1.0 - beadness)));
  juice *= mix(vec3(1.0), ringAbsorb, contactRing * 0.52);

  // 5. Crisp, localized studio softbox wet highlights (pinpoint on beads, delicate curved glint on pool rims!)
  vec3 H1 = normalize(L + V);
  float ndh1 = max(dot(N, H1), 0.0);
  float specSharp = pow(ndh1, 210.0) * (1.15 + 0.45 * beadness);
  float specSheen = pow(ndh1, 46.0) * (0.11 + 0.08 * beadness);

  vec3 L2 = normalize(vec3(0.62, 0.48, 0.62));
  float specFill = pow(max(dot(N, normalize(L2 + V)), 0.0), 110.0) * 0.24;

  float ndv = clamp(dot(N, V), 0.0, 1.0);
  float fresnel = pow(1.0 - ndv, 4.8);

  vec3 specLight = vec3(1.0, 0.992, 0.975) * (specSharp + specSheen + specFill + fresnel * 0.20);
  return juice * (1.0 - fresnel * 0.12) + specLight;
}
`;

// PASS A: Matte alabaster ceramic + organic domain-warped viscous fruit pools, curving trails & plump round beads!
const FLOOR_OPTICS_FS = `#version 300 es
precision highp float;

uniform sampler2D uBaseTex;
uniform sampler2D uFloorField;
uniform sampler2D uFloorTint;
uniform vec2 uFieldPx;
uniform float uTime;
uniform float uHasFloor;

in vec2 vUv;
out vec4 fragColor;

${VISCOUS_COMMON}

vec2 getStoneWarp(vec2 uv) {
  vec2 w1 = vec2(
    fbm2(uv * vec2(17.0, 10.0) + vec2(2.3, 1.4)),
    fbm2(uv * vec2(17.0, 10.0) + vec2(7.8, 5.1))
  ) - 0.5;
  vec2 w2 = vec2(
    noise2(uv * vec2(52.0, 30.0)),
    noise2(uv * vec2(52.0, 30.0) + vec2(11.7, 6.9))
  ) - 0.5;
  return w1 * 0.0115 + w2 * 0.0028;
}

// Fast ghost-free field lookup reusing precomputed stone warp!
vec2 sampleFloorPair(vec2 uv, vec2 warp, float microPin) {
  vec4 fW = texture(uFloorField, clamp(uv + warp, 0.001, 0.999));
  float poolPhi = max(0.0, fW.r - fW.b);
  poolPhi = max(0.0, poolPhi + microPin * smoothstep(0.03, 0.18, poolPhi));
  vec4 fB = texture(uFloorField, clamp(uv + warp * 0.12, 0.001, 0.999));
  float beadPhi = max(0.0, fB.b);
  return vec2(poolPhi, beadPhi);
}

void main() {
  vec2 uvScene = vec2(vUv.x, 1.0 - vUv.y);
  vec3 baseCol = texture(uBaseTex, uvScene).rgb;

  if (uHasFloor < 0.5) {
    fragColor = vec4(baseCol, 1.0);
    return;
  }

  vec2 warp = getStoneWarp(vUv);
  float microPin = (noise2(vUv * vec2(62.0, 36.0)) - 0.5) * 0.030;
  vec2 fbC = sampleFloorPair(vUv, warp, microPin);
  float phi = fbC.x + fbC.y;

  // Fast shadow check & early-out on dry ceramic (80%+ of pixels!)
  vec2 shUv = clamp(vUv + vec2(-uFieldPx.x * 2.6, uFieldPx.y * 3.4), 0.001, 0.999);
  vec2 fbSh = sampleFloorPair(shUv, warp, microPin);
  float phiSh = fbSh.x + fbSh.y;

  if (phi < 0.06 && phiSh < 0.12) {
    fragColor = vec4(baseCol, 1.0);
    return;
  }

  float beadW = clamp(fbC.y / max(phi, 0.001), 0.0, 1.0);
  float iso = 0.155;

  // 1. Subtle warm tinted micro-shadow & 2px dampened-ceramic absorption halo outside the wet rim!
  float shBead = clamp(fbSh.y / max(phiSh, 0.001), 0.0, 1.0);
  float shMask = smoothstep(iso - 0.02, iso + 0.18, phiSh) * (1.0 - smoothstep(iso - 0.015, iso + 0.02, phi));
  if (shMask > 0.001) {
    vec4 tShP = texture(uFloorTint, clamp(shUv + warp, 0.001, 0.999));
    vec4 tShB = texture(uFloorTint, clamp(shUv + warp * 0.12, 0.001, 0.999));
    vec3 shTintP = clamp(tShP.rgb / max(tShP.a, 0.001), 0.0, 1.0);
    vec3 shTintB = clamp(tShB.rgb / max(tShB.a, 0.001), 0.0, 1.0);
    vec3 shTint = mix(shTintP, shTintB, shBead);
    vec3 shadowCol = mix(vec3(0.86, 0.82, 0.78), shTint * 0.55 + 0.42, 0.48);
    baseCol *= mix(vec3(1.0), shadowCol, shMask * (0.28 + 0.24 * shBead));
  }

  // Hairline matte-ceramic capillary dampness ring just outside the wet edge
  float dampHalo = smoothstep(iso - 0.075, iso, phi) * (1.0 - smoothstep(iso - 0.01, iso + 0.02, phi));
  baseCol *= (1.0 - dampHalo * 0.055 * (1.0 - beadW * 0.5));

  float mask = smoothstep(iso - 0.015, iso + 0.015, phi);
  if (mask <= 0.001) {
    fragColor = vec4(baseCol, 1.0);
    return;
  }

  // 2. Scale-accurate 3D viscous height profile:
  //    - Large pools (beadW ~ 0): smooth FLAT glossy liquid plateau with gentle raised meniscus ONLY at the rim!
  //    - Millimeter satellite beads (beadW ~ 1): plump 3D hemispherical surface-tension domes!
  vec2 e = uFieldPx * 1.45;
  vec2 fbL = sampleFloorPair(vUv - vec2(e.x, 0.0), warp, microPin);
  vec2 fbR = sampleFloorPair(vUv + vec2(e.x, 0.0), warp, microPin);
  vec2 fbD = sampleFloorPair(vUv - vec2(0.0, e.y), warp, microPin);
  vec2 fbU = sampleFloorPair(vUv + vec2(0.0, e.y), warp, microPin);
  float pL = max(0.0, fbL.x + fbL.y - iso);
  float pR = max(0.0, fbR.x + fbR.y - iso);
  float pD = max(0.0, fbD.x + fbD.y - iso);
  float pU = max(0.0, fbU.x + fbU.y - iso);
  float pC = max(0.0, phi - iso);

  float hPoolL = tanh(pL * 5.2) * 0.46 + exp(-pow((pL - 0.06) / 0.055, 2.0)) * 0.045;
  float hPoolR = tanh(pR * 5.2) * 0.46 + exp(-pow((pR - 0.06) / 0.055, 2.0)) * 0.045;
  float hPoolD = tanh(pD * 5.2) * 0.46 + exp(-pow((pD - 0.06) / 0.055, 2.0)) * 0.045;
  float hPoolU = tanh(pU * 5.2) * 0.46 + exp(-pow((pU - 0.06) / 0.055, 2.0)) * 0.045;

  float hBeadL = pow(pL, 0.42) * 0.92;
  float hBeadR = pow(pR, 0.42) * 0.92;
  float hBeadD = pow(pD, 0.42) * 0.92;
  float hBeadU = pow(pU, 0.42) * 0.92;

  float hL = mix(hPoolL, hBeadL, beadW);
  float hR = mix(hPoolR, hBeadR, beadW);
  float hD = mix(hPoolD, hBeadD, beadW);
  float hU = mix(hPoolU, hBeadU, beadW);

  float slopeGain = mix(2.25, 3.25, beadW);
  float microRipple = (noise2(vUv * vec2(68.0, 40.0) + uTime * 0.04) - 0.5) * 0.012;
  vec3 N = normalize(vec3((hL - hR) * slopeGain + microRipple, (hU - hD) * slopeGain + microRipple, 0.62));

  vec4 tintP = texture(uFloorTint, clamp(vUv + warp, 0.001, 0.999));
  vec4 tintB = texture(uFloorTint, clamp(vUv + warp * 0.12, 0.001, 0.999));
  vec3 colP = clamp(tintP.rgb / max(tintP.a, 0.001), 0.0, 1.0);
  vec3 colB = clamp(tintB.rgb / max(tintB.a, 0.001), 0.0, 1.0);
  vec3 tint = mix(colP, colB, beadW);

  // Subtle Snell refraction of warm alabaster stone grain through the glossy fruit syrup
  vec2 refUv = clamp(uvScene - vec2(N.x, -N.y) * (0.007 + 0.006 * beadW) * clamp(pC * 2.2, 0.12, 1.0), 0.002, 0.998);
  vec3 bgRef = texture(uBaseTex, refUv).rgb;

  vec3 liquidCol = shadeFruitNectar(bgRef, tint, N, pC, phi, iso, beadW, vUv, 0.0);
  fragColor = vec4(mix(baseCol, liquidCol, mask), 1.0);
}
`;

// PASS B: Composite FloorOut + Live UI/Fruits -> Organic Curving 3D Airborne Viscous Ribbons & Beads -> Razor Flash!
const AIR_OPTICS_FS = `#version 300 es
precision highp float;

uniform sampler2D uFloorOutTex;
uniform sampler2D uUiTex;
uniform sampler2D uOverlayTex;
uniform sampler2D uAirField;
uniform sampler2D uAirTint;
uniform vec2 uFieldPx;
uniform float uTime;
uniform float uHasAir;

in vec2 vUv;
out vec4 fragColor;

${VISCOUS_COMMON}

vec3 sampleCombinedScene(vec2 uvGL) {
  vec2 cUv = clamp(uvGL, 0.002, 0.998);
  vec3 floorCol = texture(uFloorOutTex, cUv).rgb;
  vec4 ui = texture(uUiTex, vec2(cUv.x, 1.0 - cUv.y));
  return ui.rgb + floorCol * (1.0 - ui.a);
}

vec2 getAirWarp(vec2 uv) {
  vec2 w = vec2(
    noise2(uv * vec2(22.0, 13.0) - vec2(uTime * 0.9, -uTime * 0.6)),
    noise2(uv * vec2(22.0, 13.0) + vec2(5.1 - uTime * 0.7, 3.2 + uTime * 0.5))
  ) - 0.5;
  return w * 0.0062;
}

vec2 sampleAirPair(vec2 uv, vec2 warp) {
  vec4 fW = texture(uAirField, clamp(uv + warp, 0.001, 0.999));
  float ribbonPhi = max(0.0, fW.r - fW.b);
  vec4 fB = texture(uAirField, clamp(uv + warp * 0.16, 0.001, 0.999));
  float beadPhi = max(0.0, fB.b);
  return vec2(ribbonPhi, beadPhi);
}

void main() {
  vec3 sceneCol = sampleCombinedScene(vUv);
  vec3 outCol = sceneCol;

  if (uHasAir > 0.5) {
    // 1. Soft 3D height-offset warm tinted shadow cast by airborne splash ribbons onto ceramic & UI
    vec2 lightOff = vec2(-0.0085, 0.014);
    vec4 fSh0 = texture(uAirField, clamp(vUv + lightOff * 0.7, 0.002, 0.998));
    if (fSh0.r > 0.04) {
      float zEst = clamp(fSh0.g / max(fSh0.r, 0.001), 0.05, 1.0);
      vec2 shUv = clamp(vUv + lightOff * (0.25 + 1.05 * zEst), 0.002, 0.998);
      vec4 fSh = texture(uAirField, shUv);
      if (fSh.r > 0.06) {
        vec4 tSh = texture(uAirTint, shUv);
        vec3 shTint = clamp(tSh.rgb / max(tSh.a, 0.001), 0.0, 1.0);
        float shMask = smoothstep(0.08, 0.42, fSh.r);
        vec3 shCol = mix(vec3(0.84, 0.80, 0.76), shTint * 0.55 + 0.42, 0.50);
        sceneCol *= mix(vec3(1.0), shCol, shMask * 0.30);
        outCol = sceneCol;
      }
    }

    // 2. Organic curving airborne liquid ribbons & flying glossy beads (exact same luminous pressed-nectar material!)
    vec2 warp = getAirWarp(vUv);
    vec2 abC = sampleAirPair(vUv, warp);
    float phi = abC.x + abC.y;
    float iso = 0.165;
    float mask = smoothstep(iso - 0.016, iso + 0.016, phi);

    if (mask > 0.001) {
      float beadW = clamp(abC.y / max(phi, 0.001), 0.0, 1.0);
      vec2 e = uFieldPx * 1.4;
      vec2 abL = sampleAirPair(vUv - vec2(e.x, 0.0), warp);
      vec2 abR = sampleAirPair(vUv + vec2(e.x, 0.0), warp);
      vec2 abD = sampleAirPair(vUv - vec2(0.0, e.y), warp);
      vec2 abU = sampleAirPair(vUv + vec2(0.0, e.y), warp);
      float pL = max(0.0, abL.x + abL.y - iso);
      float pR = max(0.0, abR.x + abR.y - iso);
      float pD = max(0.0, abD.x + abD.y - iso);
      float pU = max(0.0, abU.x + abU.y - iso);
      float pC = max(0.0, phi - iso);

      float hL = pow(pL, 0.45), hR = pow(pR, 0.45), hD = pow(pD, 0.45), hU = pow(pU, 0.45);

      vec2 rUv = vUv * vec2(22.0, 13.0) + vec2(uTime * 0.45, -uTime * 0.30);
      float rC = noise2(rUv);
      float rX = noise2(rUv + vec2(0.15, 0.0)) - rC;
      float rY = noise2(rUv + vec2(0.0, 0.15)) - rC;

      vec3 N = normalize(vec3((hL - hR) * 2.95 + rX * 0.16, (hU - hD) * 2.95 + rY * 0.16, 0.56));

      vec4 tintR = texture(uAirTint, clamp(vUv + warp, 0.001, 0.999));
      vec4 tintB = texture(uAirTint, clamp(vUv + warp * 0.16, 0.001, 0.999));
      vec3 colR = clamp(tintR.rgb / max(tintR.a, 0.001), 0.0, 1.0);
      vec3 colB = clamp(tintB.rgb / max(tintB.a, 0.001), 0.0, 1.0);
      vec3 tint = mix(colR, colB, beadW);

      vec2 refOff = vec2(N.x, N.y) * 0.016 * clamp(pow(pC, 0.5) * 1.2, 0.15, 0.95);
      vec3 bgRef = sampleCombinedScene(vUv - refOff);

      vec3 liquidCol = shadeFruitNectar(bgRef, tint, N, pC, phi, iso, beadW, vUv, 1.0);
      outCol = mix(sceneCol, liquidCol, mask);
    }
  }

  // 3. Delicate optical cleave flash, backlit mist & real seeds on top
  vec4 ov = texture(uOverlayTex, vec2(vUv.x, 1.0 - vUv.y));
  outCol = ov.rgb + outCol * (1.0 - ov.a);

  fragColor = vec4(outCol, 1.0);
}
`;

function compileShader(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error(`Shader compile error: ${gl.getShaderInfoLog(sh)}`);
  }
  return sh;
}

function linkProgram(gl, vsSrc, fsSrc) {
  const p = gl.createProgram();
  gl.attachShader(p, compileShader(gl, gl.VERTEX_SHADER, vsSrc));
  gl.attachShader(p, compileShader(gl, gl.FRAGMENT_SHADER, fsSrc));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error(`Program link error: ${gl.getProgramInfoLog(p)}`);
  }
  return p;
}

function makeTexture(gl, w, h, filter = gl.LINEAR, isHalfFloat = false) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  if (w > 0 && h > 0) {
    if (isHalfFloat) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    }
  }
  return t;
}

function makeFluidMRT(gl, w, h, isHalfFloat = false) {
  const fieldTex = makeTexture(gl, w, h, gl.LINEAR, isHalfFloat);
  const tintTex = makeTexture(gl, w, h, gl.LINEAR, isHalfFloat);
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, fieldTex, 0);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, tintTex, 0);
  gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  if (isHalfFloat && status !== gl.FRAMEBUFFER_COMPLETE) {
    gl.deleteFramebuffer(fbo);
    gl.deleteTexture(fieldTex);
    gl.deleteTexture(tintTex);
    return makeFluidMRT(gl, w, h, false);
  }
  return { fbo, fieldTex, tintTex, w, h, isHalfFloat };
}

function makeSingleFBO(gl, w, h) {
  const tex = makeTexture(gl, w, h, gl.LINEAR);
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { fbo, tex, w, h };
}

const MAX_INSTANCES = 2200;
const FLOATS_PER_INST = 16;

class StudioFluidGL {
  constructor(width, height, dpr = 2) {
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    this.pxW = Math.round(width * dpr);
    this.pxH = Math.round(height * dpr);

    // Full 1:1 native pixel fluid field (1280x720) for razor-clean organic edges & micro-beads
    this.fieldW = this.pxW;
    this.fieldH = this.pxH;

    this.canvas = document.createElement('canvas');
    this.canvas.width = this.pxW;
    this.canvas.height = this.pxH;
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.display = 'block';

    const gl = this.canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    });
    if (!gl) { this.gl = null; this.ctx2d = this.canvas.getContext('2d'); this.baseCanvas = null; return; }
    this.gl = gl;

    // Enable half-float color MRTs so overlapping fluid pools NEVER clamp oTint.a at 1.0 (eliminates neon center patches!)
    const hasHalfFloat = !!(gl.getExtension('EXT_color_buffer_half_float') || gl.getExtension('EXT_color_buffer_float'));

    this.fieldProg = linkProgram(gl, FIELD_VS_PX, FIELD_FS);
    this.floorProg = linkProgram(gl, FULLSCREEN_VS, FLOOR_OPTICS_FS);
    this.airProg = linkProgram(gl, FULLSCREEN_VS, AIR_OPTICS_FS);

    this.floorMRT = makeFluidMRT(gl, this.fieldW, this.fieldH, hasHalfFloat);
    this.airMRT = makeFluidMRT(gl, this.fieldW, this.fieldH, hasHalfFloat);
    this.floorOutFBO = makeSingleFBO(gl, this.pxW, this.pxH);

    this.baseTex = makeTexture(gl, 0, 0, gl.LINEAR);
    this.uiTex = makeTexture(gl, 0, 0, gl.LINEAR);
    this.overlayTex = makeTexture(gl, 0, 0, gl.LINEAR);

    this.fsVao = gl.createVertexArray();
    gl.bindVertexArray(this.fsVao);
    const fsBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, fsBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    this.instData = new Float32Array(MAX_INSTANCES * FLOATS_PER_INST);
    this.instVao = gl.createVertexArray();
    gl.bindVertexArray(this.instVao);

    const qBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, qBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const locQuad = gl.getAttribLocation(this.fieldProg, 'aQuad');
    gl.enableVertexAttribArray(locQuad);
    gl.vertexAttribPointer(locQuad, 2, gl.FLOAT, false, 0, 0);

    this.instBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.instData.byteLength, gl.DYNAMIC_DRAW);

    const stride = FLOATS_PER_INST * 4;
    const bindAttr = (name, offset) => {
      const loc = gl.getAttribLocation(this.fieldProg, name);
      if (loc < 0) return;
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, stride, offset);
      gl.vertexAttribDivisor(loc, 1);
    };
    bindAttr('iGeom',   0);
    bindAttr('iShape',  16);
    bindAttr('iOptics', 32);
    bindAttr('iColor',  48);
    gl.bindVertexArray(null);
  }

  uploadCeramicBase(boardCanvas) {
    const gl = this.gl;
    if (!gl) { this.baseCanvas = boardCanvas; return; }
    gl.bindTexture(gl.TEXTURE_2D, this.baseTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, boardCanvas);
  }

  _renderFieldMRT(mrt, prims) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, mrt.fbo);
    gl.viewport(0, 0, mrt.w, mrt.h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const count = Math.min(prims.length, MAX_INSTANCES);
    if (count === 0) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return;
    }

    const buf = this.instData;
    for (let i = 0; i < count; i++) {
      const p = prims[i];
      const o = i * FLOATS_PER_INST;
      buf[o + 0]  = p.cx;
      buf[o + 1]  = p.cy;
      buf[o + 2]  = p.halfLen;
      buf[o + 3]  = p.maxRad;
      buf[o + 4]  = p.ang;
      buf[o + 5]  = p.rStart;
      buf[o + 6]  = p.rEnd;
      buf[o + 7]  = p.pinch;
      buf[o + 8]  = p.density;
      buf[o + 9]  = p.zNorm;
      buf[o + 10] = 0.0;
      buf[o + 11] = p.beadness;
      buf[o + 12] = p.tr;
      buf[o + 13] = p.tg;
      buf[o + 14] = p.tb;
      buf[o + 15] = 1.0;
    }

    gl.useProgram(this.fieldProg);
    gl.uniform2f(gl.getUniformLocation(this.fieldProg, 'uRes'), this.width, this.height);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);

    gl.bindVertexArray(this.instVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, buf.subarray(0, count * FLOATS_PER_INST));
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  renderComposite(floorPrims, airPrims, uiCanvas, overlayCanvas, time) {
    const gl = this.gl;
    if (!gl) {
      const c = this.ctx2d; if (!c) return;
      c.clearRect(0, 0, this.pxW, this.pxH);
      if (this.baseCanvas) c.drawImage(this.baseCanvas, 0, 0, this.pxW, this.pxH);
      if (uiCanvas) c.drawImage(uiCanvas, 0, 0, this.pxW, this.pxH);
      if (overlayCanvas) c.drawImage(overlayCanvas, 0, 0, this.pxW, this.pxH);
      return;
    }

    this._renderFieldMRT(this.floorMRT, floorPrims);
    this._renderFieldMRT(this.airMRT, airPrims);

    // Pass A -> floorOutFBO: Matte alabaster stone + organic viscous fruit pools & glossy beads
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.floorOutFBO.fbo);
    gl.viewport(0, 0, this.pxW, this.pxH);
    gl.useProgram(this.floorProg);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.baseTex);
    gl.uniform1i(gl.getUniformLocation(this.floorProg, 'uBaseTex'), 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.floorMRT.fieldTex);
    gl.uniform1i(gl.getUniformLocation(this.floorProg, 'uFloorField'), 1);

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.floorMRT.tintTex);
    gl.uniform1i(gl.getUniformLocation(this.floorProg, 'uFloorTint'), 2);

    gl.uniform2f(gl.getUniformLocation(this.floorProg, 'uFieldPx'), 1 / this.fieldW, 1 / this.fieldH);
    gl.uniform1f(gl.getUniformLocation(this.floorProg, 'uTime'), time);
    gl.uniform1f(gl.getUniformLocation(this.floorProg, 'uHasFloor'), floorPrims.length > 0 ? 1.0 : 0.0);

    gl.bindVertexArray(this.fsVao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // Upload premultiplied transparent UI/Fruits & Razor-Slash/Seeds canvases
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.uiTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, uiCanvas);

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.overlayTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, overlayCanvas);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);

    // Pass B -> Screen: Composite puddled floor + UI/Fruits + Airborne Curving Viscous Splash + Razor Flash
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.pxW, this.pxH);
    gl.useProgram(this.airProg);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.floorOutFBO.tex);
    gl.uniform1i(gl.getUniformLocation(this.airProg, 'uFloorOutTex'), 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.uiTex);
    gl.uniform1i(gl.getUniformLocation(this.airProg, 'uUiTex'), 1);

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.overlayTex);
    gl.uniform1i(gl.getUniformLocation(this.airProg, 'uOverlayTex'), 2);

    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.airMRT.fieldTex);
    gl.uniform1i(gl.getUniformLocation(this.airProg, 'uAirField'), 3);

    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, this.airMRT.tintTex);
    gl.uniform1i(gl.getUniformLocation(this.airProg, 'uAirTint'), 4);

    gl.uniform2f(gl.getUniformLocation(this.airProg, 'uFieldPx'), 1 / this.fieldW, 1 / this.fieldH);
    gl.uniform1f(gl.getUniformLocation(this.airProg, 'uTime'), time);
    gl.uniform1f(gl.getUniformLocation(this.airProg, 'uHasAir'), airPrims.length > 0 ? 1.0 : 0.0);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  }

  dispose() {
    if (this.gl) {
      try { this.gl.getExtension('WEBGL_lose_context')?.loseContext(); } catch {}
      this.gl = null;
    }
  }
}


// Fruit Studio UI — Clean Tactile Macro Foley & Ceramic WebAudio Synthesizer
// Pure commercial macro sound design (zero arcade fanfares or game chimes):
//   - Surgical razor-air whisper on fast swipes
//   - Crisp botanical rind snap + lush wet high-speed liquid splash & micro-droplet fizz
//   - Soft damped matte-porcelain ceramic settle click

class StudioAudio {
  constructor() {
    this.enabled = true;
    this.ctx = null;
    this.master = null;
    this.noiseBuf = null;
    this._lastWhoosh = 0;
  }
  get on() { return this.enabled; }
  set on(v) { this.enabled = Boolean(v); }
  wake() { this.unlock(); }
  toggle() { this.enabled = !this.enabled; if (this.enabled) this.unlock(); return this.enabled; }

  unlock() {
    if (!this.enabled) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!this.ctx) {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.72;
      this.master.connect(this.ctx.destination);
      this._buildNoise();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  _buildNoise() {
    const sr = this.ctx.sampleRate;
    const len = Math.floor(sr * 1.4);
    const buf = this.ctx.createBuffer(1, len, sr);
    const ch = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.996 * b0 + w * 0.032;
      b1 = 0.984 * b1 + w * 0.036;
      b2 = 0.948 * b2 + w * 0.052;
      ch[i] = Math.max(-1, Math.min(1, (b0 + b1 + b2 + w * 0.42) * 0.85));
    }
    this.noiseBuf = buf;
  }

  _ready() {
    if (!this.enabled) return false;
    if (!this.ctx) this.unlock();
    return !!(this.ctx && this.ctx.state === 'running');
  }

  _pan(p = 0) {
    if (typeof this.ctx.createStereoPanner === 'function') {
      const node = this.ctx.createStereoPanner();
      node.pan.value = Math.max(-0.85, Math.min(0.85, p));
      node.connect(this.master);
      return node;
    }
    return this.master;
  }

  // Delicate surgical air-slice whisper
  playSliceAir(speedNorm = 0.7, pan = 0) {
    if (!this._ready() || !this.noiseBuf) return;
    const now = performance.now();
    if (now - this._lastWhoosh < 130) return;
    this._lastWhoosh = now;

    const t = this.ctx.currentTime;
    const v = Math.max(0.25, Math.min(1.0, speedNorm));
    const out = this._pan(pan);

    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 2.6;
    bp.frequency.setValueAtTime(520 + v * 280, t);
    bp.frequency.exponentialRampToValueAtTime(2600 + v * 1100, t + 0.048);
    bp.frequency.exponentialRampToValueAtTime(680, t + 0.13);

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.16 * v, t + 0.022);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);

    src.connect(bp).connect(g).connect(out);
    src.start(t, Math.random() * 0.5, 0.16);
  }

  // Macro crisp fruit cleave + viscous liquid splash scaled by real swipe energy & cut volume!
  playMacroChop(pan = 0, heavy = false, energy = 0.7, vol = 1.0) {
    if (!this._ready()) return;
    const t = this.ctx.currentTime;
    const out = this._pan(pan);
    const e = Math.max(0.15, Math.min(1.5, energy));
    const vScale = (0.52 + 0.48 * Math.min(1.2, e)) * (0.55 + 0.45 * Math.max(0.2, vol));

    if (this.noiseBuf) {
      // 1. Crisp fibrous rind snap transient (brighter & sharper on fast whips, intimate on slow draw-cuts)
      const s1 = this.ctx.createBufferSource();
      s1.buffer = this.noiseBuf;
      const f1 = this.ctx.createBiquadFilter();
      f1.type = 'bandpass';
      f1.Q.value = 1.8;
      f1.frequency.setValueAtTime((heavy ? 2100 : 2700) + e * 950, t);
      f1.frequency.exponentialRampToValueAtTime(740 + e * 180, t + 0.065);
      const g1 = this.ctx.createGain();
      g1.gain.setValueAtTime(0.0001, t);
      g1.gain.linearRampToValueAtTime((heavy ? 0.34 : 0.28) * vScale, t + 0.003);
      g1.gain.exponentialRampToValueAtTime(0.0001, t + 0.075);
      s1.connect(f1).connect(g1).connect(out);
      s1.start(t, Math.random() * 0.4, 0.09);

      // 2. Viscous wet liquid splash bloom (longer & fuller on high-energy cuts)
      const s2 = this.ctx.createBufferSource();
      s2.buffer = this.noiseBuf;
      const f2 = this.ctx.createBiquadFilter();
      f2.type = 'bandpass';
      f2.Q.value = 2.4;
      f2.frequency.setValueAtTime(1100 + e * 520, t + 0.012);
      f2.frequency.exponentialRampToValueAtTime(420, t + 0.22 + e * 0.08);
      const g2 = this.ctx.createGain();
      g2.gain.setValueAtTime(0.0001, t);
      g2.gain.linearRampToValueAtTime(0.24 * vScale, t + 0.025);
      g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.24 + e * 0.10);
      s2.connect(f2).connect(g2).connect(out);
      s2.start(t, Math.random() * 0.4, 0.36);

      // 3. Fine atomized spray tail (prominent only at medium/high Weber speeds!)
      if (e > 0.35) {
        const s3 = this.ctx.createBufferSource();
        s3.buffer = this.noiseBuf;
        const f3 = this.ctx.createBiquadFilter();
        f3.type = 'highpass';
        f3.frequency.setValueAtTime(4000 + e * 600, t + 0.03);
        const g3 = this.ctx.createGain();
        g3.gain.setValueAtTime(0.0001, t + 0.025);
        g3.gain.linearRampToValueAtTime(0.085 * Math.min(1.3, e) * vol, t + 0.06);
        g3.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
        s3.connect(f3).connect(g3).connect(out);
        s3.start(t + 0.02, Math.random() * 0.4, 0.36);
      }
    }

    // 4. Organic wet cleave resonant body
    const osc = this.ctx.createOscillator();
    const og = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime((heavy ? 195 : 250) + e * 45, t);
    osc.frequency.exponentialRampToValueAtTime((heavy ? 520 : 660) + e * 120, t + 0.035);
    osc.frequency.exponentialRampToValueAtTime(130, t + 0.12);
    og.gain.setValueAtTime(0.0001, t);
    og.gain.linearRampToValueAtTime(0.22 * vScale, t + 0.005);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
    osc.connect(og).connect(out);
    osc.start(t);
    osc.stop(t + 0.14);
  }

  // Soft damped wet fruit thump when a slowly-cut half kisses the ceramic surface
  playWetKiss(pan = 0, intensity = 0.5) {
    if (!this._ready()) return;
    const t = this.ctx.currentTime;
    const out = this._pan(pan);
    const v = Math.max(0.15, Math.min(1.0, intensity));
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(185 + v * 65, t);
    osc.frequency.exponentialRampToValueAtTime(78, t + 0.075);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.095 * v, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.085);
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + 0.095);
  }

  // Whisper-clean porcelain ceramic tap when UI settles into new state
  playCeramicSettle(pan = 0) {
    if (!this._ready()) return;
    const t = this.ctx.currentTime;
    const out = this._pan(pan);
    [1040, 1890].forEach((f, i) => {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(f, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.042 / (i + 1), t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.095);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + 0.105);
    });
  }

  // Machined Leica/Braun porcelain bezel watch-detent click (richer body on 5-min major ticks!)
  playBezelTick(isMajor = false, pan = 0) {
    if (!this._ready()) return;
    const t = this.ctx.currentTime;
    const out = this._pan(pan);
    const baseFreq = isMajor ? 1480 : 2150;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(baseFreq, t);
    o.frequency.exponentialRampToValueAtTime(isMajor ? 520 : 940, t + (isMajor ? 0.026 : 0.016));
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(isMajor ? 0.072 : 0.042, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (isMajor ? 0.036 : 0.022));
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.042);

    if (isMajor && this.noiseBuf) {
      const s = this.ctx.createBufferSource();
      s.buffer = this.noiseBuf;
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 3.2;
      bp.frequency.setValueAtTime(3200, t);
      const ng = this.ctx.createGain();
      ng.gain.setValueAtTime(0.0001, t);
      ng.gain.linearRampToValueAtTime(0.035, t + 0.002);
      ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.018);
      s.connect(bp).connect(ng).connect(out);
      s.start(t, Math.random() * 0.4, 0.025);
    }
  }

  // Pressurized hydraulic botanical pop + lush 360° viscous nectar burst + porcelain confirmation chime
  playHydraulicBurst(pan = 0) {
    if (!this._ready()) return;
    const t = this.ctx.currentTime;
    const out = this._pan(pan);

    // 1. Deep pressurized organic pop transient
    const osc = this.ctx.createOscillator();
    const og = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(145, t);
    osc.frequency.exponentialRampToValueAtTime(520, t + 0.028);
    osc.frequency.exponentialRampToValueAtTime(92, t + 0.14);
    og.gain.setValueAtTime(0.0001, t);
    og.gain.linearRampToValueAtTime(0.28, t + 0.005);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    osc.connect(og).connect(out);
    osc.start(t);
    osc.stop(t + 0.17);

    // 2. Wide 360° viscous burst splash
    if (this.noiseBuf) {
      const s = this.ctx.createBufferSource();
      s.buffer = this.noiseBuf;
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 1.6;
      bp.frequency.setValueAtTime(1900, t);
      bp.frequency.exponentialRampToValueAtTime(480, t + 0.30);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.32, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
      s.connect(bp).connect(g).connect(out);
      s.start(t, Math.random() * 0.4, 0.38);
    }

    // 3. Delicate confirmed porcelain ceramic harmonic settle
    [880, 1318.5].forEach((freq, i) => {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(freq, t + 0.04 + i * 0.03);
      g.gain.setValueAtTime(0.0001, t + 0.04 + i * 0.03);
      g.gain.linearRampToValueAtTime(0.065 / (i + 1), t + 0.05 + i * 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.38 + i * 0.05);
      o.connect(g).connect(out);
      o.start(t + 0.04 + i * 0.03);
      o.stop(t + 0.46);
    });
  }

  // Upward kinetic air-scoop whoosh when launching fallen pieces back up from the bottom edge!
  playUpwardScoop(pan = 0) {
    if (!this._ready()) return;
    const t = this.ctx.currentTime;
    const out = this._pan(pan);

    if (this.noiseBuf) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 2.2;
      bp.frequency.setValueAtTime(360, t);
      bp.frequency.exponentialRampToValueAtTime(1950, t + 0.16);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.18, t + 0.045);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      src.connect(bp).connect(g).connect(out);
      src.start(t, Math.random() * 0.4, 0.24);
    }

    const osc = this.ctx.createOscillator();
    const og = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(170, t);
    osc.frequency.exponentialRampToValueAtTime(420, t + 0.13);
    og.gain.setValueAtTime(0.0001, t);
    og.gain.linearRampToValueAtTime(0.14, t + 0.015);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    osc.connect(og).connect(out);
    osc.start(t);
    osc.stop(t + 0.17);
  }

  // Crisp studio crystalline porcelain-harmonic chime ascending & enriching on Double / Triple / Quad / Penta COMBO!
  playComboChime(comboCount = 1, pan = 0) {
    if (!this._ready()) return;
    const t = this.ctx.currentTime;
    const out = this._pan(pan);
    const scaleNotes = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.51]; // C5..E6 warm pentatonic
    const idx = Math.min(scaleNotes.length - 1, Math.max(0, comboCount - 1));
    const root = scaleNotes[idx];
    // Richer harmonic intervals for Triple (3+), Quad (4+), Penta (5+)!
    const partials = comboCount >= 5
      ? [root, root * 1.25, root * 1.5, root * 2.0, root * 2.5]
      : comboCount >= 3
        ? [root, root * 1.25, root * 1.5, root * 2.0]
        : [root, root * 1.5, root * 2.0];

    partials.forEach((freq, i) => {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = i === 0 ? 'triangle' : 'sine';
      const delay = i * 0.024;
      const dur = 0.36 + Math.min(0.24, comboCount * 0.035) - i * 0.03;
      o.frequency.setValueAtTime(freq, t + delay);
      g.gain.setValueAtTime(0.0001, t + delay);
      g.gain.linearRampToValueAtTime((0.105 + Math.min(0.03, comboCount * 0.005)) / (i * 0.7 + 1), t + delay + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + delay + dur);
      o.connect(g).connect(out);
      o.start(t + delay);
      o.stop(t + delay + dur + 0.02);
    });
  }
}


// Fruit Studio UI v5 — Organic Viscous Fruit-Nectar Splat Physics & Butter-Smooth Macro Fruit Engine
// Re-architected from real macro viscous fruit-splat photography (Concept 04):
//   - ZERO straight matchsticks, ZERO triangular cone exclamation marks!
//   - Organic multi-lobed viscous pools + curving undulating syrup tongues (`beadness = 0`) that domain-warp
//     into authentic ragged ceramic-wetting bays & scalloped peninsulas!
//   - Natural power-law distribution of plump ROUND & softly-OVAL surface-tension satellite beads (`beadness = 1`)
//   - Sinuous curving 3D airborne viscous liquid ribbons (Rayleigh-Plateau breakup in flight -> seamless floor wet-bond!)
//   - Butter-smooth 60fps fruit animation (zero hard freeze-frames, seamless 3D openProg, smooth continuous glides!)


const STUDIO_FRUITS = {
  bloodOrange: {
    key: 'bloodOrange',
    label: 'Blood Orange',
    tintRGB: [0.86, 0.09, 0.11],
    liquidLight: '#FF7058',
    liquidMid: '#C81822',
    mist: '#F4826A',
    seed: null,
    accent: '#B81420',
  },
  yuzu: {
    key: 'yuzu',
    label: 'Golden Yuzu',
    tintRGB: [1.00, 0.80, 0.06],
    liquidLight: '#FFE978',
    liquidMid: '#EB9E06',
    mist: '#FFEE94',
    seed: '#FFF3C8',
    accent: '#C98200',
  },
  kiwi: {
    key: 'kiwi',
    label: 'Fuzzy Kiwi',
    tintRGB: [0.38, 0.86, 0.10],
    liquidLight: '#AEF254',
    liquidMid: '#52AD14',
    mist: '#C4F27C',
    seed: '#1A1C16',
    accent: '#468F12',
  },
  watermelon: {
    key: 'watermelon',
    label: 'Watermelon',
    tintRGB: [0.94, 0.16, 0.27],
    liquidLight: '#FF7A90',
    liquidMid: '#DE2042',
    mist: '#FF94A8',
    seed: '#1C1416',
    accent: '#C9183A',
  },
  strawberry: {
    key: 'strawberry',
    label: 'Ripe Strawberry',
    tintRGB: [0.90, 0.10, 0.17],
    liquidLight: '#FF6B7E',
    liquidMid: '#CE142E',
    mist: '#FA8898',
    seed: '#E6B84A',
    accent: '#BC1228',
  },
  fig: {
    key: 'fig',
    label: 'Black Mission Fig',
    tintRGB: [0.56, 0.08, 0.27],
    liquidLight: '#DF6E98',
    liquidMid: '#8C1543',
    mist: '#CF6C92',
    seed: '#E6B87A',
    accent: '#7A163E',
  },
};

let _photoPromise = null;
const _photoMap = {};
const _photoPending = new Set();

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(new Error(`Failed to load ${url}: ${e}`));
    img.src = url;
  });
}

function makeFrostedCopy(img, blurPx = 4.2) {
  const sz = 256;
  const c = document.createElement('canvas');
  c.width = sz; c.height = sz;
  const ctx = c.getContext('2d');
  ctx.filter = `blur(${blurPx}px) saturate(1.10)`;
  const pad = 16;
  ctx.drawImage(img, pad, pad, sz - pad * 2, sz - pad * 2);
  ctx.filter = 'none';
  return c;
}

function loadStudioFruits(baseUrl = './assets') {
  if (_photoPromise) return _photoPromise;
  const fruitKeys = Object.keys(STUDIO_FRUITS);
  _photoPromise = Promise.all(
    fruitKeys.map(async (k) => {
      const [whole, cut] = await Promise.all([
        loadImage(`${baseUrl}/${k}-whole.png`),
        loadImage(`${baseUrl}/${k}-cut.png`),
      ]);
      _photoMap[k] = { whole, cut, frostedWhole: makeFrostedCopy(whole, 4.2), frostedCut: makeFrostedCopy(cut, 3.6) };
      return [k, _photoMap[k]];
    })
  ).then(() => _photoMap);
  return _photoPromise;
}

function getLoadedFruits() {
  return _photoMap;
}

function segIntersectsRect(x1, y1, x2, y2, rx, ry, rw, rh) {
  let t0 = 0, t1 = 1;
  const dx = x2 - x1, dy = y2 - y1;
  const p = [-dx, dx, -dy, dy];
  const q = [x1 - rx, rx + rw - x1, y1 - ry, ry + rh - y1];
  for (let i = 0; i < 4; i++) {
    if (Math.abs(p[i]) < 1e-6) {
      if (q[i] < 0) return null;
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) {
        if (t > t1) return null;
        if (t > t0) t0 = t;
      } else {
        if (t < t0) return null;
        if (t < t1) t1 = t;
      }
    }
  }
  if (t0 > t1) return null;
  const tm = (t0 + t1) * 0.5;
  return { x: x1 + dx * tm, y: y1 + dy * tm, t: tm };
}

function segIntersectsCircle(x1, y1, x2, y2, cx, cy, r) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-5) {
    return Math.hypot(x1 - cx, y1 - cy) <= r ? { x: x1, y: y1, t: 0 } : null;
  }
  const t = Math.max(0, Math.min(1, ((cx - x1) * dx + (cy - y1) * dy) / len2));
  const px = x1 + dx * t, py = y1 + dy * t;
  return Math.hypot(px - cx, py - cy) <= r ? { x: px, y: py, t } : null;
}

// Compute exact physical circle-chord cut geometry from a swipe segment:
//   - offsetNorm in [-0.78, +0.78]: exact signed perpendicular distance of cut chord from fruit center
//   - chordRatio = sqrt(1 - offsetNorm^2): true circular cross-section radius ratio
//   - massNeg / massPos: exact 3D spherical-cap volume fractions (always sum to 1.0)
//   - cutMidX, cutMidY: world-space midpoint of the actual cut chord on the fruit
function computeCircleCutGeometry(x1, y1, x2, y2, cx, cy, r, hitR = r * 1.04) {
  const hit = segIntersectsCircle(x1, y1, x2, y2, cx, cy, hitR);
  if (!hit) return null;
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  const perpX = -uy, perpY = ux;
  const dPerp = (x1 - cx) * perpX + (y1 - cy) * perpY;
  const offsetNorm = Math.max(-0.76, Math.min(0.76, dPerp / Math.max(1, r)));
  const chordRatio = Math.sqrt(Math.max(0.14, 1 - offsetNorm * offsetNorm));

  // Exact 3D spherical-cap volume integral: V(h) / V_sphere = 0.25 * h^2 * (3 - h), h in [0..2]
  const hNeg = 1 + offsetNorm; // side = -1 occupies [-r .. offsetNorm*r]
  const hPos = 1 - offsetNorm; // side = +1 occupies [offsetNorm*r .. +r]
  const massNeg = Math.max(0.10, Math.min(0.90, 0.25 * hNeg * hNeg * (3 - hNeg)));
  const massPos = Math.max(0.10, Math.min(0.90, 0.25 * hPos * hPos * (3 - hPos)));

  return {
    hit,
    ux, uy,
    perpX, perpY,
    cutAngle: Math.atan2(uy, ux),
    offsetNorm,
    chordRatio,
    massNeg,
    massPos,
    cutMidX: cx + perpX * (offsetNorm * r),
    cutMidY: cy + perpY * (offsetNorm * r),
  };
}

function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w * 0.5, h * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawPhotoWholeFruit(ctx, x, y, r, key, rot = 0, alpha = 1) {
  const map = _photoMap;
  if (!map || !map[key]) return;
  const img = map[key].whole;
  const drawR = r * 1.136;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);

  ctx.fillStyle = 'rgba(72, 56, 40, 0.13)';
  ctx.beginPath();
  ctx.ellipse(r * 0.10, r * 0.17, r * 0.96, r * 0.88, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(54, 40, 28, 0.15)';
  ctx.beginPath();
  ctx.ellipse(r * 0.04, r * 0.08, r * 0.82, r * 0.76, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.rotate(rot);
  ctx.drawImage(img, -drawR, -drawR, drawR * 2, drawR * 2);
  ctx.restore();
}

// Physically-accurate off-center 3D spherical-cap sliced fruit renderer:
//   - Slices peel & exposed 3D cross-section right at `cutY = offsetNorm * r` with exact chord width `sqrt(1 - offsetNorm^2)`!
//   - Rotates cleanly around the piece's true physical center of mass (`pivotLocalY`)
//   - Projects true world-space down-right shadow & subtle 3D perspective lift from `zHeight`!
function drawPhotoSlicedHalf3D(
  ctx, x, y, r, key, cutAngle, side, rot,
  alpha = 1, openProg = 1.0, baseRot = 0, offsetNorm = 0, zHeight = 0, pivotLocalY = 0
) {
  const map = _photoMap;
  if (!map || !map[key]) return;
  const item = map[key];
  const drawR = r * 1.136;
  const openEase = 1 - Math.pow(1 - Math.max(0, Math.min(1, openProg)), 2.5);
  const tilt = 0.02 + 0.58 * openEase;
  const cutY = offsetNorm * r;
  const chordRatio = Math.sqrt(Math.max(0.14, 1 - offsetNorm * offsetNorm));
  const zLift = Math.max(0, zHeight);
  const zScale = 1 + Math.min(0.24, zLift / 380);
  const totalAng = cutAngle + rot;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);

  // 1. Soft photographic studio softbox cast shadow on matte alabaster (softens & spreads as zHeight lifts!)
  const shWx = r * 0.08 + zLift * 0.24;
  const shWy = r * 0.14 + zLift * 0.34;
  const shAlpha = Math.max(0.035, 0.14 * (1 - zLift / 240));
  const shR = r * (0.98 + zLift / 220) * (0.68 + 0.32 * chordRatio);
  ctx.save();
  ctx.translate(shWx, shWy);
  const shG = ctx.createRadialGradient(0, 0, shR * 0.15, 0, 0, shR);
  shG.addColorStop(0.0, `rgba(66, 50, 34, ${shAlpha})`);
  shG.addColorStop(0.55, `rgba(66, 50, 34, ${shAlpha * 0.52})`);
  shG.addColorStop(1.0, 'rgba(66, 50, 34, 0)');
  ctx.fillStyle = shG;
  ctx.beginPath();
  ctx.ellipse(0, 0, shR, shR * 0.88, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 2. Elevated 3D piece transform around true center of mass
  ctx.scale(zScale, zScale);
  ctx.rotate(totalAng);
  ctx.translate(0, -pivotLocalY);

  // Curved outer studio-photographed peel cap clipped at exact off-center chord `cutY`!
  ctx.save();
  ctx.beginPath();
  if (side < 0) ctx.rect(-drawR * 1.1, -drawR * 1.1, drawR * 2.2, drawR * 1.1 + cutY);
  else ctx.rect(-drawR * 1.1, cutY, drawR * 2.2, drawR * 1.1 - cutY);
  ctx.clip();
  ctx.rotate(baseRot - cutAngle);
  ctx.drawImage(item.whole, -drawR, -drawR, drawR * 2, drawR * 2);
  ctx.restore();

  // 3. Smoothly opening 3D perspective studio cross-section ellipse matching exact chord radius `r * chordRatio`!
  if (openEase > 0.02) {
    ctx.save();
    ctx.translate(0, cutY);
    ctx.scale(chordRatio, chordRatio * tilt);
    ctx.globalAlpha = alpha * Math.min(1, openEase * 1.75);
    ctx.drawImage(item.cut, -drawR, -drawR, drawR * 2, drawR * 2);
    ctx.restore();

    ctx.strokeStyle = `rgba(255, 255, 255, ${0.48 * openEase})`;
    ctx.lineWidth = Math.max(0.9, r * 0.026);
    ctx.beginPath();
    ctx.ellipse(0, cutY, r * 0.96 * chordRatio, r * 0.96 * chordRatio * tilt, 0, Math.PI * 1.08, Math.PI * 1.92);
    ctx.stroke();
  }

  ctx.restore();
}

function drawPhotoFlatCutHalf(ctx, x, y, r, key, cutAngle, side, rot, alpha = 1) {
  const map = _photoMap;
  if (!map || !map[key]) return;
  const item = map[key];
  const drawR = r * 1.136;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.rotate(cutAngle + rot);

  ctx.save();
  ctx.beginPath();
  if (side < 0) ctx.rect(-drawR * 1.1, -drawR * 1.1, drawR * 2.2, drawR * 1.1);
  else ctx.rect(-drawR * 1.1, 0, drawR * 2.2, drawR * 1.1);
  ctx.clip();
  ctx.drawImage(item.cut, -drawR, -drawR, drawR * 2, drawR * 2);
  ctx.restore();

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.72)';
  ctx.lineWidth = Math.max(1.2, r * 0.032);
  ctx.beginPath();
  ctx.moveTo(-r * 0.96, side < 0 ? -0.8 : 0.8);
  ctx.lineTo(r * 0.96, side < 0 ? -0.8 : 0.8);
  ctx.stroke();

  ctx.restore();
}

// Multi-plane recursively sliced real studio fruit chunk (quarters / wedges / eighths from mid-air COMBO! re-slices!)
// Intersects all accumulated local `clipPlanes` ([{ ang, offset, side }, ...]) over the real glistening studio cross-section PNG!
function drawPhotoSlicedChunk3D(
  ctx, x, y, r, key, rot, clipPlanes, zHeight = 0, pivotLocalX = 0, pivotLocalY = 0
) {
  const map = _photoMap;
  if (!map || !map[key]) return;
  const item = map[key];
  const drawR = r * 1.136;
  const zLift = Math.max(0, zHeight);
  const zScale = 1 + Math.min(0.26, zLift / 380);
  const depthScale = Math.max(0.52, 1 - (clipPlanes.length - 1) * 0.16);

  ctx.save();
  ctx.translate(x, y);

  // Soft studio cast shadow
  const shWx = r * 0.08 + zLift * 0.24;
  const shWy = r * 0.14 + zLift * 0.34;
  const shAlpha = Math.max(0.03, 0.13 * (1 - zLift / 240));
  const shR = r * depthScale * (0.95 + zLift / 220);
  ctx.save();
  ctx.translate(shWx, shWy);
  const shG = ctx.createRadialGradient(0, 0, shR * 0.12, 0, 0, shR);
  shG.addColorStop(0.0, `rgba(66, 50, 34, ${shAlpha})`);
  shG.addColorStop(0.55, `rgba(66, 50, 34, ${shAlpha * 0.48})`);
  shG.addColorStop(1.0, 'rgba(66, 50, 34, 0)');
  ctx.fillStyle = shG;
  ctx.beginPath();
  ctx.ellipse(0, 0, shR, shR * 0.86, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Elevated spinning fruit wedge around its centroid
  ctx.scale(zScale, zScale);
  ctx.rotate(rot);
  ctx.translate(-pivotLocalX, -pivotLocalY);

  // Intersect all cut half-planes in fruit-local coordinates!
  const big = drawR * 2.4;
  for (let i = 0; i < clipPlanes.length; i++) {
    const pl = clipPlanes[i];
    ctx.save();
    ctx.rotate(pl.ang);
    const cy = pl.offset * r;
    ctx.beginPath();
    if (pl.side < 0) ctx.rect(-big, -big, big * 2, big + cy);
    else ctx.rect(-big, cy, big * 2, big - cy);
    ctx.clip();
    ctx.rotate(-pl.ang);
  }

  // Real studio-photographed glistening fruit cross-section + outer rind arc
  ctx.drawImage(item.cut, -drawR, -drawR, drawR * 2, drawR * 2);

  // Crisp glossy wet highlight along the newest cut edge
  const lastPl = clipPlanes[clipPlanes.length - 1];
  if (lastPl) {
    ctx.save();
    ctx.rotate(lastPl.ang);
    const cy = lastPl.offset * r;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.72)';
    ctx.lineWidth = Math.max(1.1, r * 0.032);
    ctx.beginPath();
    ctx.moveTo(-r * 1.05, cy + (lastPl.side < 0 ? -0.7 : 0.7));
    ctx.lineTo( r * 1.05, cy + (lastPl.side < 0 ? -0.7 : 0.7));
    ctx.stroke();
    ctx.restore();
  }

  for (let i = 0; i < clipPlanes.length; i++) ctx.restore();
  ctx.restore();
}

// Photorealistic angular pie-sector wedge renderer (for Citrus Wedge Dial & soaring severed wedges!)
// Draws a crisp pie wedge from `startAng` to `endAng` clipped directly from the real studio `cut` cross-section PNG!
function drawPhotoSectorWedge3D(
  ctx, x, y, r, key, startAng, endAng, rot = 0, zHeight = 0, pivotLocalX = 0, pivotLocalY = 0
) {
  const map = _photoMap;
  if (!map || !map[key]) return;
  const item = map[key];
  const sweep = endAng - startAng;
  if (sweep <= 0.02) return;
  const drawR = r * 1.136;
  const zLift = Math.max(0, zHeight);
  const zScale = 1 + Math.min(0.24, zLift / 380);

  ctx.save();
  ctx.translate(x, y);

  // Soft directional studio shadow
  const shWx = r * 0.08 + zLift * 0.24;
  const shWy = r * 0.14 + zLift * 0.34;
  const shAlpha = Math.max(0.035, 0.14 * (1 - zLift / 240));
  const shR = r * (0.72 + 0.28 * Math.min(1, sweep / Math.PI)) * (1 + zLift / 220);
  ctx.save();
  ctx.translate(shWx, shWy);
  const shG = ctx.createRadialGradient(0, 0, shR * 0.12, 0, 0, shR);
  shG.addColorStop(0.0, `rgba(66, 50, 34, ${shAlpha})`);
  shG.addColorStop(0.55, `rgba(66, 50, 34, ${shAlpha * 0.48})`);
  shG.addColorStop(1.0, 'rgba(66, 50, 34, 0)');
  ctx.fillStyle = shG;
  ctx.beginPath();
  ctx.ellipse(0, 0, shR, shR * 0.88, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.scale(zScale, zScale);
  ctx.rotate(rot);
  ctx.translate(-pivotLocalX, -pivotLocalY);

  // Clip exact angular sector [startAng .. endAng] over the real glistening studio cross-section!
  ctx.save();
  ctx.beginPath();
  if (sweep >= Math.PI * 1.995) {
    ctx.arc(0, 0, drawR * 1.1, 0, Math.PI * 2);
  } else {
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, drawR * 1.15, startAng, endAng);
    ctx.closePath();
  }
  ctx.clip();
  ctx.drawImage(item.cut, -drawR, -drawR, drawR * 2, drawR * 2);
  ctx.restore();

  // Crisp glossy wet highlights along both freshly-cut radial edges
  if (sweep < Math.PI * 1.995) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.68)';
    ctx.lineWidth = Math.max(1.0, r * 0.028);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(startAng) * r * 0.98, Math.sin(startAng) * r * 0.98);
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(endAng) * r * 0.98, Math.sin(endAng) * r * 0.98);
    ctx.stroke();
  }

  ctx.restore();
}

// Named combo tiers & superlinear single-swipe scoring (bigger single-swipe chains earn dramatically more points!)
function getComboTierInfo(count) {
  const n = Math.max(1, Math.round(count));
  const names = {
    1: 'COMBO!',
    2: 'DOUBLE COMBO!',
    3: 'TRIPLE COMBO!',
    4: 'QUAD COMBO!',
    5: 'PENTA COMBO!',
    6: 'HEXA COMBO!',
    7: 'HEPTA COMBO!',
    8: 'OCTA COMBO!',
  };
  const pointsTable = [0, 100, 300, 650, 1200, 2000, 3200, 4800, 6800];
  const label = names[n] || `${n}× ULTRA COMBO!`;
  const points = n < pointsTable.length ? pointsTable[n] : 6800 + (n - 8) * 2400;
  return { count: n, label, points };
}

class StudioLiquidEngine {
  constructor(mount, opts = {}) {
    this.width = opts.width || 640;
    this.height = opts.height || 360;
    this.dpr = opts.dpr || Math.min(window.devicePixelRatio || 1, 2);
    this.audio = opts.audio || null;

    this.wrap = document.createElement('div');
    this.wrap.style.position = 'relative';
    this.wrap.style.width = '100%';
    this.wrap.style.height = '100%';
    this.wrap.style.userSelect = 'none';
    this.wrap.style.touchAction = 'none';
    this.wrap.style.cursor = 'crosshair';

    this.glEngine = new StudioFluidGL(this.width, this.height, this.dpr);
    this.canvas = this.glEngine.canvas;
    this.wrap.appendChild(this.canvas);
    mount.appendChild(this.wrap);

    const pxW = this.glEngine.pxW;
    const pxH = this.glEngine.pxH;

    this.boardCanvas = document.createElement('canvas');
    this.boardCanvas.width = pxW;
    this.boardCanvas.height = pxH;
    this._paintCeramicSurface();
    this.glEngine.uploadCeramicBase(this.boardCanvas);

    this.uiCanvas = document.createElement('canvas');
    this.uiCanvas.width = pxW;
    this.uiCanvas.height = pxH;
    this.uiCtx = this.uiCanvas.getContext('2d');

    this.overlayCanvas = document.createElement('canvas');
    this.overlayCanvas.width = pxW;
    this.overlayCanvas.height = pxH;
    this.ovCtx = this.overlayCanvas.getContext('2d');

    this._seed = opts.seed ?? Math.floor(Math.random() * 1e9);

    this.time = 0;
    this.slowMoAge = 10;
    this.slowMoDur = 0.26;
    this.shakeX = 0;
    this.shakeY = 0;
    this.shakeVx = 0;
    this.shakeVy = 0;

    this.trail = [];
    this.slicing = false;
    this.lastPt = null;
    this.strokeId = 0;
    this.strokeStartX = 0;
    this.strokeStartY = 0;

    // ── ORGANIC VISCOUS FLUID POPULATIONS ──
    this.floorPools = [];   // organic spreading lakes & curving viscous tongue beads (beadness = 0, domain-warped!)
    this.floorBeads = [];   // plump round & softly-oval glossy satellite beads (beadness = 1, crisp 3D surface-tension domes!)
    this.airBlobs = [];     // sinuous curving 3D airborne viscous ribbons & flying beads!
    this.seeds = [];
    this.mists = [];
    this.flashes = [];
    this.comboRings = [];   // optical expanding refractive shock-rings & micro-sparks on mid-air COMBO! hits
    this.comboPopups = [];  // editorial studio "COMBO!" / "2× COMBO!" popups
    this.scoopWaves = [];   // upward porcelain air-draft shimmer on bottom-up juggle scoop Easter egg
  }

  rand() {
    this._seed = (this._seed * 1664525 + 1013904223) >>> 0;
    return this._seed / 4294967296;
  }

  panForX(x) {
    return Math.max(-0.85, Math.min(0.85, (x - this.width * 0.5) / (this.width * 0.45)));
  }

  clearCeramic() {
    this.floorPools = [];
    this.floorBeads = [];
  }

  _paintCeramicSurface() {
    const c = this.boardCanvas.getContext('2d');
    const W = this.width, H = this.height;
    c.save();
    c.scale(this.dpr, this.dpr);

    const bg = c.createRadialGradient(W * 0.38, H * 0.30, 10, W * 0.5, H * 0.5, Math.max(W, H) * 0.80);
    bg.addColorStop(0.0, '#F8F4EE');
    bg.addColorStop(0.58, '#F1EAE0');
    bg.addColorStop(1.0, '#E6DDD0');
    c.fillStyle = bg;
    c.fillRect(0, 0, W, H);

    let st = 49131;
    const rn = () => { st = (st * 1664525 + 1013904223) >>> 0; return st / 4294967296; };
    for (let i = 0; i < 3600; i++) {
      const x = rn() * W, y = rn() * H;
      const a = 0.015 + rn() * 0.026;
      c.fillStyle = rn() > 0.5 ? `rgba(128, 108, 88, ${a})` : `rgba(255, 255, 255, ${a * 1.25})`;
      c.fillRect(x, y, 1.15, 1.15);
    }
    c.restore();
  }

  // Secondary subtle translucent wet puddle + micro-beads when a gently-cut fruit half kisses/bounces on the ceramic!
  spawnContactKiss(x, y, radius, fruit, strength = 0.5) {
    const [tr, tg, tb] = fruit.tintRGB;
    const st = Math.max(0.25, Math.min(1.0, strength));
    const count = 4 + Math.round(st * 4);
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + (this.rand() - 0.5) * 0.6;
      const spd = (18 + this.rand() * 48) * st;
      const rMax = (radius * (0.28 + this.rand() * 0.24)) * (0.75 + 0.35 * st);
      this.floorPools.push({
        x: x + Math.cos(a) * radius * 0.28,
        y: y + Math.sin(a) * radius * 0.28,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd,
        curl: (this.rand() - 0.5) * 1.4,
        r0: rMax * 0.45,
        rMax,
        aspect: 0.15 + this.rand() * 0.30,
        ang: a,
        drag: 9.2 + this.rand() * 2.2,
        density: 0.18 + 0.08 * st,
        tr, tg, tb,
        age: 0,
        life: 11.5 + this.rand() * 2.5,
      });
    }
    const beads = 4 + Math.round(st * 5);
    for (let i = 0; i < beads; i++) {
      const a = this.rand() * Math.PI * 2;
      const spd = (45 + this.rand() * 120) * st;
      this.floorBeads.push({
        x: x + Math.cos(a) * radius * 0.35,
        y: y + Math.sin(a) * radius * 0.35,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd,
        ang: a,
        aspect: 0.08 + this.rand() * 0.16,
        maxRad: (1.5 + this.rand() * 2.4) * (0.75 + 0.35 * st),
        drag: 7.5 + this.rand() * 2.0,
        density: 0.62,
        tr, tg, tb,
        age: 0,
        life: 11.0 + this.rand() * 2.5,
      });
    }
  }

  // Trigger real momentum-driven viscous fruit-nectar splat scaled by true swipe kinematics:
  //   - speed (px/s): slow draw-cut -> compact thick syrupy squeeze-out; fast whip -> asymmetric high-Weber forward jetting!
  //   - cutAng (rad): exact blade travel vector drives exit-side forward momentum conservation (55% -> 88% forward bias!)
  //   - offsetNorm (-0.76..0.76): off-center glancing cuts scale liquid volume by real chord area sqrt(1 - offsetNorm^2)!
  //   - curveRate (rad/s): curved wrist-flick bends curving syrup tongues & 3D airborne liquid ribbons along your arc!
  triggerMacroChop(x, y, dx, dy, fruit, opts = {}) {
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    const cutAng = Math.atan2(uy, ux);
    const scale = opts.scale ?? 1.0;
    const [tr, tg, tb] = fruit.tintRGB;

    // Real physical swipe telemetry
    const speed = opts.speed ?? 1100;
    const offsetNorm = opts.offsetNorm ?? 0;
    const curveRate = Math.max(-10, Math.min(10, opts.curveRate ?? 0));

    // Normalized kinetic energy E: ~0.10 (slow 320px/s draw-cut) .. 0.65 (crisp 1100px/s chop) .. 1.50 (2350px/s whip!)
    const E = Math.max(0.08, Math.min(1.65, (speed - 180) / 1450));
    const eClamp = Math.min(1.35, E);
    // Real cut cross-section volume factor (thin glancing edge shave = ~0.55; full dead-center cleave = 1.0)
    const vol = Math.sqrt(Math.max(0.18, 1 - offsetNorm * offsetNorm));
    // Momentum conservation: slow squeeze is fairly balanced (55%), fast whip jets strongly FORWARD along exit direction (88%!)
    const forwardBias = 0.54 + 0.34 * Math.min(1.0, E / 1.15);
    // Velocity reach multiplier: slow cuts ooze thick & syrupy right around the channel (0.48x), fast whips blast wide (1.45x)!
    const velScale = (0.48 + 0.72 * Math.pow(E, 0.82)) * (0.74 + 0.26 * vol);

    if (!opts.noSlowMo) {
      this.slowMoAge = 0;
      this.slowMoDur = 0.14 + 0.14 * Math.min(1.0, E);
    }

    const shAmp = (opts.shake ?? 1.35) * (0.35 + 0.85 * eClamp) * vol * scale;
    this.shakeVx += (-uy * (this.rand() > 0.5 ? 1 : -1) * 32 + ux * (22 + 24 * eClamp)) * (shAmp / 1.35);
    this.shakeVy += ( ux * (this.rand() > 0.5 ? 1 : -1) * 32 + uy * (22 + 24 * eClamp)) * (shAmp / 1.35);

    // 1. Fresh high-velocity splash physically displaces older different-colored pools right under the impact core
    const flushR = (75 + 42 * Math.min(1.1, E)) * vol * scale;
    for (let i = this.floorPools.length - 1; i >= 0; i--) {
      const p = this.floorPools[i];
      const diffCol = Math.abs(p.tr - tr) + Math.abs(p.tg - tg) + Math.abs(p.tb - tb);
      if (diffCol > 0.35) {
        const dist = Math.hypot(p.x - x, p.y - y);
        if (dist < flushR) {
          if (dist < flushR * 0.68) {
            this.floorPools.splice(i, 1);
          } else {
            p.density *= 0.45;
            p.age = Math.max(p.age, p.life * 0.72);
          }
        }
      }
    }

    // 2. Optical cleave specular flash (length & brightness scale directly with blade speed & chord width!)
    this.flashes.push({
      x, y, ux, uy,
      len: (opts.flashLen ?? (125 + 155 * eClamp)) * (0.65 + 0.35 * vol) * scale,
      width: (opts.flashWidth ?? (1.5 + 1.2 * eClamp)) * scale,
      tint: fruit.liquidLight,
      age: 0,
      life: 0.15 + 0.08 * Math.min(1, E),
    });

    // 3. ORGANIC VISCOUS CORE POOLS (compact slow syrupy ooze at low E -> directional forward-surging lake at high E!)
    const poolCount = Math.round((14 + 14 * Math.min(1.1, E)) * (0.62 + 0.38 * vol));
    for (let i = 0; i < poolCount; i++) {
      const a = (i / poolCount) * Math.PI * 2 + (this.rand() - 0.5) * 0.46;
      const cosFwd = Math.cos(a - cutAng); // +1 along exit vector, -1 along entry vector
      // Forward momentum skew: at high speed, exit side surges much farther than entry side!
      const dirGain = 0.55 + 0.45 * Math.abs(cosFwd) + (cosFwd > 0 ? 0.52 * eClamp * cosFwd : -0.18 * eClamp * (-cosFwd));
      const spd = (55 + this.rand() * 210) * Math.max(0.25, dirGain) * velScale * scale;
      const rMax = (17 + this.rand() * 22) * (0.76 + 0.28 * vol) * (1.06 - 0.14 * Math.min(1, E)) * scale;
      const curl = (this.rand() - 0.5) * 2.0 + curveRate * 0.22;
      this.floorPools.push({
        x: x + Math.cos(a) * (6 + this.rand() * 12) * vol * scale,
        y: y + Math.sin(a) * (6 + this.rand() * 12) * vol * scale,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd,
        curl,
        r0: rMax * 0.38,
        rMax,
        aspect: 0.12 + this.rand() * (0.28 + 0.24 * eClamp),
        ang: a + (this.rand() - 0.5) * 0.4,
        drag: (7.8 - 2.2 * Math.min(1.0, E)) + this.rand() * 2.2, // slow cuts brake thick & syrupy fast!
        density: 0.24 + this.rand() * 0.10,
        tr, tg, tb,
        age: 0,
        life: 13.5 + this.rand() * 2.5,
      });
    }

    // 4. CURVING UNDULATING VISCOUS SYRUP TONGUES (count, reach, forward bias & wrist curvature driven by real swipe!)
    const tongueCount = Math.round((4 + 8 * Math.min(1.25, E)) * (0.58 + 0.42 * vol));
    for (let t = 0; t < tongueCount; t++) {
      const isForward = this.rand() < forwardBias;
      const isSide = !isForward && this.rand() < 0.38;
      let baseAng, power;
      if (isForward) {
        // Tighter exit jet cone as swipe speed increases!
        const cone = 0.85 - 0.30 * Math.min(1.0, E);
        baseAng = cutAng + (this.rand() - 0.5) * cone;
        power = (0.95 + 0.52 * eClamp) * (0.85 + this.rand() * 0.38);
      } else if (!isSide) {
        // Entry backsplash — tighter and shorter on fast whips!
        baseAng = cutAng + Math.PI + (this.rand() - 0.5) * 0.72;
        power = (0.68 - 0.14 * Math.min(1.0, E)) * (0.80 + this.rand() * 0.38);
      } else {
        // Lateral squeeze-out perpendicular to the cut seam
        baseAng = cutAng + Math.PI * 0.5 + (t % 2 === 0 ? 0 : Math.PI) + (this.rand() - 0.5) * 0.90;
        power = (0.52 + 0.16 * eClamp) * (0.80 + this.rand() * 0.36);
      }

      // Wrist curvature visibly bends the viscous syrup tongues along your swipe arc!
      const natCurl = (this.rand() > 0.5 ? 1 : -1) * (1.1 + this.rand() * 1.9);
      const tongueCurl = natCurl * 0.65 + curveRate * 0.44;
      const maxTipSpd = (300 + this.rand() * 290) * power * velScale * scale;
      const beadsInChain = E < 0.32 ? 5 : 7;

      for (let b = 0; b < beadsInChain; b++) {
        const frac = (b + 1) / beadsInChain;
        const a = baseAng + tongueCurl * 0.085 * frac + Math.sin(frac * 5.0 + t * 1.7) * 0.09;
        const spd = maxTipSpd * (0.28 + 0.72 * Math.pow(frac, 0.88));
        const waist = 1.0 - 0.42 * Math.sin(frac * Math.PI);
        // High speed stretches tongues sleeker; slow cuts stay plumper & thicker!
        const thickMul = (1.12 - 0.24 * Math.min(1.1, E)) * (0.76 + 0.24 * vol);
        const rMax = (10.0 + (1 - frac) * 7.0 + (frac > 0.82 ? 3.2 : 0)) * waist * thickMul * (0.84 + this.rand() * 0.30) * scale;
        const drag = (6.6 - 1.5 * Math.min(1.0, E)) + (1 - frac) * 1.4 + this.rand() * 0.8;

        this.floorPools.push({
          x: x + Math.cos(a) * (10 + frac * 12) * vol * scale,
          y: y + Math.sin(a) * (10 + frac * 12) * vol * scale,
          vx: Math.cos(a) * spd,
          vy: Math.sin(a) * spd,
          curl: tongueCurl * (0.55 + 0.45 * frac),
          r0: rMax * 0.44,
          rMax,
          aspect: 0.18 + this.rand() * (0.28 + 0.20 * eClamp),
          ang: a,
          drag,
          density: 0.34 + frac * 0.12,
          tr, tg, tb,
          age: 0,
          life: 13.0 + this.rand() * 2.5,
        });
      }

      // Detached plump glossy satellite bead ahead of the tongue's weeping tip (only when speed is high enough to detach!)
      if (E > 0.22 || this.rand() < 0.45) {
        const tipA = baseAng + tongueCurl * 0.15 + (this.rand() - 0.5) * 0.12;
        const tipSpd = maxTipSpd * (1.14 + this.rand() * 0.22);
        const dropR = (4.2 + this.rand() * 4.0) * (1.08 - 0.20 * Math.min(1, E)) * scale;
        this.floorBeads.push({
          x: x + Math.cos(tipA) * 20 * vol * scale,
          y: y + Math.sin(tipA) * 20 * vol * scale,
          vx: Math.cos(tipA) * tipSpd,
          vy: Math.sin(tipA) * tipSpd,
          ang: tipA,
          aspect: 0.10 + this.rand() * 0.22,
          maxRad: dropR,
          drag: 5.4 - 0.8 * Math.min(1, E) + this.rand() * 1.4,
          density: 0.62,
          tr, tg, tb,
          age: 0,
          life: 13.0 + this.rand() * 2.5,
        });
      }
    }

    // 5. WEBER-SCALED GLOSSY SATELLITE BEADS (slow cut = ~24 big plump beads close in; fast whip = ~125 fine directional spray!)
    const beadTotal = Math.round((20 + 82 * Math.min(1.4, E)) * (0.52 + 0.48 * vol));
    for (let i = 0; i < beadTotal; i++) {
      const along = i < beadTotal * (0.62 + 0.24 * Math.min(1, E));
      const isFwd = this.rand() < forwardBias;
      const sideOff = isFwd ? 0 : Math.PI;
      const cone = isFwd ? (1.15 - 0.32 * Math.min(1.0, E)) : 1.05;
      const a = cutAng + (along ? sideOff : 0) + (this.rand() - 0.5) * (along ? cone : Math.PI * 2);

      // Higher Weber number atomizes into finer high-speed droplets; slow cuts stay plumper & slower!
      const u = this.rand();
      const fwdSpdMul = isFwd ? (1.05 + 0.35 * eClamp) : (0.62 + 0.15 * eClamp);
      const sizeAtom = 1.12 - 0.26 * Math.min(1.2, E);
      let dropR, spd, drag;
      if (u > 0.86) {
        dropR = (4.8 + this.rand() * 3.4) * sizeAtom * scale;
        spd = (190 + this.rand() * 320) * velScale * fwdSpdMul * scale;
        drag = 5.2 + this.rand() * 1.4;
      } else if (u > 0.56) {
        dropR = (2.6 + this.rand() * 2.2) * sizeAtom * scale;
        spd = (240 + this.rand() * 440) * velScale * fwdSpdMul * scale;
        drag = 4.8 + this.rand() * 1.6;
      } else {
        dropR = (1.2 + this.rand() * 1.3) * sizeAtom * scale;
        spd = (280 + this.rand() * 580) * velScale * fwdSpdMul * scale;
        drag = 4.4 + this.rand() * 2.0;
      }

      this.floorBeads.push({
        x: x + (this.rand() - 0.5) * 22 * vol * scale,
        y: y + (this.rand() - 0.5) * 22 * vol * scale,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd,
        ang: a + (this.rand() - 0.5) * 0.28,
        aspect: 0.04 + this.rand() * (0.16 + 0.16 * eClamp),
        maxRad: Math.max(1.1, dropR),
        drag,
        density: 0.66,
        tr, tg, tb,
        age: 0,
        life: 12.5 + this.rand() * 2.8,
      });
    }

    // 6. SINUOUS CURVING 3D AIRBORNE VISCOUS RIBBONS & FLYING BEADS (directly driven by forward speed & wrist curve!)
    const airWhips = [
      { dir: cutAng + 0.08,           curl: -1.6 + curveRate * 0.52, spd: 410, rHead: 8.6, z0: 34, vz: 155, fwd: true },
      { dir: cutAng - 0.26,           curl:  1.4 + curveRate * 0.48, spd: 365, rHead: 7.4, z0: 32, vz: 140, fwd: true },
      { dir: cutAng + 0.34,           curl: -1.4 + curveRate * 0.45, spd: 340, rHead: 6.8, z0: 30, vz: 130, fwd: true },
      { dir: cutAng + Math.PI - 0.08, curl:  1.7 + curveRate * 0.25, spd: 255, rHead: 6.4, z0: 26, vz: 105, fwd: false },
    ];
    // Slow gentle cuts only loft 2 compact low ribbons; medium/fast cuts unleash all 4 sweeping forward ribbons!
    const activeWhips = E < 0.28 ? airWhips.slice(0, 2) : airWhips;
    for (const aw of activeWhips) {
      const chainN = E < 0.30 ? 5 : 7;
      const whipVelMul = aw.fwd ? (0.42 + 0.82 * eClamp) : (0.40 + 0.42 * eClamp);
      for (let k = 0; k < chainN; k++) {
        const frac = k / (chainN - 1);
        const a = aw.dir + (frac - 0.35) * aw.curl * 0.14 + (this.rand() - 0.5) * 0.06;
        const spd = aw.spd * whipVelMul * (1.06 - frac * 0.50) * (0.78 + 0.22 * vol) * scale;
        const r = aw.rHead * (1.0 - frac * 0.52) * (0.76 + 0.24 * vol) * (0.88 + this.rand() * 0.24) * scale;
        this.airBlobs.push({
          x: x + Math.cos(a) * (8 + (1 - frac) * 16) * vol * scale,
          y: y + Math.sin(a) * (8 + (1 - frac) * 16) * vol * scale,
          vx: Math.cos(a) * spd,
          vy: Math.sin(a) * spd,
          z: (aw.z0 * (0.55 + 0.55 * eClamp) - frac * 10) * scale,
          vz: (aw.vz * (0.45 + 0.72 * eClamp) * (1.0 - frac * 0.32)) * scale,
          curl: aw.curl * (1.0 - frac * 0.22),
          drag: 1.8 + frac * 0.65,
          maxRad: r,
          aspect: 0.38 + (1 - frac) * (0.28 + 0.16 * eClamp),
          beadness: 0.0,
          density: 0.52,
          tr, tg, tb,
          age: 0,
          life: 0.52 + 0.24 * Math.min(1.2, E) + this.rand() * 0.18,
        });
      }
    }

    const flyBeads = Math.round((10 + 30 * Math.min(1.3, E)) * (0.55 + 0.45 * vol));
    for (let i = 0; i < flyBeads; i++) {
      const isFwd = this.rand() < forwardBias;
      const a = cutAng + (isFwd ? 0 : Math.PI) + (this.rand() - 0.5) * (isFwd ? 0.95 : 1.55);
      const szU = Math.pow(this.rand(), 1.85);
      const r = (1.9 + szU * 4.2) * (1.08 - 0.18 * Math.min(1.1, E)) * scale;
      const spd = (175 + (1 - szU * 0.38) * 340) * velScale * (isFwd ? 1.15 : 0.68) * scale;
      this.airBlobs.push({
        x: x + (this.rand() - 0.5) * 18 * vol * scale,
        y: y + (this.rand() - 0.5) * 18 * vol * scale,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd,
        z: (18 + this.rand() * 24) * (0.65 + 0.45 * eClamp) * scale,
        vz: (72 + this.rand() * 140) * (0.50 + 0.68 * eClamp) * scale,
        curl: curveRate * 0.24 + (this.rand() - 0.5) * 0.45,
        drag: 1.30 + this.rand() * 0.48,
        maxRad: r,
        aspect: 0.10 + szU * 0.18,
        beadness: 1.0,
        density: 0.66,
        tr, tg, tb,
        age: 0,
        life: 0.56 + 0.24 * Math.min(1.2, E) + this.rand() * 0.24,
      });
    }

    // Gentle population caps across multiple chops
    if (this.floorPools.length > 280) this.floorPools.splice(0, this.floorPools.length - 280);
    if (this.floorBeads.length > 380) this.floorBeads.splice(0, this.floorBeads.length - 380);

    // 7. Delicate sunlit aerosol mist & real tumbling fruit seeds (momentum-biased along blade exit!)
    if (E > 0.24) {
      this.mists.push({
        x: x + ux * (8 + 12 * eClamp) * scale,
        y: y + uy * (8 + 12 * eClamp) * scale,
        vx: ux * (38 + 65 * eClamp) * scale,
        vy: uy * (38 + 65 * eClamp) * scale,
        r0: 14 * scale,
        rMax: (62 + 44 * eClamp) * vol * scale,
        color: fruit.mist,
        age: 0,
        life: 0.30 + 0.10 * Math.min(1, E),
      });
    }

    if (fruit.seed) {
      const seedN = Math.round((4 + 6 * Math.min(1.2, E)) * (0.55 + 0.45 * vol));
      for (let i = 0; i < seedN; i++) {
        const isFwd = this.rand() < forwardBias;
        const a = cutAng + (isFwd ? 0 : Math.PI) + (this.rand() - 0.5) * 1.25;
        const spd = (120 + this.rand() * 250) * velScale * (isFwd ? 1.15 : 0.65) * scale;
        this.seeds.push({
          x: x + (this.rand() - 0.5) * 18 * vol * scale,
          y: y + (this.rand() - 0.5) * 18 * vol * scale,
          vx: Math.cos(a) * spd,
          vy: Math.sin(a) * spd - (24 + 32 * eClamp) * scale,
          r: (2.5 + this.rand() * 0.8) * scale,
          color: fruit.seed,
          rot: this.rand() * Math.PI * 2,
          vrot: (this.rand() - 0.5) * (7 + 8 * eClamp) + curveRate * 0.6,
          age: 0,
          life: 0.78 + this.rand() * 0.35,
        });
      }
    }

    if (this.audio) {
      this.audio.playMacroChop(this.panForX(x), fruit.key === 'watermelon', E, vol);
    }
  }

  // 360° Radial Hydraulic Viscous Crown Burst (for Press-to-Burst Fig Pedestal!)
  triggerHydraulicBurst(x, y, fruit, opts = {}) {
    const scale = opts.scale || 1.0;
    const ringR = (opts.ringR || 54) * scale;
    const [tr, tg, tb] = fruit.tintRGB;

    this.slowMoAge = 0;
    this.slowMoDur = 0.24;
    this.shakeVx += (this.rand() - 0.5) * 40 * scale;
    this.shakeVy += 42 * scale;

    // 1. 10 organic curving radial viscous nectar lobes pooling gracefully around the porcelain pedestal rim!
    const lobeN = 10;
    for (let i = 0; i < lobeN; i++) {
      const a = (i / lobeN) * Math.PI * 2 + (this.rand() - 0.5) * 0.28;
      const spd = (115 + this.rand() * 145) * scale;
      const sx = x + Math.cos(a) * (ringR * 0.72);
      const sy = y + Math.sin(a) * (ringR * 0.72);
      this.floorPools.push({
        x: sx, y: sy,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd,
        curl: (this.rand() - 0.5) * 1.6,
        r0: (10 + this.rand() * 5) * scale,
        rMax: (22 + this.rand() * 13) * scale,
        aspect: 0.26 + this.rand() * 0.22,
        ang: a,
        drag: 5.2 + this.rand() * 1.4,
        density: 0.44 + this.rand() * 0.08,
        tr, tg, tb,
        age: 0,
        life: 14.5 + this.rand() * 2.5,
      });
    }

    // 2. 34 plump round surface-tension satellite beads radiating cleanly around 360°
    for (let i = 0; i < 34; i++) {
      const a = this.rand() * Math.PI * 2;
      const u = this.rand();
      const dropR = (u > 0.80 ? (4.6 + this.rand() * 3.0) : (1.5 + this.rand() * 2.6)) * scale;
      const spd = (180 + this.rand() * 360) * scale;
      this.floorBeads.push({
        x: x + Math.cos(a) * (ringR * (0.65 + this.rand() * 0.35)),
        y: y + Math.sin(a) * (ringR * (0.65 + this.rand() * 0.35)),
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd,
        ang: a,
        aspect: 0.08 + this.rand() * 0.16,
        maxRad: dropR,
        drag: 4.8 + this.rand() * 1.6,
        density: 0.68,
        tr, tg, tb,
        age: 0,
        life: 13.5 + this.rand() * 2.5,
      });
    }

    // 3. 32 lofted 3D radial arcing viscous crown droplets that land and wet-bond onto the alabaster slab!
    for (let i = 0; i < 32; i++) {
      const a = (i / 32) * Math.PI * 2 + (this.rand() - 0.5) * 0.14;
      const isCrown = i % 3 === 0;
      const spd = (isCrown ? (190 + this.rand() * 160) : (230 + this.rand() * 240)) * scale;
      this.airBlobs.push({
        x: x + Math.cos(a) * (ringR * 0.78),
        y: y + Math.sin(a) * (ringR * 0.78),
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd,
        z: (22 + this.rand() * 22) * scale,
        vz: (110 + this.rand() * 135) * scale,
        curl: (this.rand() - 0.5) * 0.7,
        drag: isCrown ? 2.1 : 1.5,
        maxRad: (isCrown ? (5.2 + this.rand() * 2.6) : (2.0 + this.rand() * 2.8)) * scale,
        aspect: isCrown ? 0.36 : 0.14,
        beadness: isCrown ? 0.0 : 1.0,
        density: isCrown ? 0.54 : 0.68,
        tr, tg, tb,
        age: 0,
        life: 0.64 + this.rand() * 0.24,
      });
    }

    this.mists.push({
      x, y, vx: 0, vy: 0,
      r0: ringR * 0.45,
      rMax: ringR * 2.15,
      color: fruit.mist,
      age: 0,
      life: 0.36,
    });

    if (fruit.seed) {
      for (let i = 0; i < 9; i++) {
        const a = this.rand() * Math.PI * 2;
        const spd = (140 + this.rand() * 190) * scale;
        this.seeds.push({
          x: x + Math.cos(a) * 16 * scale,
          y: y + Math.sin(a) * 16 * scale,
          vx: Math.cos(a) * spd,
          vy: Math.sin(a) * spd - 26 * scale,
          r: (2.2 + this.rand() * 0.8) * scale,
          color: fruit.seed,
          rot: this.rand() * Math.PI * 2,
          vrot: (this.rand() - 0.5) * 11,
          age: 0,
          life: 0.82 + this.rand() * 0.30,
        });
      }
    }

    if (this.floorPools.length > 280) this.floorPools.splice(0, this.floorPools.length - 280);
    if (this.floorBeads.length > 380) this.floorBeads.splice(0, this.floorBeads.length - 380);

    if (this.audio && typeof this.audio.playHydraulicBurst === 'function') {
      this.audio.playHydraulicBurst(this.panForX(x));
    } else if (this.audio) {
      this.audio.playMacroChop(this.panForX(x), true, 1.15, 1.0);
    }
  }

  // Delicate upward kinetic shimmer + rising droplet trail for the bottom-up juggle-scoop Easter egg!
  triggerScoopEffect(x, y, scale = 1.0) {
    this.scoopWaves.push({
      x, y,
      scale,
      age: 0,
      life: 0.42,
    });
    if (this.audio) {
      this.audio.playUpwardScoop(this.panForX(x));
    }
  }

  // Shed a couple of glistening airborne droplets off a newly launched juggled piece
  spawnDripTrail(x, y, vx, vy, fruit, count = 4, scale = 1.0) {
    const [tr, tg, tb] = fruit.tintRGB;
    for (let i = 0; i < count; i++) {
      this.airBlobs.push({
        x: x + (this.rand() - 0.5) * 18 * scale,
        y: y + (this.rand() - 0.5) * 18 * scale,
        vx: vx * (0.45 + this.rand() * 0.35) + (this.rand() - 0.5) * 90 * scale,
        vy: vy * (0.45 + this.rand() * 0.35) + (this.rand() - 0.5) * 80 * scale,
        z: (18 + this.rand() * 20) * scale,
        vz: (75 + this.rand() * 85) * scale,
        curl: (this.rand() - 0.5) * 1.1,
        drag: 1.5,
        maxRad: (2.2 + this.rand() * 2.6) * scale,
        aspect: 0.20,
        beadness: 1.0,
        density: 0.66,
        tr, tg, tb,
        age: 0,
        life: 0.62 + this.rand() * 0.25,
      });
    }
  }

  // Expressive gallery-grade named COMBO! ("DOUBLE COMBO!", "TRIPLE COMBO!", "QUAD COMBO!", "PENTA COMBO!", ...)
  // + big escalating point award (+300, +650, +1,200, +2,000...) + concentric optical shock-rings & micro-sparks!
  triggerComboEffect(x, y, comboCount, awardPoints, fruit, cutAngle = 0, scale = 1.0) {
    const info = getComboTierInfo(comboCount);
    const pts = awardPoints ?? info.points;
    const px = Math.max(132 * scale, Math.min(this.width - 132 * scale, x));
    const py = Math.max(66 * scale, Math.min(this.height - 64 * scale, y - 18 * scale));

    // 1. Concentric refractive shock-ring + radiating studio specular micro-sparks (richer & wider for Triple / Quad / Penta+!)
    const sparks = [];
    const sparkN = 10 + Math.min(18, comboCount * 3);
    for (let i = 0; i < sparkN; i++) {
      const a = (i / sparkN) * Math.PI * 2 + (this.rand() - 0.5) * 0.22;
      sparks.push({
        ang: a,
        r0: (14 + this.rand() * 10) * scale,
        r1: (60 + this.rand() * 50 + Math.min(6, comboCount) * 12) * scale,
        len: (6 + this.rand() * 8 + Math.min(4, comboCount) * 1.2) * scale,
        gold: comboCount >= 3 && (i % 3 === 0),
      });
    }
    this.comboRings.push({
      x, y,
      rMax: (76 + Math.min(6, comboCount) * 16) * scale,
      accent: fruit.accent,
      light: fruit.liquidLight,
      tier: comboCount,
      sparks,
      age: 0,
      life: 0.52 + Math.min(0.18, comboCount * 0.03),
    });

    // 2. Editorial bold display headline + points: upgrades in-place on rapid multi-piece sweeps (ZERO overlapping text!)
    this.comboPopups = [];
    const tilt = Math.max(-0.08, Math.min(0.08, Math.sin(cutAngle) * 0.075));
    this.comboPopups.push({
      x: px,
      y: py,
      text: info.label,
      ptsText: `+${pts.toLocaleString()}`,
      accent: fruit.accent,
      light: fruit.liquidLight,
      comboCount,
      tilt,
      scale,
      age: 0,
      life: 1.32 + Math.min(0.35, comboCount * 0.06),
    });

    if (this.audio) {
      this.audio.playComboChime(comboCount, this.panForX(x));
    }
  }

  beginStroke(x, y) {
    if (this.audio) this.audio.unlock();
    this.slicing = true;
    this.strokeId += 1;
    this.strokeStartX = x;
    this.strokeStartY = y;
    this.trail = [{ x, y, t: this.time, speed: 0 }];
    this.lastPt = { x, y, t: this.time };
  }

  // Rolling 45ms kinematic window: yields true smoothed velocity (vx, vy, speed) + signed angular wrist curvature (curveRate)!
  moveStroke(x, y) {
    if (!this.slicing || !this.lastPt) return null;
    const dx = x - this.lastPt.x, dy = y - this.lastPt.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1.8) return null;

    const instDt = Math.max(0.008, this.time - this.lastPt.t);
    const instSpeed = dist / instDt;
    this.trail.push({ x, y, t: this.time, speed: instSpeed });
    if (this.trail.length > 32) this.trail.shift();

    // Compute smoothed velocity over the last ~42ms of stroke history (eliminates single-frame jitter!)
    let winIdx = Math.max(0, this.trail.length - 2);
    while (winIdx > 0 && (this.time - this.trail[winIdx].t) < 0.042) {
      winIdx--;
    }
    const pWin = (this.trail.length >= 2 ? this.trail[winIdx] : this.lastPt) || this.lastPt;
    const winDt = Math.max(0.012, this.time - pWin.t);
    const vx = (x - pWin.x) / winDt;
    const vy = (y - pWin.y) / winDt;
    const speed = Math.hypot(vx, vy);

    // Compute signed wrist curvature rate (dTheta / dt in rad/s) across the last ~70ms of stroke!
    let curveRate = 0;
    if (this.trail.length >= 4) {
      const n = this.trail.length;
      const pA = this.trail[Math.max(0, n - 5)];
      const pB = this.trail[Math.max(0, n - 3)];
      const pC = this.trail[n - 1];
      const v1x = pB.x - pA.x, v1y = pB.y - pA.y;
      const v2x = pC.x - pB.x, v2y = pC.y - pB.y;
      const l1 = Math.hypot(v1x, v1y), l2 = Math.hypot(v2x, v2y);
      if (l1 > 4 && l2 > 4) {
        const cross = (v1x * v2y - v1y * v2x) / (l1 * l2);
        const dot = Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y) / (l1 * l2)));
        const dTheta = Math.atan2(cross, dot);
        const cDt = Math.max(0.025, pC.t - pA.t);
        curveRate = Math.max(-12, Math.min(12, dTheta / cDt));
      }
    }

    const seg = {
      x1: this.lastPt.x, y1: this.lastPt.y,
      x2: x, y2: y,
      dx, dy, dist,
      vx, vy, speed,
      curveRate,
      strokeId: this.strokeId,
      startX: this.strokeStartX,
      startY: this.strokeStartY,
      totalDx: x - this.strokeStartX,
      totalDy: y - this.strokeStartY,
    };

    if (speed > 620 && this.audio) {
      this.audio.playSliceAir(Math.min(1, speed / 1800), this.panForX(x));
    }
    this.lastPt = { x, y, t: this.time };
    return seg;
  }

  endStroke() {
    this.slicing = false;
    this.lastPt = null;
  }

  step(dt) {
    const h = Math.min(0.033, Math.max(0.001, dt));
    this.time += h;

    while (this.trail.length > 0 && (this.time - this.trail[0].t) > 0.14) {
      this.trail.shift();
    }

    // Critically-damped smooth recoil settle
    this.shakeVx += (-this.shakeX * 380 - this.shakeVx * 35) * h;
    this.shakeVy += (-this.shakeY * 380 - this.shakeVy * 35) * h;
    this.shakeX += this.shakeVx * h;
    this.shakeY += this.shakeVy * h;

    for (let i = this.flashes.length - 1; i >= 0; i--) {
      this.flashes[i].age += h;
      if (this.flashes[i].age >= this.flashes[i].life) this.flashes.splice(i, 1);
    }
    for (let i = this.comboRings.length - 1; i >= 0; i--) {
      this.comboRings[i].age += h;
      if (this.comboRings[i].age >= this.comboRings[i].life) this.comboRings.splice(i, 1);
    }
    for (let i = this.comboPopups.length - 1; i >= 0; i--) {
      this.comboPopups[i].age += h;
      if (this.comboPopups[i].age >= this.comboPopups[i].life) this.comboPopups.splice(i, 1);
    }
    for (let i = this.scoopWaves.length - 1; i >= 0; i--) {
      this.scoopWaves[i].age += h;
      if (this.scoopWaves[i].age >= this.scoopWaves[i].life) this.scoopWaves.splice(i, 1);
    }

    // Silky C2 continuous time-dilation breath (NEVER drops to 0 -> zero frozen frames!)
    let timeScale = 1.0;
    if (this.slowMoAge < this.slowMoDur) {
      this.slowMoAge += h;
      const u = Math.min(1, this.slowMoAge / this.slowMoDur);
      const bell = Math.sin(u * Math.PI);
      timeScale = 1.0 - 0.38 * bell * bell;
    }
    const simH = h * timeScale;

    // 1. Step organic viscous pools & curving tongue lobes (heavy syrupy drag + gentle curl!)
    for (let i = this.floorPools.length - 1; i >= 0; i--) {
      const p = this.floorPools[i];
      p.age += simH;
      if (p.age >= p.life) { this.floorPools.splice(i, 1); continue; }
      const d = Math.exp(-p.drag * simH);
      const cx = -p.vy * p.curl * simH;
      const cy =  p.vx * p.curl * simH;
      p.vx = (p.vx + cx) * d;
      p.vy = (p.vy + cy) * d;
      p.x += p.vx * simH;
      p.y += p.vy * simH;
      if (p.vx * p.vx + p.vy * p.vy > 25) {
        p.ang = Math.atan2(p.vy, p.vx);
      }
    }

    // 2. Step plump round & softly-oval satellite beads
    for (let i = this.floorBeads.length - 1; i >= 0; i--) {
      const b = this.floorBeads[i];
      b.age += simH;
      if (b.age >= b.life) { this.floorBeads.splice(i, 1); continue; }
      const d = Math.exp(-b.drag * simH);
      b.vx *= d;
      b.vy *= d;
      b.x += b.vx * simH;
      b.y += b.vy * simH;
    }

    // 3. Step sinuous curving 3D airborne ribbons & flying beads (seamless floor wet-bond on landing!)
    const gravZ = 860;
    for (let i = this.airBlobs.length - 1; i >= 0; i--) {
      const p = this.airBlobs[i];
      p.age += simH;
      if (p.age >= p.life) { this.airBlobs.splice(i, 1); continue; }
      const d = Math.exp(-p.drag * simH);
      const cx = -p.vy * p.curl * simH;
      const cy =  p.vx * p.curl * simH;
      p.vx = (p.vx + cx) * d;
      p.vy = (p.vy + cy + 88 * simH) * d;
      p.x += p.vx * simH;
      p.y += p.vy * simH;

      p.vz -= gravZ * simH;
      p.z += p.vz * simH;

      if (p.z <= 0) {
        if (p.x > -24 && p.x < this.width + 24 && p.y > -24 && p.y < this.height + 24) {
          const ang = Math.atan2(p.vy, p.vx);
          if (p.beadness < 0.5 && p.maxRad > 5.0) {
            // Larger ribbon globs spread into a small organic ceramic puddle lobe on impact!
            this.floorPools.push({
              x: p.x, y: p.y,
              vx: p.vx * 0.22, vy: p.vy * 0.22,
              curl: p.curl * 0.2,
              r0: p.maxRad * 0.95,
              rMax: p.maxRad * 1.65,
              aspect: 0.25,
              ang,
              drag: 8.5,
              density: 0.42,
              tr: p.tr, tg: p.tg, tb: p.tb,
              age: 0,
              life: 11.5 + this.rand() * 2.5,
            });
          } else {
            // Flying beads settle cleanly as crisp glossy 3D satellite beads!
            this.floorBeads.push({
              x: p.x, y: p.y,
              vx: p.vx * 0.18, vy: p.vy * 0.18,
              ang,
              aspect: 0.14,
              maxRad: Math.max(1.6, p.maxRad * 1.05),
              drag: 9.0,
              density: 0.66,
              tr: p.tr, tg: p.tg, tb: p.tb,
              age: 0,
              life: 11.5 + this.rand() * 2.5,
            });
          }
        }
        this.airBlobs.splice(i, 1);
      }
    }

    // 4. Step subtle sunlit aerosol mist & spinning seeds
    for (let i = this.mists.length - 1; i >= 0; i--) {
      const m = this.mists[i];
      m.age += simH;
      if (m.age >= m.life) { this.mists.splice(i, 1); continue; }
      m.x += m.vx * simH; m.y += m.vy * simH;
      m.vx *= Math.exp(-3.2 * simH); m.vy *= Math.exp(-3.2 * simH);
    }
    for (let i = this.seeds.length - 1; i >= 0; i--) {
      const sd = this.seeds[i];
      sd.age += simH;
      if (sd.age >= sd.life) { this.seeds.splice(i, 1); continue; }
      const d = Math.exp(-1.5 * simH);
      sd.vx *= d; sd.vy = sd.vy * d + 390 * simH;
      sd.x += sd.vx * simH; sd.y += sd.vy * simH;
      sd.rot += sd.vrot * simH;
    }

    return simH;
  }

  beginRender() {
    const ctx = this.uiCtx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.uiCanvas.width, this.uiCanvas.height);
    ctx.save();
    ctx.scale(this.dpr, this.dpr);
    ctx.translate(this.shakeX, this.shakeY);
    return ctx;
  }

  renderMidSplashes() {}

  endRender() {
    this.uiCtx.restore();

    const octx = this.ovCtx;
    octx.setTransform(1, 0, 0, 1, 0, 0);
    octx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
    octx.save();
    octx.scale(this.dpr, this.dpr);
    octx.translate(this.shakeX, this.shakeY);

    // 1. Subtle backlit aerosol mist veil
    for (const m of this.mists) {
      const u = m.age / m.life;
      const ease = 1 - Math.pow(1 - u, 2.5);
      const r = m.r0 + (m.rMax - m.r0) * ease;
      const a = Math.pow(1 - u, 1.7) * 0.14;
      const g = octx.createRadialGradient(m.x, m.y, r * 0.05, m.x, m.y, r);
      g.addColorStop(0, m.color);
      g.addColorStop(0.55, m.color);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      octx.save();
      octx.globalAlpha = a;
      octx.fillStyle = g;
      octx.beginPath();
      octx.arc(m.x, m.y, r, 0, Math.PI * 2);
      octx.fill();
      octx.restore();
    }

    // 2. Real spinning teardrop fruit seeds
    for (const sd of this.seeds) {
      const a = Math.min(1, (1 - sd.age / sd.life) * 2.4);
      octx.save();
      octx.globalAlpha = a;
      octx.translate(sd.x, sd.y);
      octx.rotate(sd.rot);
      octx.fillStyle = sd.color;
      octx.beginPath();
      octx.ellipse(0, 0, sd.r * 1.35, sd.r * 0.70, 0, 0, Math.PI * 2);
      octx.fill();
      octx.fillStyle = 'rgba(255,255,255,0.72)';
      octx.beginPath();
      octx.arc(-sd.r * 0.3, -sd.r * 0.2, sd.r * 0.24, 0, Math.PI * 2);
      octx.fill();
      octx.restore();
    }

    // 3. Delicate tapered optical cleave specular flash
    for (const fl of this.flashes) {
      const u = fl.age / fl.life;
      const alpha = Math.pow(1 - u, 1.85);
      const curLen = fl.len * (0.76 + 0.36 * Math.sin(Math.min(1, u * 3.2) * Math.PI * 0.5));
      const w = fl.width * (1 - u * 0.78);
      octx.save();
      octx.translate(fl.x, fl.y);
      octx.rotate(Math.atan2(fl.uy, fl.ux));

      octx.globalAlpha = alpha * 0.30;
      octx.fillStyle = fl.tint;
      octx.beginPath();
      octx.moveTo(-curLen, 0);
      octx.quadraticCurveTo(0, -w * 2.6, curLen, 0);
      octx.quadraticCurveTo(0, w * 2.6, -curLen, 0);
      octx.fill();

      octx.globalAlpha = alpha * 0.92;
      octx.fillStyle = '#FFFFFF';
      octx.beginPath();
      octx.moveTo(-curLen * 0.94, 0);
      octx.quadraticCurveTo(0, -w, curLen * 0.94, 0);
      octx.quadraticCurveTo(0, w, -curLen * 0.94, 0);
      octx.fill();
      octx.restore();
    }

    // 4. Upward bottom-scoop kinetic shimmer arc (Easter egg visual confirmation!)
    for (const sw of this.scoopWaves) {
      const u = sw.age / sw.life;
      const ease = 1 - Math.pow(1 - u, 3);
      const alpha = Math.sin(Math.min(1, u) * Math.PI) * 0.72;
      const yCur = sw.y - ease * 135 * sw.scale;
      const rad = (54 + ease * 85) * sw.scale;
      octx.save();
      octx.globalAlpha = alpha;
      octx.strokeStyle = '#FFFFFF';
      octx.lineWidth = (3.2 * (1 - u * 0.65)) * sw.scale;
      octx.lineCap = 'round';
      octx.beginPath();
      octx.arc(sw.x, yCur + rad * 0.55, rad, Math.PI * 1.18, Math.PI * 1.82);
      octx.stroke();

      octx.globalAlpha = alpha * 0.45;
      octx.strokeStyle = '#C8B8A2';
      octx.lineWidth = 1.4 * sw.scale;
      octx.beginPath();
      octx.arc(sw.x, yCur + rad * 0.55 + 14 * sw.scale, rad * 0.82, Math.PI * 1.22, Math.PI * 1.78);
      octx.stroke();
      octx.restore();
    }

    // 5. Concentric refractive COMBO! shock-rings & radiating studio specular micro-sparks
    for (const cr of this.comboRings) {
      const u = cr.age / cr.life;
      const ease = 1 - Math.pow(1 - u, 4);
      const alpha = Math.pow(1 - u, 1.5);
      const rOuter = 12 + (cr.rMax - 12) * ease;
      const rInner = rOuter * 0.72;

      octx.save();
      octx.translate(cr.x, cr.y);

      // Soft fruit-tinted bloom ring
      octx.globalAlpha = alpha * 0.42;
      octx.strokeStyle = cr.light;
      octx.lineWidth = Math.max(1.0, (7.5 * (1 - u * 0.78)));
      octx.beginPath();
      octx.arc(0, 0, rOuter, 0, Math.PI * 2);
      octx.stroke();

      // Razor-crisp white studio specular shock-ring
      octx.globalAlpha = alpha * 0.90;
      octx.strokeStyle = '#FFFFFF';
      octx.lineWidth = Math.max(0.8, 2.4 * (1 - u * 0.72));
      octx.beginPath();
      octx.arc(0, 0, rOuter, 0, Math.PI * 2);
      octx.stroke();

      // Delicate secondary inner hairline ring
      octx.globalAlpha = alpha * 0.55;
      octx.strokeStyle = cr.accent;
      octx.lineWidth = 1.2;
      octx.beginPath();
      octx.arc(0, 0, rInner, 0, Math.PI * 2);
      octx.stroke();

      // Radiating studio specular micro-sparks (with warm champagne-gold glints on Triple / Quad / Penta+!)
      for (const sp of cr.sparks) {
        const d0 = sp.r0 + (sp.r1 - sp.r0) * ease;
        const d1 = d0 + sp.len * (1 - u * 0.65);
        const ca = Math.cos(sp.ang), sa = Math.sin(sp.ang);
        octx.globalAlpha = alpha * 0.88;
        octx.strokeStyle = sp.gold ? '#F8C446' : '#FFFFFF';
        octx.lineWidth = (sp.gold ? 2.4 : 1.8) * (1 - u * 0.45);
        octx.lineCap = 'round';
        octx.beginPath();
        octx.moveTo(ca * d0, sa * d0);
        octx.lineTo(ca * d1, sa * d1);
        octx.stroke();
      }
      octx.restore();
    }

    // 6. Editorial studio named COMBO! popups ("DOUBLE / TRIPLE / QUAD / PENTA COMBO!" + bold point award!)
    for (const cp of this.comboPopups) {
      const u = cp.age / cp.life;
      let sc;
      if (u < 0.20) {
        const t = u / 0.20;
        const c1 = 1.70158, c3 = c1 + 1;
        sc = 0.48 + 0.52 * (1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2));
      } else {
        sc = 1.0 + 0.04 * Math.sin((u - 0.20) * Math.PI);
      }
      const alpha = u < 0.09
        ? u / 0.09
        : (u > 0.74 ? Math.max(0, 1 - (u - 0.74) / 0.26) : 1.0);
      const yLift = -26 * cp.scale * (1 - Math.pow(1 - u, 2.2));
      // Progressive scale punch for Triple / Quad / Penta+ combos!
      const bump = 1 + Math.min(5, cp.comboCount - 1) * 0.065;
      const baseFontPx = cp.text.length > 12 ? 23 : 27;

      octx.save();
      octx.globalAlpha = alpha;
      octx.translate(cp.x, cp.y + yLift);
      octx.rotate(cp.tilt);
      octx.scale(sc * bump, sc * bump);
      octx.textAlign = 'center';
      octx.textBaseline = 'middle';

      // Bold display combo tier headline with crisp warm alabaster porcelain stroke & rich fruit-accent ink
      octx.font = `800 ${Math.round(baseFontPx * cp.scale)}px -apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", system-ui, sans-serif`;
      octx.lineJoin = 'round';
      octx.shadowColor = cp.comboCount >= 4 ? 'rgba(184, 120, 20, 0.28)' : 'rgba(48, 34, 24, 0.22)';
      octx.shadowBlur = (14 + Math.min(10, cp.comboCount * 2)) * cp.scale;
      octx.shadowOffsetY = 5 * cp.scale;
      octx.strokeStyle = 'rgba(255, 252, 247, 0.97)';
      octx.lineWidth = 6.5 * cp.scale;
      octx.strokeText(cp.text, 0, 0);

      octx.shadowColor = 'transparent';
      octx.fillStyle = cp.accent;
      octx.fillText(cp.text, 0, 0);

      // Bold tabular point award right beneath ("+650", "+1,200", "+2,000"!)
      const ptsFontPx = 15 + Math.min(5, cp.comboCount - 1);
      octx.font = `800 ${Math.round(ptsFontPx * cp.scale)}px -apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", system-ui, sans-serif`;
      octx.strokeStyle = 'rgba(255, 252, 247, 0.95)';
      octx.lineWidth = 4.6 * cp.scale;
      octx.strokeText(cp.ptsText, 0, 22 * cp.scale);
      octx.fillStyle = cp.comboCount >= 3 ? '#1C1815' : 'rgba(34, 26, 20, 0.86)';
      octx.fillText(cp.ptsText, 0, 22 * cp.scale);
      octx.restore();
    }

    // 7. Editorial refractive cursor filament
    this._renderRefractiveTrail(octx);
    octx.restore();

    // ── PACK FULL-RES ORGANIC VISCOUS PRIMITIVES FOR WEBGL2 ──
    const floorPrims = [];

    // A. Organic viscous lakes & curving syrup tongues (`beadness = 0.0` -> domain-warped ceramic wetting!)
    for (let i = 0; i < this.floorPools.length; i++) {
      const p = this.floorPools[i];
      const grow = 1 - Math.pow(1 - Math.min(1, p.age / 0.24), 3);
      const evap = p.age > p.life * 0.72 ? Math.max(0, 1 - (p.age - p.life * 0.72) / (p.life * 0.28)) : 1;
      const r = (p.r0 + (p.rMax - p.r0) * grow) * (0.75 + 0.25 * evap);
      floorPrims.push({
        cx: p.x, cy: p.y,
        halfLen: r * p.aspect,
        maxRad: r,
        ang: p.ang,
        rStart: 0.86, rEnd: 1.0, pinch: 0.08,
        density: p.density * evap,
        zNorm: 0,
        beadness: 0.0,
        tr: p.tr, tg: p.tg, tb: p.tb,
      });
    }

    // B. Plump round & softly-oval glossy satellite beads (`beadness = 1.0` -> crisp 3D surface-tension domes!)
    for (let i = 0; i < this.floorBeads.length; i++) {
      const b = this.floorBeads[i];
      const evap = b.age > b.life * 0.72 ? Math.max(0, 1 - (b.age - b.life * 0.72) / (b.life * 0.28)) : 1;
      const r = b.maxRad * (0.78 + 0.22 * evap);
      floorPrims.push({
        cx: b.x, cy: b.y,
        halfLen: r * b.aspect,
        maxRad: r,
        ang: b.ang,
        rStart: 0.90, rEnd: 1.0, pinch: 0.0,
        density: b.density * evap,
        zNorm: 0,
        beadness: 1.0,
        tr: b.tr, tg: b.tg, tb: b.tb,
      });
    }

    // C. Sinuous curving 3D airborne viscous ribbons & plump flying beads
    const airPrims = [];
    for (let i = 0; i < this.airBlobs.length; i++) {
      const p = this.airBlobs[i];
      const u = p.age / p.life;
      const fade = u > 0.74 ? Math.max(0, 1 - (u - 0.74) / 0.26) : 1;
      const spd = Math.hypot(p.vx, p.vy);
      const ang = spd > 1 ? Math.atan2(p.vy, p.vx) : 0;
      const hl = p.maxRad * p.aspect * (0.55 + 0.65 * Math.min(1.25, spd / 280));
      airPrims.push({
        cx: p.x + this.shakeX,
        cy: p.y + this.shakeY,
        halfLen: hl,
        maxRad: p.maxRad,
        ang,
        rStart: p.beadness > 0.5 ? 0.88 : 0.72,
        rEnd: 1.0,
        pinch: p.beadness > 0.5 ? 0.0 : 0.18,
        density: p.density * fade,
        zNorm: Math.max(0, Math.min(1, p.z / 75)),
        beadness: p.beadness,
        tr: p.tr, tg: p.tg, tb: p.tb,
      });
    }

    this.glEngine.renderComposite(floorPrims, airPrims, this.uiCanvas, this.overlayCanvas, this.time);
  }

  _renderRefractiveTrail(ctx) {
    const pts = this.trail;
    if (pts.length < 2) return;
    const smooth = pts.map((p) => ({
      x: p.x, y: p.y,
      life: Math.max(0, 1 - (this.time - p.t) / 0.14),
      speed: p.speed,
    }));

    const left = [], right = [];
    for (let i = 0; i < smooth.length; i++) {
      const cur = smooth[i];
      const prev = smooth[Math.max(0, i - 1)];
      const next = smooth[Math.min(smooth.length - 1, i + 1)];
      let tx = next.x - prev.x, ty = next.y - prev.y;
      const tl = Math.hypot(tx, ty) || 1;
      tx /= tl; ty /= tl;
      const nx = -ty, ny = tx;
      const frac = i / (smooth.length - 1);
      const taper = Math.pow(frac, 1.35) * (frac > 0.88 ? (1 - (frac - 0.88) / 0.12) * 0.85 + 0.15 : 1.0);
      const hw = taper * cur.life * 3.6 * Math.min(1.3, 0.72 + cur.speed / 1350);
      left.push({ x: cur.x + nx * hw, y: cur.y + ny * hw });
      right.push({ x: cur.x - nx * hw, y: cur.y - ny * hw });
    }

    const trace = (wScale) => {
      ctx.beginPath();
      for (let i = 0; i < smooth.length; i++) {
        const cx = smooth[i].x, cy = smooth[i].y;
        const lx = cx + (left[i].x - cx) * wScale;
        const ly = cy + (left[i].y - cy) * wScale;
        if (i === 0) ctx.moveTo(lx, ly); else ctx.lineTo(lx, ly);
      }
      for (let i = smooth.length - 1; i >= 0; i--) {
        const cx = smooth[i].x, cy = smooth[i].y;
        const rx = cx + (right[i].x - cx) * wScale;
        const ry = cy + (right[i].y - cy) * wScale;
        ctx.lineTo(rx, ry);
      }
      ctx.closePath();
    };

    ctx.save();
    trace(1.65);
    ctx.fillStyle = 'rgba(120, 96, 74, 0.11)';
    ctx.fill();
    trace(1.20);
    ctx.fillStyle = 'rgba(255, 246, 228, 0.80)';
    ctx.fill();
    trace(0.58);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.restore();
  }
}



// ── Shared inline sprite loader, single animation clock, and FruitElement custom-element base ──
const _live = new Set();
let _raf = 0;
let _lastT = 0;
let _paused = false;

function _redrawAll() {
  for (const el of _live) {
    if (el._demo) el._demo.render();
  }
}

function addFruits(uriMap) {
  for (const [k, pair] of Object.entries(uriMap || {})) {
    if (_photoMap[k] || _photoPending.has(k)) continue;
    _photoPending.add(k);
    Promise.all([loadImage(pair.whole), loadImage(pair.cut)]).then(([whole, cut]) => {
      _photoMap[k] = {
        whole,
        cut,
        frostedWhole: makeFrostedCopy(whole, 4.2),
        frostedCut: makeFrostedCopy(cut, 3.6),
      };
      _photoPending.delete(k);
      _redrawAll();
    }).catch(() => {
      _photoPending.delete(k);
    });
  }
}

function _tick(now) {
  _raf = 0;
  if (_paused || _live.size === 0) return;
  const dt = _lastT ? Math.min(0.033, Math.max(0.001, (now - _lastT) / 1000)) : 1 / 60;
  _lastT = now;
  for (const el of _live) el._tick(dt);
  _raf = requestAnimationFrame(_tick);
}

function _ensureLoop() {
  if (!_paused && !_raf && _live.size > 0) {
    _lastT = performance.now();
    _raf = requestAnimationFrame(_tick);
  }
}

function advance(dt = 1 / 60) {
  const step = Math.max(0.001, Math.min(0.05, Number(dt) || 1 / 60));
  for (const el of _live) el._tick(step);
}

const Sound = new StudioAudio();

const HOST_CSS = `
  :host {
    display: block;
    width: 100%;
    max-width: 640px;
    aspect-ratio: 16 / 9;
    position: relative;
    border-radius: 20px;
    overflow: hidden;
    outline: none;
    user-select: none;
    -webkit-user-select: none;
    -webkit-tap-highlight-color: transparent;
    background: #F1EAE0;
  }
  :host(:focus-visible:not([data-pointer])) {
    box-shadow: 0 0 0 2.5px #1C1815, 0 0 0 5px #F1EAE0;
  }
  :host([disabled]) {
    opacity: 0.55;
    pointer-events: none;
  }
  .stage {
    width: 100%;
    height: 100%;
    position: relative;
  }
`;

class FruitElement extends HTMLElement {
  constructor() {
    super();
    this._root = this.attachShadow({ mode: 'open' });
    this._internals = typeof this.attachInternals === 'function' ? this.attachInternals() : null;
    this._demo = null;
    this._stage = null;
    this._mounted = false;
  }

  connectedCallback() {
    if (!this._mounted) {
      const style = document.createElement('style');
      style.textContent = HOST_CSS;
      this._stage = document.createElement('div');
      this._stage.className = 'stage';
      this._root.append(style, this._stage);
      this._mounted = true;
    }
    if (!this.hasAttribute('tabindex')) this.setAttribute('tabindex', '0');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this._demo = this._createDemo(this._stage, { width: 640, height: 360, dpr, audio: Sound });
    this._bindEvents();
    this._syncFromAttrs();
    this._demo.render();
    _live.add(this);
    _ensureLoop();
  }

  disconnectedCallback() {
    _live.delete(this);
    if (this._unbind) { this._unbind(); this._unbind = null; }
    if (this._demo?.engine?.glEngine?.dispose) this._demo.engine.glEngine.dispose();
    if (this._stage) this._stage.replaceChildren();
    this._demo = null;
  }

  _mapPoint(e) {
    const r = this._demo.wrap.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / Math.max(1, r.width)) * this._demo.width,
      y: ((e.clientY - r.top) / Math.max(1, r.height)) * this._demo.height,
    };
  }

  _bindEvents() {
    const wrap = this._demo.wrap;
    const onDown = (e) => {
      if (this.hasAttribute('disabled')) return;
      this.setAttribute('data-pointer', '');
      Sound.unlock();
      if (e.pointerId != null && wrap.setPointerCapture) {
        try { wrap.setPointerCapture(e.pointerId); } catch {}
      }
      const p = this._mapPoint(e);
      this._demo.pointerDown(p.x, p.y);
      this._onPointerDown?.(p, e);
    };
    const onMove = (e) => {
      if (this.hasAttribute('disabled')) return;
      const p = this._mapPoint(e);
      this._demo.pointerMove(p.x, p.y);
      this._onPointerMove?.(p, e);
    };
    const onUp = (e) => {
      if (e.pointerId != null && wrap.hasPointerCapture?.(e.pointerId)) {
        try { wrap.releasePointerCapture(e.pointerId); } catch {}
      }
      this._demo.pointerUp();
      this._onPointerUp?.(e);
    };
    const onKey = (e) => {
      if (this.hasAttribute('disabled')) return;
      this.removeAttribute('data-pointer');
      Sound.unlock();
      this._onKeyDown?.(e);
    };
    const onBlur = () => this.removeAttribute('data-pointer');

    wrap.addEventListener('pointerdown', onDown);
    wrap.addEventListener('pointermove', onMove);
    wrap.addEventListener('pointerup', onUp);
    wrap.addEventListener('pointercancel', onUp);
    this.addEventListener('keydown', onKey);
    this.addEventListener('blur', onBlur);
    this._unbind = () => {
      wrap.removeEventListener('pointerdown', onDown);
      wrap.removeEventListener('pointermove', onMove);
      wrap.removeEventListener('pointerup', onUp);
      wrap.removeEventListener('pointercancel', onUp);
      this.removeEventListener('keydown', onKey);
      this.removeEventListener('blur', onBlur);
    };
  }

  _tick(dt) {
    if (!this._demo) return;
    this._demo.step(dt);
    this._afterStep?.(dt);
    this._demo.render();
  }

  emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }

  clear() {
    this._demo?.clearSurface();
    this._afterClear?.();
  }

  get score() {
    return this._demo ? this._demo.totalScore : 0;
  }
}

window.FruitStudio = {
  Sound,
  FRUITS: STUDIO_FRUITS,
  addFruits,
  loadStudioFruits,
  getLoadedFruits,
  StudioFluidGL,
  StudioLiquidEngine,
  FruitElement,
  segIntersectsRect,
  segIntersectsCircle,
  computeCircleCutGeometry,
  roundRectPath,
  drawPhotoWholeFruit,
  drawPhotoSlicedHalf3D,
  drawPhotoFlatCutHalf,
  drawPhotoSlicedChunk3D,
  getComboTierInfo,
  advance,
  get paused() { return _paused; },
  set paused(v) { _paused = Boolean(v); if (!_paused) _ensureLoop(); },
};


})();
}
// <<< fruit studio core
(() => {
'use strict';
const FS = window.FruitStudio;
const {
  StudioLiquidEngine,
  FruitElement,
  FRUITS: STUDIO_FRUITS,
  getLoadedFruits,
  getComboTierInfo,
  computeCircleCutGeometry,
  roundRectPath,
  drawPhotoWholeFruit,
  drawPhotoSlicedHalf3D,
  drawPhotoFlatCutHalf,
  drawPhotoSlicedChunk3D,
} = FS;
// >>> fruit art (art/)
FS.addFruits({
  strawberry: {
    whole: 'data:image/webp;base64,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',
    cut: 'data:image/webp;base64,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',
  },
});
// <<< fruit art
if (customElements.get('fruit-stepper')) return;
// >>> element (src/elements/stepper.js)
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
// <<< element
})();
