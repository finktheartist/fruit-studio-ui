// Fruit Studio Burst pedestal: A press-to-confirm pedestal cradling a macro-photographed Black Mission Fig. Hold
// for 0.66 seconds to compress the fig and fill its 360° wine-plum rim until it erupts in a radial hydraulic burst
// and lights a checkmark; or slash upward through the fig for mid-air combos.
//
// One file, no dependencies. Load it with a script tag and use <fruit-button>. then use <fruit-button
// label="Confirm publish"></fruit-button>. Listen for confirm (and reset). el.confirmed reflects the state;
// el.burst() and el.reset() drive it from code.
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
  fig: {
    whole: 'data:image/webp;base64,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',
    cut: 'data:image/webp;base64,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',
  },
});
// <<< fruit art
if (customElements.get('fruit-button')) return;
// >>> element (src/elements/button.js)
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
// <<< element
})();
