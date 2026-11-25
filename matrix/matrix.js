// Fruit Studio Swatch matrix: A 3×2 multi-select palette cradling all six photographed studio fruits (Blood
// Orange, Yuzu, Kiwi, Strawberry, Fig, Watermelon). Sweep through any combination in one continuous stroke to mix
// translucent nectar pigments on the GPU, tap any cleaved well to deselect it, or swipe upward for multi-color
// mid-air combos.
//
// One file, no dependencies. Load it with a script tag and use <fruit-matrix>. then use <fruit-matrix
// name="flavors"></fruit-matrix>. Read el.selected (array of fruit keys) or el.value (comma-separated); listen for
// change. Works in forms with a name.
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
  bloodOrange: {
    whole: 'data:image/webp;base64,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',
    cut: 'data:image/webp;base64,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',
  },
  yuzu: {
    whole: 'data:image/webp;base64,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',
    cut: 'data:image/webp;base64,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',
  },
  kiwi: {
    whole: 'data:image/webp;base64,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',
    cut: 'data:image/webp;base64,UklGRtCFAABXRUJQVlA4WAoAAAAQAAAAfwEAfwEAQUxQSJgSAAAB8Idt/yKn/f89ZmZ9N+5uSBRPsABBggd3SnF3a4tTQVqo4Pqixd3dnfAqLm3wQIQ40d2szvOPwMtGno+3NiImAP7y/1/+/5+aoa2UAJyzRm0I0KAZq3JngeE4tVdQSJ1ZA7wDo/osXDrz2y5qQ0g1fx3DuIUEqf8JhmUZUAc6G1BIHdezTc9Ej/ZTp/Ubt+3clTfvt+w9/8hCrG8uL5q55nLq6QXN+209MCusikt4bLBvaLXwmLgGtZ3BbdriTtWaO2OPqtP8k3/cPD9myeuK9/fT7YQQh4V83Fxp4Qkhhddekezvu3caMXn46g3Hjy7/btEXh44emuxkGHanZO+sOdEcxjAqDpRK52qu+hoz0t/Yed6WbiKEd/DkX8sT4qgoLDWZy4w2B7FUmiocvOXAxBV5hBQtCjS4aVmE8Xb36zhm5cVVS66YiFCNhUUWQszb/QH61kUVRYgLMG5Jg/e+KLLzVrODCD1jdpxu/mIDnnD1ZnZwiuhx7N4NExHLyvu/Hn81zEOjwRFD39TiLUuPZtqJyNofbV42uu2odvHNEhPDQ2uHMcjAfEob8U0WIeVmIsqO/IzK7NTZtcI8PQI9kEHr/DG3ZktTK4nIv/mmT3wQB8ior+0EoEqZ2GfrOwsRfb7sw4t9s9vH6DlEcJ8wMhI0IzLs+TyRSnP2H3untfXhkIAb/Px6L7/JGURqze8Pz4jWo0DDS9byM8cKiBTb765O8VJXUWjozdDuPJH0zD1LUwJVmr6zPGnNa/o7XtoIbyu6vWzpy5yRLlTG1fipkMhE6/4IulJU0SctvVFCZMOD+X1aukTGquiI8wsC4EJXFNmJjOQtmWfG9Az3DolQUpBfQ6UurNtBI5Gb9seHl3SPTnCnHM5bpZ/YKfSbe5l2IkctuyICkrsE6NQMvUQ11/R6cOaulcjV0pvXsopOfjfcn1q0ozt+foPIXr7k1Rw1feiT3QCg3sktL4gszulMH4P+lhAEusVGG5HJp0Jpw/VC1rlD3RblEdn8YaTGSUsVia+Iw5pjJfLZdmrqynmBlKDRunPs+DIit01F5vJ9cSwNqOMazfI2rLDJro/eGh5BAQ0Gz7oSlXyXyHO+aGuo7Atdcjrr5Q9X7TKNEPseX1beGVJSCTEXOoh8N25vxMo3htXOfmgkct+220+2eQZEfJdLKNCyL1Elz5RtYps/IVToeNA/XKfwkF/hkyKXltIBIemj9axeXqkYYAb+NPg1ocY7PRUgq5nqeka/8fkbnh74tHHBnJKTT249e1dP+J3QZemZYRN6a+WSosuR4y2nGSmDkIzM14NlEhd9wpLx0wtCo6nxsigwec4Hm6WEpxL7rw295Y9u+atsQq+lqxoq5Q47+AOhWduvNUDuuu/mqYbkr4uUO3VfEsq1L9PJnCEm2iE545xkTdwVQr+502O1StnS/BJPQaR4Q7dxbdXyJP6mjVBxwdeDNk12khmsHgAaXiG0vM+z3vrmMkNdGwzNTzuoKetz1jdYZji3c+r3yEHo+c8eCpCZSVvanCBUnTbYG1hGRrDTM88U0hV59/PQbs29GNngvsFO6PvxyNbt9HKBibxBKPztKC9npSxgfOonLS6kMZIzVgWy0HnkztNZhM7fTtLKAsXwTAeh9ddRjByAyVZC7bYDXVwY6dN8baY3wt8fpZI6FsKOE5p33PCXOP/u/bdVUB2pnGOQMkY38ckHC6H8l905ydKEJc5NtxP6/6ObSqJ82zdu8KuDYOCrcWppColiAy8RHLwdLU0A0PEVEpQt95Emz9iDBAtNXymkyP/H22Y0ILcStdLDjMwhiGg/2yC4kdR4jryDCcSya/tcqYHeBahAcnIWSQ2zmCCjebzUNH2MDZWbI1WS4rPFgQ2k/ECcdGg0yi9KCT6Wr6ih9eekoXe/rs8IRlauajraIA3Ln73jUYJkLB6gkYbdBC3fno6WAqbWQ7xwmGcpJCDyoBkvCDkbJH6qOWUEM7O6i59+ZQlqkPUG0WtxleBmVpLY+SwsQA6y0VXc1DMKCXZ+mOokav6/WdEjd5iHqNW4SNCzoBsjZl6zC/CjcgYrXt59dxQTBD3mI1p1dr0oIxha3FesPJeYeQeK8NNEiW0//OebTwiOWhZpRanXwqF1FiAJeZGkVIgPKNQstxhLrOsGBooQAHicwBJSMpcVJa59Npo8jgcx1gy4YEOTk+6iFH27lEeTi/4ixEDjAoKndyLFJ6xv3CwrohT2FZ8er69kEkTl9/qKTv00gqtF/UQn4CSykEttlCJTY1Musji2uIhM04vFyEK26MVFNe0DwdanLcVFv8aKLuSqj7j8YsKXtDqiophagS9/1hIVaPIWX3J6ikvtV/hiW6YTleRsfCE34sREt8iEMGX9xMT/igNhclPEJL6AIKxpjlJERpkwhpxxFgt3JvwQjzLvvEQioG2zHwoIypa2EAXnfmPm7zYTnHX8wolB0MgO0+4SrL3qLwacwn1RGdq8ThIDgIRHBG3LJ3OiUP063pCL4aIQcRNx7Cv1IsD2zkQcUtZXITy/vTzmkBNhwmubTlDXvN5XaOw0grzl0xWCYpw7PMUecslLUPo2P5ehz/u2guKcgi6gT1Y/QQFAn1LsKZioEFjUU+whe5wElvgSfZ7GCIqpdcyKPnf6uQnJfZmJ4K7l9/dnE+tphaMKnJiOPPmjR6/pGu4hHNbpi2LkMY5mglNCWeEA1L2LPGS1BnShCiF5/YY9r+qAsHU9M7CHH88ISj3wHkHfC9FCUn2VQ/DXOFspIMM3Zy34Qx63Z4UD9c6VI1DprjoCqvOaIPDTEW10gtHMNmPQ81ZqpUBYLuk+weCSiSwIk/GOG7DDjkH5K2OEovMKGVmMQY+71FUJo2rATisGxbrqhAOd3yOQfRYIOSENgchhLwExQwsx6Em8gFrcIRhsmsIJRrOa5zGI/GoQjGL0aysKnfUXDJd8lWAwf9RPMBC4pBSBKjIvRghE1STEezUG5c6cEyuQ6Fuzej4gCJye0ihBIN2Knz8xYtCdCJ9IhSBU0yoJDqd3CwwOZ/7zVPrG+y1mHoUqL04ZmqITgK56rzEPCQ5fqlevp/d/HqjVoJpejELZXQCc1AKI6K0F/+Mo9DIBhGmYNt4j7AgK5XYWCIRv374gHYWK+ghF2Se11IJC1gmCaXqAIPFveoGo5+UgkeViDYE4b7Ej0R8/d1QIQ9n8DA45TibVDRcGQHIGCpEn3XV6oRi245DjRENGKCFLTShELvbWCqXmhnIcqtwfIBTdwlwcSh+uEQokpqGQ5VsdCFa31oxA/KNpUUrBQMRWC/7YN8YFKIQDKe/xx7qpOgi5+1v8IVfDBdXrCY8/tzwFFXeN4O+d6oLSfmfDn6vRAlKw6l7P8OdhNQG51ILAo+jDnwkTkOGzEPVyHnueJrA6tWCg8bzwQdnYc9KJbR4qHK7z5KkF2HPV33lSmHDA9ccygr23far10gkIYm6hz5OksUOUQoLOudjzfFTLesLSr7Ijz8um6hBhQb885En18o5UCCsxDXlu9E3RgYCVPh5DipDHuDUKhKyN7b+sAHk+DOEEBeBX/5ADd4oHMsJiA6JOEdwt/wwElrwjD3ke1xUYqKaU4E7uBI3QoOlL1MkdrNSzQnM7gzn8oSBDW4PQNIdMiGOdB3UmaIUWedyOOMbPnb7uCkJPXl6OONYdq04FCY0dfNeOOPa3GT+phaYd8JJgrnFlFCs09cR81EmNBcGzI4pRZ6uX8MDvEOY87uckAtDgEOJ8FQGiONSBN8t9xCHpDdqUdgRx9N6HNqcDRcJpDdYUj1WIhPuXJ40oY1rnA6LptrIcYy4Gg4hGXEAYxwxWTKBdBro4yoYwoqI4jy4kJwVElZmQhy65JxaHigk4b+ORpXTH5LYeogKDbbhiXWdgQWSjnuLK7RgQW8Z7M64cdRef2qdw5flsb7EBbkg+qpjmeooOxFzBFNNadxBZJkjnucKCKMdCQXRjhmy7YUWUdWrxYQPm/mlBE+vriQrxAdA0X2XCkrTuLiDKTNItJLEM40CkY+4hyfUQEOtWFh5HvgNRZsNCNO5T3qJIYW9xYmqPnzFoag6KnPIXJ2D0zaduesUjiHWpk0hV1SffsaFH+bkd033FC7Rjn6PHmajQ6lrxcu68pRg7LLM5AKVStFSJzwl2ZnYA1rWaVrQARvLY8WJM68YDw0G8mfZp2GHOutNBCWKuHVOCHHzZJS8Qd7cDqGG9t7WtByNyUD8bM950dQPx1076Oh0vDviABLIuyhG3HEhROpSTAgBQjy1ECdOjSW4giYw+9tvXGFGxpg5IpGrIzXc2jLAuUEgFhC9/bUeI7HVtpAMMLWddNmKDbYUrSKqixtoyZHgRDxLrtS0fF/JGaaVGNSgDFy54gvTOsaHCST8AhVpimr1BhbdJLq1SAiTG94jVhAiW37d9Vl0tMcx3D7eb8aBic7wKJPer471z0cD2bBRI8IxfGj+zOZDAkXUwQoLa1tDtupmLBMT0aiwnPSxA+6nrLEhASheqpKeqqtpuOw7kne8AUl0nk/IctiqlPzVWS5XTgHSqK7+wZvaBc0dO7UpgQKrr7LRTXcGs6j61GkSHBWtBsiP35lXSHMl6nPX81k81QcpDuv70mqc2Puf8rpWju8aqJA3AZbSR2kzTA131DEh/hzJqq+gF8jD2IbWVd5cJLS68KndQWdlFP3nAtGyVsvBgvp26HMaXk9TyADgAfZMVxdRlupaaBLKRq//199tu8DRlzys/kjS1mXxgfWPCGw3dkU1Rpbt+jIT2yYxs+OSsD/T0NM4ZIDBAdriOvGanI1P+LReQp5zHLirKezJvi5tMAYjbXUY99oIlR6rXVMsWxncDTzvv9nVe7g9yNnyDmW6K+vVrMoiTNdAqg2qeLdGFhbUEeet3jfD0wn+jg/AAg8zh5pTaiY1WKgYCuBpA7vrtT71TSSnWPQ2AMyhkDwxb/9mSHOrgTXZCjDMjQemulEGTtLppuZRhzNiaTRzp870BGJC/1UMB3C/TBb/kh6FfpOUtnpgAslk1+FKBhSKy68QOjt18aHpMmHwCRWDdudkOatjrpmsS0HRAewUjowBA3X7+Q54OjLOVAADB7iC72eQr8q8g7bQxtytUVbCyinMyABgmZ8q/010nZV3s+BGZrQiIb6bz/OG53Ct6NAaqneiqk2PAeU7Y1b3TU1lnreDTfkkAttEXgSwjwwCcBu/92yNZd37uqfsrXAEgtH64sywDCGw9b0+ubLu/tEfsuGk1oarGSyfTABjXhmOP5jrkWMkIBqB2HNAg49p14zP5lZdaGwCCfKgAAAzxm7IrHXIq5+D8FTUAwKCjBQCn+FE7P+S8lkeW0qLzo2JiPYE2GfehixbcyZE99txnC1on1dQzwFBHVUPQiCKrjHFkpT3d2q2hBqi29t+vldtliqnocOfaMV5Au913JK/eVyhHin8fFesKNNxmWZcBTU7LD/ufy2oyQMctB3zWMOJKaVqZrDA9X9DQD2i5W6um0d4bv22wuFxGZE3wUAI990jWaLgO3TiXZSWEmG/fs0uetfD8QCeg6SYtAIBTAHivK7aZ50XOfcpLXPHKagxQtU8CfNJl0O6MQ96KxMtWCXNYLk90BcpmtJ8CLqTf4R4A9VeWSZa5dEM0C3S/YDIL0PiFtPCfMmee7+8BtN9prBog5JyUGK+n5n/Mdnd+HAPUH7nGA0Dd+rpDMqxbWww+SAjh0w8fnOsKCKie6w0AUHd7SSFfUSEBjlv1tV4/E0Iu9Gncxh1QsO2gKlBz2+n9/XudK7MX5Zsd9rKs149vptvF6FUnBpTzysnRcEahABz0nM9UAVcdAHgMmtyn29gpUz5v2zTSvfdlu+D44uy8in+o4sSOWADN6MtHowAPFT7wr63Wd+ba20Sw5pIP5RZCyp+f+m3tlZJPlNvJ3sYjwwA04yaHAn6q3NssOXby/KnjFzOKrYTYK43mf5/tQ1FxwbsX7woKFzeL7zrr5vtVPi5Oepd2x4+fup1d8GbF5Tc/ejT0AFCN7Q5Yyuk5cEkeerng7Mq5X206se1smoMQm+XhgcPXrR/hHVUsqeetpKx064D+n/do07h1z56BAKCI6BQDn1QEd+jVo2NS9y9dtBwAxDdDk0/GNAsyqJS+NfyilposN7t3qFctdmqZMf/+/uPPHxYXvz0+I2GtMevRNz7wb1c4s1BVpceWj4ctXLHo/MYfGoB7yk+/fb+8f4CbwSPOp049r1pjt/6+bn19JeC2a+1mw5aPjneKCGddazeKVMGnA748sHJMs/o+gN06Xz3HAQDLwj/KGQLa7dzT1QBo7xbauF1TJ/jL/3/5/398AlZQOCAScwAA0FQBnQEqgAGAAT49GopDIiGhFhpuHCADxKbuNFRJQwAMrDfeAepv7DzaOSez34N92/ZXs566uzPKV6X86v/N9Uf6m9gj9cP2I9zP/k9ZX+I/6nqW/cn9vfeJ9J3+G9SX+w/8braPRn84D/7ezj/bv/P6bvXu9I/0Y/lf4kfof5Of2D8eP1V9R/Fx7x/ef8z+zHx3/e+Cf03+V8yP5r+Sf7n+R9A//F/gvEn8//eP+//lPYL/Lv7F/wfQl+u/bnujty/2n7bewX72fe//D/mvUC+982Ptr7Avl536NAf9herX/r//rzefZPsF/sn14vR5/cNJXZM7qPG2d6QKhQkCoUJAqFCQKhQeu0Sk+xDHbz7mz/ylFTDq1Y1OrxBCrB0Orv/L9yhXJMBwtrR42zvSBL2QmSBoxqseN+kzsyockLEx3VpMuxyVghQM21FW9UuF/nlc/5xi708a4nnZ4HWNW1Xw5dCEIRnxyx2pX3/WJqpaXQN+m265Csmd1HjbL6zVz6KaAvyy5b5dqRcle4bKe8AUUOLEetVNn/2ZC3P40fCJZLwS9FHTfdDOo6pNknsjJQXV/XuxZ6ZByo2MOpqPVOt30/xX+HQUP1n0gLNXKpP5bji5JAgHp4mdpTNXotaCGQ+RK2+I2HVzA3w020HkaX0Ib8rWn7xbgaJieSi3gQwv/dLKkvd6nzL6ZJ1WlDPT01WapvhA4GDstOb7a+LPtZQQJB/kjguhQMz9rfhrNi5CcafA2/RFX5kndR96tPadeQj0Ph/Rqt2+bN6RqUvpYwhPj47ScYNfUCltyugozaWurRzyQGgcLggNu1JBYVHxw2GPSKMmC3DgMqUJKyfJaTyPMZ6R3lriicaZXnktrQmusUjyoxE9Nd02e2BtjTLiFR+ZBtnsDgdAZLcdKfsMoTa+k2hWTJJGd0HYlcdzi6Nfmmil4xIWnq5A5CMpsEwCupPSPjhX/kVKX+XLcUm28pIy7+SqrloDZ0Ped11z+5oD0DvkeOZYNWfRfJcxV+bQ0gvBnsiZsadZ8P/xhoAnUd01uJKAgK+/IBvQ7P8Y3Lt5qBBprqC//Ev41ulyMKniwQHooB3LubtgjvspO9i3R925fV1xV/sXrj1XjbwWkOdBkLOoMC/51fS/n/rvHBtBeMllw6QxNDvIBKwWtFEYvJWIXuOghvx/MePlrOY59YEVLC3/DKVjMhT7L80fbY0+sg2Q1ZFaeTmmOmApZabBVxMtQIqEY6F0N+BQ7GE6gl1JtzFNxZH92atqPtlryKubnzM+FAraFn5PCk5Gc1mVlqVUuLKK8OWUSKDxImeYCtoW4krHHtl88uoKSbYoKxTgf5mdG1Z8nQHb31WYc7zZ1EG+UVptgsIyG8SiqUJtZUiqTtPxzf+IenHWXoWYAwTaZprWoBgK+AgTRVzHUG246ivsMaJwYqW38trfk8CXzR9RVMwgetpRk3hubN5ckKzX+SWKY50XCynPrGB5TyAl4t5pAP2hdp7ZeIID7NDNiRvEwc+PkEh09rmjZZZBZLWqS/1bXZ/5UzJckjuomLtP868215R7KZ8rMa4GOchNNoiPImsj/d5bG47O43ejL9NbWxx7P+P8f5yyMnK5tSLf9Ud2R4C+1GW3EXkkgRaS/nXG3tuRpCsfjhABn53ok45ZAiMCB71kh6KXlH3RXJOpovaHqj8BjrPaUJqBfESh6dRufVc6YXtp7tZv4S7XRgvKil2O7/vwpzFf3aFTBD4vmWgICFKHDEa4nkpCzgYz6OuWli/epqaJjITembVTqF8VkEd4ndRCwp18GZzyjNBj52kYRAm0Q1DZU4OmzqxEzgKNRr1yVJOsUPwdg9fVZfPsYHXCSwg+hdE4Ctj8Tm634ML3YV7YExFkBAKTvcxb8YZP613LJFbqhJY2iSPGKKSOKjFLIkyrT5APn3c9S82mm351Q3F76vbmnYMwzwDfQrvQJWPoX+t4IYvmbMEeFx2l0aOdrtYC02nKI0CJ/YwaCC0pbBAVNezNfEx8B05Xa6fDWC/FTcVNlGHprQJjQ7M01KePek04+EGsGDDfquSmV3n1TtQxIo0J/Ks6OyDGNvkvhxZMshqVYLMycn6SsUMGOKkXkf3KaHGm+1SV+h5zE49A6MC3qQODle41mas5/zYagqylgO7WdKm7WdaS89bgC2rTx+MPsQRQM3++J5uKMUEUwP/BOi6I5L4+cYjzXN3DFA/thr77VjfxepFQp898QEuoYjGQq24h0RcywQke7THantkawZHH0ldXmo/QcyTVSFeh9rB2E+x49JCCbFQ63z4yTJJMwaub35VWJvNNHCDyhirpGfVxsxAuWiG5ft2ibewFqTJbIgoEn6uTtfv9ts6WsHn85X6pCjXP2P3sGqCUB7QYdVQnCPwLj23OmCj7r+uk3IuNLOZE+l4Wbz73RCBObhcI61XTimG44o7tkbG5+Oh6mmz2+UOfh9Ccn+ikl1DH28+6DwFRPLdqL7zLuNR2vCiVmiDO/TjH6B0RAjWFovZQON5lDlAgibButt/VdVjYdN7o8/JU7t/uTTYmrLo4Jo0NFZB4sPunmTYhZewY5BULdOl4jQqMJ1wOVLFbRmXGMl1r7h/4jrfuv4YNbNBZNUxypq3nxvtQQmP4/1yA4nKmg8esxqiWnfi0UwEGcyGPT15mk3DpnpZcS357jw5h6RcVxqNjjmxjhUhjHF1B5Tc6UO3TG8X7Jk2LrdU9C3OUs5u1z/qE7WK2LG6ex5idQKocgrrmWdlZovGJSHxk/0vxgLL0Jw1dM+W4BxPmzkCs6BUeEqgQtzPYDebkW0FRGWJqyt8JGXAjWiaLRyBTuL+Sov/oV1MON7C47wER/TvJkQAYpqoGmD4uiIG9tZN8CItlncAKa8TFQsTJ+JKYuNbDbBzYPf8VYLRppBSYGYzNOXVOyiOhFITiFBx6Gmx2INNSNNpPUZksPM42FMPBJbjiRWWiedjwgb5Pca2BJ8FSijdy7RLMLevZBCDQYazLNe8jCGR9O/gwZXT+Ui9AwBTXM96xgxnRsfa5kVaE442++PeBpjvR+ab3tbYhoh1jerO3sAiu8SLCIydbvm9INye3NdtI+r/WldzYE5humdeFc1X3pC0BiBOZGZdI7mLUmOPjgGK1+EL9WDrkqqOCSG/56Hfk7b+gTPFeQ4lftPwHKWVozekZUTFXPw/tahZwE7WXtsYB1MNoMlss5PoCK+paIQz38nUobz6QFb0MqZ6NAVvNYkXh52zSW8/JZYSGPE/9OfDrfo/rNHQr/au/Uibd25fihXbt/winkZMs68ABluAKJmgxqX2X9FrCkLS9RiP4+yL/CioLGFtwJZQTsdz4v5gyQ7jqYJaqhpjm2gSo3RYDVXmtEtJm+5ls4ZsnQyf5qfLiSnX6JglMwO9b+APJRM99ITd6sV380pWreWAP2/fCOWOspioUJAqE72ILps8apkF5pM86Jjkrx1X0FREEqA4YDVA47O979nlg5LUvCzIDDeATBxju5gADSNiFz+j5FzpbgppjsEf/Xx2A9LhtY7k8TO6jxtnehMn5CWArQ9Ft9+1/qbRzAPv6wLuRhtpuZ7LDFeI1EoUsJg/kNV5GqqX96aJD11Sc3o1XjhbWjmywE/dTQoSBTuAA/vyA4AAAAABA/lVLLuB/kGmtRqWjpmtEeAOapJnp002TiurviAx7wDUT5L6fZkkEY9QoFapfBMdZ/rEC6xifRooF9ZTtlZ6e4CI1xgxyYnFNn5HeIhTRpy7zddvKFrPT5YzuhziF4YhvyTbTZdK8xqBfxhyWALPhIku3KzchYAemPqUNvZCosG/NNTPJz1Juf7uklRQstAg5bQIKBXWKmJlqsj7Ghj2HmIzuod+eABWFp59ANRPMzALKGlGW+0EV//CIGKEiPytpHqS+5X7oby9F1vnmyJ7O3VoS9qeF5jdBp1M4ERK8BtIC3x+lk7iljj/lBYxDTERiOAH8o1tDl5PhExUK82f2bZu1PqfODqsphKvhV7M9XOqs/NTHbJIGLlnKVpgLcflG4zpqwzZgWHG/hTe9E75EmxXKVaTItmxNDYGFfeIaFdUe0yi+JsrEZ+y3C6sSHAAEP+KiTAQpwXeN3FHGl091YbAAGMIO7WqJgucOY0+NvzxZxGmZ6IuyGtRzn3cyXKuGhtRv0xNdWh1fe29c0q78u9Qzsa2F/Wg5EXyeeQc7rts+p88Kx8lsOli8e7hG36F0NFd9sVe4qnmyBsyy8DHL5usGNYqFBhvs1fcrhm4xtf1SmvPbC/R6XFgNNfzT747i8tqz2OBit47eEM1pyIOX9Lu025ojGXiEEb9T3GGfeqki3bowFE7D/8EHm7dQVxQZp7bKVAQ7qdqFcOpOh8B2VKfMyYTquiSCOii/XsYbIiekQ5NdGDduWj4qYLbzLaKAvPk3VdZTkdW7dlu7rbNPnwgnlSzecRv8mA3AS5arNY4d0B5y1rEUV1ktIGot67IFoDSxHYt+uC1hAi/SvWq7bqvAwuwqq4rurPDSatUO/TbuOfLFfTUTB6vSBr/6VMUTHo73AZHF5acphJLPTFpUGq8Wa6xYfrr1UmvpU8+m6asQp0Ua6mXpnR8PezgB07KR7HYFnm3xDGctT+Qy+qJhD172WXeKRSWyq8QVlpKWAQwKN4u7kxCqCJlCHbv0JrXYUYELZ6hJ26Jx0OOv80jixLyKRcBWSlg/CrTk3HqDJZjtaItbxONQBXTC3+er00n9KVlwj+C6sVIeYTePLFCvWm8ngb7SiuMXw83kqGdb8Yj/CzW2+zYO0dbXQmsItpYSk2/bJCNJjf3jPlavkXIvFsPzssDFAakeXIJyPUWMtzvEs9bJQgFhslFT26FBxrJ6zzp8Q/8zqO9D5jv/sb8PoAp7/G0hSjvW6gtVS2vWsAXFvsuZH62/iA34gefBn53UKgxNQXjkWIZqVMwa/aQ5tB7LeX5SNyaQVVCc/vwzO8Z7E6AgmmybyZQrQFWucijwj+zeGE66drkG3G0w20Z9VtGPvYlWbNd7hCttyhjEGOvqFYBhu6NjyUDVSWiLF2gh0X7hUoNED9e3j+jQBs5JduV6qPQKuIyVotBrM6N9wv6vr09ChT2zZ/oaTG+7+snED22cyz71qk8KUVgIisfI0ehrN9ISoQuBJjldqHeXwABZfFRJX8G9zMxUhAYQMoLWwsfu0PfjVQnyp24d/ZhlDJ/JF2jtxiW8uoCzicyq/XARn84jKSejtMjKjycDXfV6WRPIyBT/gBKhbr3JarKdGH0COaql8ZXD8K4qU0iDj2N/dwlTx0vNxaaAwdwJLeLhD+wFI6KJOSGaoOqUvxIHH7r1OJhgGA5a3w0JGxJCp7yUl/vNy/UnP0IPUo4JRgVtmoV6VFJWIJ66M5s+Y8zSCSLenn5Dm3S2Mrm+TwWVw4rczYzu6TR/qCVliBAkgf15VlGQvRn2rFyU4URn0G/18cowj95Nj4EPq3VA0raIIbCNLHoogkFnkZrt3aj36pDDoOEnLBsKbpmGVYNCnzQRUHF8P6OSLeU0LDMd1M+bEHSv1VSNZdrArcplPOJpuFtEzTkRpZOK+iZFnJ4FdR6Rt73EPMMVoOPeKKJD6YCgpVXb82TouOROBHXXA7QEECsH9HaK5Cie0uwdhog3jtJPnDV0bLaRBA4JOOjWadJiSrcXuMuwVS3DQKCV3Nz3Ln3Wv7wlqDNsg6MjRDSROF67L4ydLgY9i3Mkdsi0KihaBtK74ZAcvL0RA9aAxTigISWEcGdKwU3HpzNyzhNYmqoE2L5oxho4OVqng06rYXq9q39/sRKYCdbyEHx0umCyUau65+4oYzDL2X8icbnKSNF0sUUDCmfLUWCzJnqVj9T/OZCgtIzLk6QhM0hdrfdKg7XFAeHll/8mBXInp68AsHjBLXUbIqLyFwTV0LjG1E7jFn9ylW3HIaLhQGfAc1Xxf/EMjUu7wZ1mUAswMfthoD6ncJcBtukXr3BZKJhY9Q13qXkmOkqTzv6+UB0HHEt6TXlZ4pnS8aLZA8nenvflQ2o+hfq9i+5btg7V6JKw1YcCWwPNioGFbLx4wwnaEm+Yv/jAaimeY0K8MCiUyAljbGY+SlS4gZTTLAJDsj06XApFU23ZArT0hvCRyvXDrHcRyqLuJoKfYEPwfrHtQs/0e7d94mJfoGpwDJD0CjpwZfPkXEWP0O5TYzQU8a/YbmRYrMvEbuuGAdk/1YYf/nkWLNil726qA7Cc0Pf22C7I/dzL8S8hjvHSxqlSzmd5vp8qv+dbxfXx/MGioasMADdJ7qAVXqcX50+/qijqDbnvFo2a0reqhORq+JVbKA3EkCgsFa8AXhQmHqc2UpLbxEQ+ktK/Cr4y1oAHHE4cOpzosQI4eqN9j84HAMwlK5iXXOFXMgwX8JM1A9+YxHgJnE0nKIYQhcFN1mxUAF0aFjpxtN//cFbUNC/VXmYEhdJqPwE0/F9az93UwfcVNKWFq7FpRPqk/zhiKzCQgEGZ3mdHQvZAPf55k1/iNOkBEW+wZwSzD8OAFCofq3pBHfTpj1sUImojosA+Kb9w4LOZO+0ITSfUvFyuaPSnPeb5S0fiUoG04QMy2enEcS8sSmPzIUYTIUeqUvstojgsvxrz630JYU72IPphyXhs1ygLnS0ZqiwV1s9+ZSD5oAUZnyXwE86sVjLSMHWhu5TM+p09F+j1Ik1KaE1jHLu/owIBaOT9LtkTgnFn2pplBncoapjktkhWT/90kroc3MZEWxq35tcdrVjNmzyLugkrrWmN5tJFmlyQPJnrkVim+V9C/ZIbQo2M8MJOAFEshz/cRg6ehaUiS5e2ED5ofxSWqsGy72W1J1/CsmrqqNKpb5Um1CigRc/gFa5rbyHAoJ411Smd6pClGjNaY/H+zrEV2Wu3+HsiBHChoedkhwxPAAcCzfLtesI2yDBMjZoQ+6x93dBk/YWIVjh3YfX4zXRmVTX6DnqPrQbtM1RWWSjPvNedavRJSKLh+USmesGjWxNYmfN/ohaI8oQBHPFupXDj382WExMNmFxbZzf/POaXJrR+kuBqfybASc0sq4VelnNBVnyyH51IXtjYV3+pBimj5uG8Sahv5mK0KoEN4j3FD1UEbrBB81uCkfJVzOtuk2BIiKufhCtQygQ0mMuhOvNhb8jtmf+MZunBP6zY6SoyHDo+EsNGZl1oSUOr/bNnaEAGGeGuuSVEtogXuiMV7CNNRBcBRVf4yE+OSu2CRlk8zaQgAN3eSu9KmOPPGODyRaMZJLYQGHDVzHnLxSH1eEFGy1SqDomhqNblFNqmcRAqo9CkF8up/NpKd8DQ4uHK1779Q61M+xBD/cmtlHN87Ye/esUHD0E7cEDbjhVrkxxYyibfH3BJk2QT6Que0MTGJLgQbd4RJaSjWAbn7TfCPevidu7tuKtV2sDTjPWZcFeO6Cjs9kY1c1LgyC46zM4UH5VqB8lJ8zNsQlVW/9Q74kfDerPLXFVPBDlRFlr4WnNuR3jYHXr2V4RRAUprXRP6lZ2xxbTf2z334QQH82ebwcBrTHluHSP0ykeh+mf7zPneOEKD7tJm0/fDZw3Gsu28v5E+TP29rN4GHSsa7yyZHQ/LMfKmJlgnUJVRGRt4JXb5yGfLAjG3UWx2YGuW4n/zdca53xEvP4c26Ri8vNHWn+bJDFE3mte1lGyvsBw5s8b6Y4ppFpESiXxrmTDHVhpdUuhVqVmBO6laqHGShjj8kNzSv1pu1+mzPVxGSo7uD4/MpFAeeO18pexKR9t/rO8MnPzfDnrm+HD3GPRFq2Sk9TbDQu/04iFfIrPE3lwQ8lJhphA1rIe/f4VC/1xB61sD5r92KkjKpCx7g1RaVK9FfT1z/nKUNy1Z57Ii4fCbqHcZ5EFKluFVkl3ov/Alke95dpq/uyuN5pLl3a7iNiNlOcreU3+BbwOHW1ylAcreUXkm4/x7QWrjiru9aphgbHrEJ8aUoaoAO/4+AvNpiWNzyfldpN1DRqj3J7FiYs3OUxe1Wf0z28Sp1OWqu7KWhUC0bDo14dfKcFWVPDEUaauY7b552U/cl+s7G3Tbk5+sy4dt0iS04Mfpq4MtU6B9c+Xg2sz88YQ7NpRqTb5NGTHN+J2UNTuBQcfrVcNP+4zr1pK4bcoCdcQ+1zn0pCqAQMPTWHfw5DVzRG3Llaxia4itqfARvVLGNMd5f1rfiPU+zB7VucAGsQfYM6YubRqwLHjsnQf0+Ex9k6+ooW+hkV3nizyiM/H52WwTeuqQMGXovkYIM+eF7XmraOEPcevSp4Ur5bAon/0m9jGkC1TDNqeR9Sp4w2fdp1OZo/eEc+yDHlEEdT4IcG0bFsLAFrhH9DRfHqChsCRAXNOiCHqOzYdfAMADts0Yid8GVd0ApKixSRQ0dgwewpjBYGU7cJs3yRKACxhaf9onFaHR4QWrUPiaJRsihYuFTKTua6KOcJJplg3XrfRHjDSuV5FWUJV53PcND1SSd1ptEWIol6PuzM2/NRbB890H+fCE0ofMxOlQfUgm3W/sVfqEqT3egG6u3I9NaP+He4YK4ntevrAnIaWFmN7xDF/Usf1U2Bj5jU7jzC4eaLNtnaMAEBwThAUKP1xgPdVQykyQUoa6eDLPp1pXejkCAAN83EmwHbKVaovjyViEuFzI++LCNBcL9AGNv4C5ZijqupkC8evJxmFsSe3u6lozggqSAl9lhgedwM0ZN8O1BNuCr5T2I7qHXS4QcLOWWJbL07m7dNfcXkXxbJDOalHh7ixaPnVBmpwmA4CL0LrOTSYpRWuFwxgGZ2O5MiZGv0pPwbgoX/R5+7Rg68t0nwLqI93AEgXZ0whHVmFBA8BDRi4dir3ij5UFnOe3Mpc0ElozLcVn1nEbpas+ZVRh5MnK9oX+V0qv4nivZ71nBs+QUku/KmuZjp1VA2Ysuv3i+eL2UIAuYWjfrbDjjKmYYkje5N/eM3LqoKRKXp4WfokLsJDDyhCZIyR3xlSTS1C2y8Lw/xy1WbelJEX6TSDP5tHkfKi8fTud5SwAnNaPK02zOB3eXm2aiUoghVwsmA9FVGbfd/XJhpYryM6P8IRZ1x/GeZLID7rOU9olzB4Jx/Tm83ccfx0lyXNvith4BGT5QduNRPcdDjstCY5YYw2wWtBIAjFKsXqT5NauKwNv7gWPZEguwqLxc9LNaEa7gl0adLJs5XJn5vzhU2nKymxNEPmisWO/I5MEwWJnAu2NsvIn+nPjAvN78CDfy6mJuF//yw8gpt6TP94rQGPN0m7r90Q7LhI/JhWhVlM/wvv0cg0zfRGZz/mdaUrEpVX7AIM3V3O3ICn4bTljoeM8yb8I8oT52wmNbRnn7si6GxSw0+/hDYLOYXuZlgVhSVzKVp50MiDM9n8wv8jWazF0TSsTYBVGJsVp0oQ+cvMjp+hWxVf3gpP+0cb/5Js9TVFUNbUqe9EmhwoTyfg3146iBuVQ2HNGcUWVlOTVtVtnh8Cu5gFj+rgOYIGes20uVxxCH9cqsL0qt3bofQ1mxv21XWrlA/4KKQTePZWRMt0/1aXVWvrQXn3mitR23qNNxlwt4ue3nKu69XSGk+btKAvPXwQ0Znansq5r6C+73MqbAl95XVUFFWwch4wkkV0QcoIosd/9uFQwwtDIysPbZXdF8JUsJU5EnfADn6NeLtZsdozQwBu14YJjD7TcGJguyXrtcMHuQ2mVuyxMbSa2mpyw6AvDIieDWRcMPUXTB/KIKDI/o0/LdimDDKGeCjtlUU6mw5ZKspLy85kQPzAVED+tlmfASQ5Y+6SxLvEDCrE3TrRdfud+y4M9eiOftDxEN8xbsxSPxEL5IUUECZXAKWNVatlbkqETUPWLnUkR/4ooGSbOEygiHQ+jaFQg7jRHvUwnc1Hm7l5YOmgj3eqyYiXLKyelvXYvfcJuWXvP0oVMaoEXiWCPs0FiZ2NIpicGPzkuPVZ6j1P/Cb64ceziWFmbpPcK8gTKB4iuoj/CR5+sCt5T23c33qFMXhgNJ1ztt+7PZEuLyd2XqgOL+2bevmKc/fuAvygNxYDH7UsZuVnXbpQ99Th5QuqKZjQMT7KTEeEZTFah0uL2FyRndLszkH28gcrMCdMvXE0r7rUN8Q/UrJ59z/bpTALlk55/1CXI7AJi574082ASIKYRnXavdL+esShWS2mGuzClLZQ/tkiGcwEeuCZnmIY3MMaS10dHYNQBPbR91+goblKLQU1HtvK5tmT/lNQuX0txxTtrPAr2+o1Zzk8oQ+c/0X0ZpWHl83Nd9TXy5xcmkST311JQgeb4hhyRtZRR/BYLL5xD82sC8GCGFY1RwUcQck6juw2aY1MjHBnArtpzhaoSfa1kP450ZT581R5BGgbbzxh0DhHVd/e0gXQZ+n1GVbl6Y4/1sjrnCmXzIbgVVAwaovwCjiYr04sOCys0+6QBux3KOacT4uRvjhRRHUdP3uIBNPgXNR35PFgxQS1omFTfl12uhbQn5MZ4lI2pf6JuK9ttWZF5Qc92Nga4pChT9pnFDHxAlgYfnvLdy8cqAHQfnZiW+eSC8FEmdJg3EPDoBxa7I678PFCFqjbu3vlqI97tCFAwjIPQF5HKscyC8BwWwvrAoQHX62aDkhFgBTWwbbpvAC1HUO/0EMGB9EozMOOGXMhKHxBb4EhwdZdYpz6TWpaOb5cdCUJB4vKvopq09p/hRb9Xcsc3ZR7S5S7D4cgz4RfB27j6chtLBiZWVYlu5DJvPHSkPjWuVXqVle7VTn2aI4uWjoSnNVvI8awXlLXrJ+E2vV2AP5DoSRBNcKozU/dBy+VmlP+yw0NmRFYZysSMXvGwux0NMFDOhuoeoaQgSnNyInaEhQ5Um03W2t1GZOo/pjD/1luIOLxmYko0n4vmx6xaHnMjKV79Feo7pAoRxZHTBMEP4NIh0PgEi1zt9oNSzUQiPR4HISDV2osSJcmlH8e41BMvf/6ifyWPylv6GOxkpSFvm05LLzn1RtioAhiksna8BJepOZa+SJjaHJjPXWFGRxTwqyLP3Rd37IbS/McE4RPB4L1gIB8JHMKGkps0SNKcfNmuSjxKzzp87Oh8BjqVdBZZuqLL7tgEj4S+B/w6B/irTC9i+6cPlfLRQuttbOp+POzxdm/F3p68+6IngyseX4/6agDeB1d9WrYm/vki6eX/UcOvkRcd5z0xNW9WG+oQ43NP8FhC667YFaYTpVLoHalVCgWwbu4H7T2wVOe20kTn1n8EYaCeSRWfqf7dDbk/wH7mjUFiC584EGZ3sm24PaBV0Em7P8jx/VoyEoBRXlQ5c0wQRBTBdm7jXFV697tnKpstO4X/bScBj/9GsCEvEsww4GmOmJKgS00aFFyJSbqYCAaft3iY+KjE1t6TMoIwqvcpGW/p/bBORnd97q/aa3gadibZVrA9xhHwvGJ88b6qSAXjs/CL9UGxJlIqqm8f6NXXm9c7Vff5v4o4SiPWhlFvD8TUQZ2Yv6CaAKvbdbEqamL7JJ/mhJzBia/4/I60zuNHze+T5LSsI5nZHyjeWEyC+askUr2Ede0BYTM7EFQJPLqAD/KtUiBD25YOFiVCyXhh12FBVQhkBJkrIe4QMpl2y303nwOIIgjgjlCtikjh/NTzjjhBsJ6et+MEctR1sWDLdkxASYLyYdFz9n70ViLUHAfE7yPHUYuAMFUis0ieAK8CI/vyb5HVmnxNFzzaEFqE4+UcIYvxBUYN8xu+Qk46mjJsWroo8g8DF0zayXzNjggG5IokhkKPOgwcp1wnPN9kLvR0odHjmzJCgkc1NMo0+66UNris8WFZvYG4f8Hsur6rJU+wvEMGWSxhzvco4u9JcD74USFd87hQybXlAEr/TGQ8TISSGjRZko4jrqmIUcBPN8gHtfmBVVcVBuCsjN3ZeS0lFwX4Szy015fhjRgliXDV0sM1QZhScMmZik9Rlvzet4P3juhGsoZs34NWZG0LmIIKd9qk3j1tSWIdrlzz2+rEMOcg63qjhY/6hNAsNX+8O7ehql0SCerhtJpXOhN6WUQlehloBeB7cmaIHYslwtPoV3TdOz9IFrzf4KE+QaKkfQvQc5wEqf98rZFJe+MXXzJpqd79ogTOK14qXG39BVMUg3VXLXDJ7mT4zU5wm4POnf5lrCfIyiE6/1sgJ54uezwDWkXr851ZI836CrU7dZOV4gtPqkVbjwu9BjVmK9hVVWvS1B4BTxCJKFIlrf+xuT4DggEW7zByvtN4RKe9M5dPEAmOPJaUMb/IDMVTDHfJ86Hds7VwGlvElR/3LEN2kxV7cwXwQFIKtDyticVa2oHjyOXOfIzpOQGf/B4OAapTdUPh9rvvotEcaLLB/Z+TZjSExm0zIY/vW+39nNXw2ibyU0g1SMjFxFyKnGhcR19sXze6VXLUjaZVR47GoUwLkuE/eo8I2/zkR8xftZz0mnHFLNs8S2EwYFrq3ONEsnpj/cK7+VO4k/oRvnCWfVC5UHNO/X6bN97spRMISSODLGHVyVg6CtoYYXuzCuglN0NnpK2/kK8v+Wpi+p2O3cDEqHBBheEyeNV7q1ZO1FNGE+Oi+59rghKNEeyNxc/IWDjOBUD6j+Z0ntASZXPYanywtskWCkRn5NHhHZqMN9Q9rGffddQPWuzOjUcEU7i6dVa9yQX5DnReCJQy8IlnfL84EnTq7ScL7YwBB+tomMAiJqSdjd9UCzkpxsWiZFSRgvvtjudRND7OYppWNC/VSkDkuFvaPQ9l7qyceobgUGJldUdsHkO3bl2YM6Y8FXzi+xOruZ3yTj4hQwBvfG5u6/MbIKcqTs6LCRZYd1Grk2gATv1c4S1oIcinZiYsfsPKDQD8B7Yp6XBQdx10QLrsDqaqiw8/TDdI4HWysmQEt10yuVxeVm7Y0IJa+sm3eUnxZb5VyLS0E6+r1Q/uSdAd1FBuBKWAtwQqZQ0IBl/E8k7AU682rPqljGSqULGox1HDmHtp6h25mP4u6HT4Z62zbAWwV1qggoVQLoJMBec1C4q/07o0/VsqqNkIZQ61W4RFqKs7YGpQz7Rzu+a5/XW2cF5zDSdyXB/8dW5ELpyXPs2LxiMsxVHp09eI8qwOn226PIwhJcusyOdV7+SBpYQXy3xYrYLJAHdY3JXXtme8AaGcnnBjIyOSieNs8tc526UkDDUDmoAlUXnS3202ZdHxGPAKCeVJSupNMHDc8l2ZWiI+qn9J13xRfbC8tdOZAor6Rm3uSzpKQ4g+unlP4JnnD2350X581iY7LJHa9kpRy8hpZHoIlf4hqVOTIssI1jz3NbGk1mkB9kM2vlMurhNrC6cJkheAf5rBXNE88NMRWljb4U800yb1+4GFs6+JzxwROHu6imLaDaypkKVM0V5wTD4f8DrK8w6YbxtJeggRlmpScfpczYbmeV5bFGSp/T4I5HbuwaEhj95Evlt4QywfRMiHPQ8DvDQv5ycxwJKwIYpTZVh4/R9yieixxM+NXbNwpzjic+uYURUewMKvz/OM2HXLx9JZ6XBpCFUPwZbImOm11B/gjQETLRO0CCAxVJE63prLMsAhYvnp5UErR/+TWVy4YoroYYo5Pyh8lOh5yvQ8DfedYYF/cUzl4ih+GNW+nriYKa5Ev6u3tZiIRw4ZRYd34qqll3N+BGsOkME0BnAGoaxaI3arDMyk3NBcHFLJcnSEBudOWqm/DEfhC0VFtXKddh58DNUZmV8fJe5teEFLOpTiTA9OoyPwMpKrPBRsMmckU+97IuJPi/CGtWzGkdv8Mu3+47IabbL5wFKrPpyeJBYtwH/B+3ux+gu0GgkdREIiZvzQEoNmF3K1oDWgUvyR+Cntc4OfhbiTicgA9jEqgsd31QNrYC9OkE1MXlLWu3KEqJo0dIFmhBjRChLV7abVQrc8p0AF7mwowKTpv82uW2YfXimZatBrE6dLdufppxg+H/CS4V0CNWFeCK3+xZwXZkDMxNLieKh4Z4cYYGh6WQuPRol50TAmEJ7vL5o9BToW0BGOrlHVlLIRiqrOQzSfUWbDlG3U8HdzBXN3rhuufrr0fRwwF+/lnnGF5v4NhDB1dlM07X33/d8smbt2fWQTp0Ni6G2C28gg3VsmEbj/+arHfE2GBclWXkylglP3M3hUVYPg5sedJCgvCU2oF8824NQEpvu6ugonii9E979/P6Mwzf3mCzoKxOmRNPFNGLabGjYbqWW0Sl/lqZ4omJPYKpYhvgqVdPS5gw2VKGodWw8bCj0HgGTXe153IzobSTsuKD+Kn56LYmgudPlMt4srPd7oE/jKFsUxllAzr/t8in0kIXjmahVBYhfY3v7rbz7LEj4UXg3x2wo+vAcRT4R3d0OH3hjuZe8ah9sTliGrYXpuaW7gM/eL6FF87jOcbd9M8N9VfjPoWNX5jVbHwPHr5i9xuuaju1yx7ekh76XtnVw0ZfZJYCU598Bt4xQWH3EgftEbt+r70EDiQOuqOnfQvYv5o+Q5y8064XwMjrZU9SbVl/RhVfNZ0RhnD6EOHGMPt2rrKJAa+hsQOsQCftYwrm6SfRRkWzndEoez2/dmxgSbQSvl42sJSN22+sX0HDF8S1jn9/2b7STQiNrGndR4vbwyihPKcdH8aCXB4Zk1gR1Czg3veITq+2+mqzlYUCZtoy7L2oN5nf1JS5gu3i4ocl8rP4jRCSZ2/DGuJIohxRfK8JNhtOxj5+4+K2KK9hcy72HTSahbyd9dA8vY2R/OqPwUYpV5oAeFZGGAl4+MVSfMbxK/UrxzcqZatHMKhv2hmZioczoORT6r7w8d9khP7kR17fK2zIrly0eUL5zjZg8/yCttT9lzYTkPTS4N2j+FU7MdpCgqXSrfJgu6AkeCVMxDM/+RnRHl+nbGjF754jnrkcfBSMwKSvNv5qyQpyrc4qxLhp/lI1K2yALmpSewaGvibhrKeJSR+j43EMUoRnFQ8xwAp+0n/bv7jqs+60DiQJKvh5JovggBWFjEG83Pgp1mQ5mEm/Mu3KSWXJMi/tY61jUxRHHh//9MlOHN+2X6zbxRV2PAcTym+J/lnWYkSR4AgZ8NAoSUwURrZUqLuhMiJIiX3He3RYVUhAJ3VnPytmCPqSOU8Vcb05jaXg+3M6FME8rhIxh0eUwEoiHj2gG7z6E++A2aDtyqz6Gc8t0UpPKUGPqfNl6DcIM3adIlv3OIZYoqYgI3gw6e95yeCNyhN28lqpXDTJ6b49nIx1CWrlD2s+zXmJOmek9ul7IDE96HMQk81YyJ+bNfqCQrTwK4M4bOQ+m41YrnuXbK+IIIDAj5zm61Lw1hCq6yuokrFgZ/QAjmVgf2FuLNcbLA8wJCroHk4vJ9TlMczUpm7+wh7rW4tzmYw2qXZN1ApiKqSFKGX7BZSr9uXasoNlCULPfnnWx5zrkViqUBX3ElU2i7nXXPf7FyJHr4PvAnXHZeGZXwfh1xGGknDKsurCmyrAn0zY8fslZixXvDThaqajKXLmPZiM24BMp36fk1uLAmrxF8bMAgl5HUY2pbvEK3GDIsDxb1AKagII6oBCvWVIgjueAYzrgE2ync5cRXsmH7+W/N4Gn//NTz7kb/+Q/BvfgyAK1Es7BpnJjfXCv5hr+hoo2oYeorRbmOflap+EkpuCIKx88l69+Evz40OB6Uj2EzKxzHdJivP2eww34Ecm94SgoE5UyrBi43q+DvuVpxFB5Aa6p7UNfvk2YpS/l/Wb4MNZQSV+Rh0p3pypJLUjxuLNf1Jctja28us73g+JI/skHdQIiK2NmrJIFyZ2HVNNmPWEVcl8OU8zohkPUyfWRowYyw8bWq+npb01Vfq2v6AatHHvHlsHMhL+Wgg148TWMgmyB46JjAATcjiafnHYRlrIeg4WluYwnVDV6Wi+J92TanuJ5s9wW9ZDupdvIprdXvSFi5WHkV4qYg4n9sR3Gm4ac8U8d0wR5GiRAN0S7l2gtBoDgBqfDDxYOBEj70+OVSIuwnYWLyMKWXoRhtbi6wTn+Cs7Iz5QbJoQgXdQgCvs0GtI66fEXcDY0EH6EGK++1/Yeha4ZjK8xKe/MlfZRXNVm80PmzNoGXNAyCArDUV3+GD6/eBBD3hZygpv3ndrRg6yTLMCQJsPZOGlRvsc0Sr0mkUd0vrXSyadi+zsSDPm739F6LKCQRF0K3rf45HYybweGjolPGOdW3oMpqxzzVQ/jHRK5L+ksmx2qm0g+5AZ5KR2gFxSPk+wUK5Z7zJHQHw833H7PG8GlHJt0VGxFRAgklUFSghtWtXYrPm+9F/IBrwP0XbZtiXw9nsn5ARu9gTkFY9ujrDr9OTZF8RfNAOC9+KwaWOw4Xxw6YPd07JwqYKl5ic668CzdhUiVSvR6+5WL8M9MhCOikfMA9+SsbJ4sp/BsNMm8AONlAr67zgdb79/MR2fukS+sSxjsRVUf+R1SnAF8Iu2cwGnTFn7i82NHv2fQiPJlf2LJcAcWIqrpuupIiCw0xC/IU5BRtk9lUpLRNtX5J05yXcvpResCYiFNRBFAyvhwH09BvDGKNXgkz+TnvEqSnZfSkgLubLEfEqZOcfp8nG6N4OHVYUCu2yLAC7R3VMoqonhyRylqexfUcfQwAYOpGc7pD7md3Ya7GK7e44lCLvyaMxj9WYJ5nkYtDTkGHnRkkyYC5lrVCWINJyoYnqvLaTVIB9S1qgu/LK/ikaekne8qVlW9MnMOw4Xxay78SyP3CnPntLgwZdAFBBSeaV1WV/VVacPq4UsjqWl3f9wtIBQTdoBhMx1LxP33N8IlvvT+ucEOc9yEllxAUYfN8pjMraDLerTho3U+IP7hQueMN82KMnor34kfICRt7Y4tIKW40nAaug/FHjC133OBKChvG/J9Ng0bZLhLrijW/BkrwvQ49Rgjs8ungXQcmDaUIvKnH8WrIypuPT+GtmuhkQv90w5Vhd68Bsaqbz7PWBBubpVfBWMJIVrmz7YuloavAvVo6MjEjN1pDp1xbdHjQJb9Xm384G6tsJuv/zXB5UcjG2xguQf9TauSvXmdeNXWzTzlE9lVEctjHKNhcP9569sOugRd4I5svHMtkpyB6SL3a6FFTZkQqpyMvtBeTpeIGjvh5Sj0IDwfFmJrcLMXZCDk2zIfLzMNbKnloBuwVf51fUwUDy5k9FYX13BACKwzO+9izlugU2KofIGi/2uY6vtwCXLC35xNjKUpYy6WqgKykjx6AeF14bQ3zlmi3u8A8iJLSDwW7LhqLDiNkEU+g65Xhr0LfayMTONP9FSBTTYrTgv4rZPVU8d8SLTKG6BwHt7XAUQ65Ot7XZP6KmubJU0QN3w7XpOkWQJdWSiVsoyCSzXmaiyB3LX+0Xt8zpYYadrQyb/lELVqIR+xcea9AkjF6cw5K6olVlV13ERnXfWQ7ped2pyax9Dir6yz+Z/YhgYLx1LrkumwnQ5UrOzmMYM83lWyJ89FnY9k0MPzxn82aG3OP/F19j2PbD/5yOd60kCrp2bh+FJ+EaKovZjphEbiY1RNXuMcAHQxartaMF1clkklx1SmEEw4ojApA7+ok0pjWPTypFvDOTAkfG59t/K/P/5zCX+yxaeu37XERpOXLpbDgMpg8aZfkmtmibosPjIyIXOhVSqv8XHOEzsInMfE99gWFkdewFX4nkilB7NmyHv0XhTyKSsViVben/QHi5fxivTcU9OV3MA1kCsTa/RCYU6VajJhqCJc2lwghgWy/UgbKHrI5DkivM/fUH8ZPy3j3tkvfgcbKDbT0IJBwJCrK64LktBXxSdGEQUjMZ2R8PR+fF0DAWcZ4Pv1FMXdPZqDF3migeNZX4iVPbOnxwIwufebNuzZlfLkwf3QZ5CKZxGIxhvRYNKPI00sMfV2j/r17w9JGr2Z1U6DnTmIEcJuMqc/dVZFhcL6IJszUHqQOxRHZl5fEHgyiosOwmwH0zR0pXdQSAuWmiiW5Vd3YkMixs2RtS5nNW+Haxj0pM30xTCPDMiVhQczXeSMI3yHyIQbhTBIQQX/gTc/DSQqQiyXhLfvW7jowcjB6VcN/zf5JIPlqqBu0YA4CpuI9TKjg2lwk4aNH3VgGoPQMV1cN1V/fVfeOfFsS15ODpzMzrbxroT7RmyPizANSlCmVppa5hpX3ZZOQEUjvvJ26zAm8GtirYtFI3a/vX8b5nfubucCeHwbCNyCmCofaTclTkDSnEH0D+ReKRlt0ltFD0DEpkisjwhTMqkdB8TUJ7DdFUoIwxNNljReJ+6lA5BoqODJtmXXZxjL20mP+oAHj7MZwxZ1lXOONO5rWI7uAp+r5vyZWl8s0mEJV18JGZrjEIEM8p2RFM5ici75rIS3RF85Ke+PKsYC6tQEXL+FegQd6IcC5L3pKefI1M5NdeHrIIuWDV7ZSFVzULD+4aLlmQ2KJRx8O0ghOJr4ymZKF/px2zdnUkeJDOzJ1Hfx++EDzZTqVYWjm3N62dBenL1oeDrMPE9y2SpuWtoDVonT4xEUpyMnMAFqL9mVNW+GvuGn9X0Voa8GxI5Gv92aKcnD3SnwSSUMQr/nirOXJ0XU1N42aUK91JxPX6uiZSQiFfPoOABO1PsMCYxeQYp8aX9SFY94VRSCFZKvaO0QVTwNnV9DTkDJYvBzyHCTauZRQyqPzS6xgnC00+04muwhno7qmo+cGS7h6yFQAdAwq98F5jcV5dnhVgRyUktWO5GcljPGgXTi5Sk7ka1VN+YBFNHK3AFGRxu/7gxa6oQatbAad2KHovwUnq7840j5gnwSfVFPv9JWndXaMwJmLuUjk4mBJau//eVbSyxNobI0M6azgOmLhKGDQLLxJ6Pzy5jmkHQsysvF40c5W0etU15oTZX6bpVT87f7FzYfxkAH3+9wMQhSS/gkYHt/NR4wjjqKx2g26p7AV720qdyGcIrIC56TCPbOP1qQ5OaH/2liQEWccJ5i09yRtuhm5LX+RDQHg434yUpbAvxFYhVBP+x9kbZseQu1rOjBaN7+H0yT4PAdgNDopg74O7ewIe1otV5vetSVwsuMYsL2ytnVMjtmCk8htEjovel1wotwKp5uPx8Qz3WP+p8mIPJe9K3NMDrN5QQoyhzg9c1fMxnlZxh5u/b4SCmcUQ9V5xZ6HbdbpoJMiFEW/ddY1JEKuqNLJXTY9Kp5jbJOIkHLgGslCvlqyPT7SBSZowMiuQcdIrDOH3JcJdKBJc4tkrwD7Ary6aPb0pI0uFuRGmnpJrUN/9tak9GoKdG7aU7TRXG8PSd2M0IkYWgHOjA22mgPazOsJqBwRnXi+ZVgPiddt1xEZjMofejFcZe7ztNfnLqnfRHusl4I2Z9PdOgJhS/N+c+FY5VovrRf0kI/UjGn1YiDvOtScx7WGgk4cDB3ZGB6NqqkHlfwvbTicQ8XOiiLJfKwDUXig/Ih2SnH9tmDTIfOaIaijHghF4fcZPs45K1NBg6UEYcK/bkmU8PDaH5ebbpFJpqxEB+UXQSHfpjfGjSIQely0qhuk3BvYKY2qzkaLVxfGFKLkK0TaFGnvRBlJ7EV0dGTUbAdrrI3/k4aWhghHj+Opqy/jsMhpUfTla5e0aRmdqA9AAZCDKgTjuFtvDPYqa9MMrP1pJxfyrTXazI9hHsKcIKz53oAeDfo5LcLnoHAw1HlK4eJt5Qk5QsNo53SP2XdXU1al5C5rJ4OpWNoceEDaQyL5+bm+F59PShetnVeqb7YQWv6/HoViWAt+b3cDRQlyXe5xzczI3cFlrVaI+5+BtwvgB+UjDLwOWp26mCvQ2sBA2fi2XB8Jmpo6wRTXShGgYAqOb9Xcw8PUsm71EK5/Z+GU828UpouHg/k5d9QA1TktSqe3/Bs+EY75jKJAE39NHAI2Kt0N/a0mla69HZTvjRbauLn5CjD7HLcnBQtmNtkrP0Qm8eSq0mk02/cdBgQJSVNUHK34ZN7akr51hDQr0Z7rf3pOMdGWoGnUIUu+m5JxzgWCLPnYLYSqUsB90fubDQXka3Bl36CM1PPmPjhxrCrjkad1lN1NHABWinFTN0SXAWBqBZbw5lIssX14pRU3hVXHvoca+unf8gJx+EIIHVXJTEG3PcqOT9d0axRKC53+4v46Vfz2CNmAqLHv8kHhCdQZEYHm1yJVGCRv4g93k7ubih6qE7s/3TRERiG7yvtiHg0iCooeUpCVNzDJXKT9ALY1b98zj9uS4r/hyg+BAYsVj40KF8ZjWyWy2MKPYczJ/IVjyY7uPk5NUUUJw1xmgR1q5i/fbrfEPoelQBsnmGSlz+tVeoMY5453qVZVY1F0IqokuQLk6cfkFQ7TW68JoVCFnBehcbfRWGspaBO2Mvymqrv0bsbznYGUqL0LA3DXFxyxFDQqyfaZHXKx/eQy+a+Rl/2VRSrYeLVIxs1lu2IreInHYlaPtPilsXMzFvPq3ymvZ3OvjQ/rW2PiDwPGBCaaM202k4VIrbM+pWdVaZIcTDetF1ZK+e1dyeOaHxouJUN7k1HdDQiqPIFtVA6snBIpfylsenMygh2tnCPl4n7Esh0WJtzuSQtKpF/j09hkTw0Zqf8LPnk48apcPxaNywy7UnBnVLqewAX3/JbvDP4rgrLqFRyRK+i8iT0+c/y6sSCH+f1GfkCpPxFh7vN3yvvKRzlIYIQvmOhoaP1V26QjLXrlVMdX8rqVNsXaNJgHUgsESDfsjHhGiN+4hqurNPmaCbcTwAubdg05KxlivPT6p1LpeEh/TEja6OqRS2eij/u2ZE1rfzMWSEb/QRxPO5D0ga++RpEIsH+FjBRDPJccZKleoTW25v0g6vrqKM0v38nRHirjCyuGCt6IVoZwJkvJRbp8owk3Wt7aI83fBtheGfPjsGfa078HhIvmsxy0XaM2b4y+U9t91Ff0vQlKO/PzeYKNS0OpgcaX+THvCq6pZqXbv1OJWTLQZq+K8NhGRAn8up6ao0hEOlrUb9gn6Q4UiIaYUGcMKUElJZOJzqjyxLxQq5riF/S7NkNgc/kVpkuucdHqpstqazyKBcWzbCzODNfpRf4L6f5DZjJhlpP7cwNhU/qfXMJwOUAkVPS+n1Ga/u6pD10aACM8nfLja7VDhz4VZ6Q9iEZZR8DWRX+xCrj74mKmUcyTAjw4uCi6+YJx7DH/15UJzu/MO9iJhfmEsUF1YpOkbxtkMfcCkWE/I35oLcg3NWZekt+rkF0DafIRsLHytOVme1Uemx67VoBH2pPEQVWhWnQO6NHW5SgidDzG/XvJQjarSzJDBe533CtjGEuymHJl4fNje+nCJPmSu0tvNnRbc93HKHNsPSXIdPYdANhzDRDnPZ4ryDlBSMQ4a7OYXN+HBWrTiMmwQt9jQWLPmsr05CpkhPnKvQeMaQUDVsZVU+GX9UNY/cVf7eK74FzNirGJGejMVSqy2iFSW2aRnwhimew3pxcEE1T4NxOHApDC3j4lPU+0zu3CwtVEKgPXLh/pZE3kRLa57myKlUqgF2nKTZqef5SIpM0DjX3l8Rq0r6BYSh9z+Z+6ozJ91bzeiBi6VDrrgiscqcRTtTup1jD1dO4HwsQnJQpqcjCt1lWR3OF2WPnUu5rLqBozcQ/MMPgyy7qu6mKI9e1WW7ZsNR02U4cW8cmTjFFO1DQrv+iAgeRl6/A1WSbfwNTlWImeAzAKpfVomK1tGA7Gf+tZHclj+D8eNAU7gMtpVNE+0YVUheHkT41Zug3Q0Hfxa870pLZrmWhZLpLv8FHwaBwhmBGwQFqta3/OvvPrJJzJfmYWQoqWJACKzKewDFp72d1g6XLS0Vvo4hZu52jldK9IM4xrJ5XHmhTny3v6AF/6rR0BNR1eHy9VHRbyYB3xVMXt2X+tdl46fLmsMSbA2DBVa24ZvHDt8pTTtPuf3ygAhf8g6RDMJxeB8pXDZyTyli9k742irCZPpUE4Mmne3t7u5sg9+GKcuNn5iAGw+9NShdU0zEBL2CjZi/1/s+Qm1KWn7n7SoNW2eDS2kKVLzp+7nu3V2VWjwoZWxE9MzMxBev4pjZTc2DdpEK8u3KM8OzfY58QiVTZfy2l/A6iVNFcLGcQ+CGqYvPPLOLhnzV8f76OBUwzKvSuNGUQayawg1cmn5iJlOd2amuDF+KaeMshidjW/E8GVZR8AyG8geNQxB6em+9QFyPCn2rbomla2442uWOhLFMbS3OJ780deUGD/rqBXtv56tLup4EFOgia2Fvw9vXjD+zbS8aOZxeC3d7iTkyrTuOCcR72jOnQIQpoaPxoh7QJsFsqTiVYMUFjERYXCqiNcnqRiWedO2khxWOWi9xuOsC4mHR+MBZoVGffY2HK5hJPEMwTNfY++P6sz/di0zbYmputDIK39ZBXB9Q7tlXHgPkTKIRpX3GQaZoWT0cvHPD8EHtq1lzo56r88o2Vb00YQ8NLYcYnez5amG39l03Ru+CIecnK7GS6aMIyeCCosBdcgLxazaWErZBc4lb7MrBjeFNrTTZTULHioQ3BfYxgByGm9oLznVTz5J0LPOoH6lRiCT9F97Ji9LVL8FL7Gq4qm0f4yKS6uLe+WyCUbtvl1xxFKhvD6bMkOPLswhLBdQaDj776Pmmro5rRPItlpC7HdkNkXp7doumpZkYebN59wV+J6taYPiqqF8Wo3xymWRwe2rZhvk1MBskOouxoayzk34Ni+E2J53uR4fPhZw/oK7ixuLPI0fgzNYG4l0V+wTLpHKkH8LsE2TQjR5vG7K8dUSuwKvcm78kDngO630Ax06i6y1kRaXinxTbZpmmIzONGYv6PXEPxbwyMZZud/m9uw/yH4bQpLnCAOdIhDtuBvvcGUh5JTO5CGtNafPMjFqQ49bSc+o+QfpLpNgiveVz817kkqOp1KLoLBwqwS2NVVVCpTUh5OLLz4MElYk34Kbdd/3O9Z28yOpnHB2gFk2Z5VfwJz+23afzeii9Lqn3HQQMyWBxOKK/KVUqvK4nnHLZ70U4515eLPq9SDVKsHxglyHZ0bKATADOXcatfsDGxRHDn4EkIjAPdlUhnE9a+zOdTPbd0Nl+2UUAM3aciUIAcQYG9AEXErS5NW2n4jcJMAPKwdUd/3XTXntnVRyYibXT+xIDqtxwXbxyzR6QQhjnlfNm7Fwn8Y3b8cO9doq4jClf+zMekLgrjAzBCDCn2nA508E06YUJHJoWIu+jlokvHP+gMZyLoBzvltt2Be39/iEOKsmP3hpQ/RvKd8cKNYiTEfVqxMjN3MaAwcB0oAC9Efkj2nVQqW121yx4xayM/ylwGkYa+7A1+6wwzN++Ujdn8mgwvwSqsRSEUNsC2IdBcd307C40wt0w6PszWmdnd+Dg/AKpx7J1PBiA+byKzJZCgqqAB8UocnQODAQ/W3rapTzqecJqJvyl0ioptkwxQoJoxJhTMHV+28nChcmOXPSKxaUsxWJhCx2EN9AOoWPfk4R7YVgtUwcbZYxb8Yt1Fr+X/6MEo+o4Y9z6DgrBdTSDKXZ8Pg8OJ9vhGIJVDJodJVOobYgWysseoWhSRBilyb/W7448TN3cHRSXpMHyvf2HzgVlheDQsuXfIspPhFdo6bNRJXUENPRgyWzcrG6HJvoxHtYO8N2RepWCgje1f8pgyE2zOc5AQriVvWKarCQdNdI8cSQg4hYE7XHhrKeifL3S/3i6KTAm1ArlhSWROBhkTqCu8zRGJvuUz+eB/aZK9UiDsTMp54BJdPyPyhUnBrTUqATVY+XdVEspC/ZAKUfAN7CEVqN7hvBfSohvRmf+ilEQDp0ycX750LIWCrBsRvVDpJ7CYAojNlHCNAcdOKh8/rsH6qjI7UiOVEdKPW43VSuv6KLWNdo/tv+/VerPGtzlpis1QL/YDm4OMTvkyVF2rMMal/oByMWCbYpsQtIpnHLBjH2Cwh63kUKaBszb07CdXC6YG/rYI0qe21B91EdY7quZFkn6w8O7FIe3zD1A0SNigSYjInH98y73rTHCanA5BNXeytPyAeEHzHfD/9J9nnT7CzzxobocWys1ZAqImUi1okPwuVDtDMpJVQR84RZ3Unp50BePnNxnAwrel0CLvwVfsT7FBrB8OI8bco6M1DBmk293U84r7M6yr72KdwCD3uCDisgT3Gk6jcJPykz9YbXeebGle+SQ9M4G5x+Q5Ha8PjKLZhJdxSjV/4ZPQ4QzUcBGJX29AWoLbPY+3V6gFddqGojElYs3tmJtHGuiLeQtTJZGmLagHndyNS6BK2bu5NazXzWamahmbWavYnJF7z6HIyY8FHH4ww4vIJfIpnMzV7YyVIxJEq5i38taf27vFSBpw4z33GiUC9eoL8wJaltk8SyqdZKD81bheQF9RmJ0gtQusjTRZqE3IggW5PR256qoxRuPTDNnQTnS/azYp0dxL3ue1xlQGwo9Oxv1Ue2zmaZ0nVEDypYsGEGUNZPsMLODHPv2/HETJugz+QidOAa3/xwXOvnAN3e7N5S7GOHAnAJVEKPC5bkBeN0mGFaDWW5QzRr7l+H2vq0GKx31L9WmLicG5H40NaaUJJaKReAepmF94GJ20/PZS3H0GRr357H1eWEluUOaAvQxwrm8P56NMBEPDXOjqHYY0HmYqfPEiOZmB8DhjbmxwNUj8YHuI3TLuHI+9MteWoziuF5V+HxWmNjGJ8uYfBpq4z6GZ8JasHzSakQHtTrmZFVcV9xJEq4f5YBBKVGpVpKmiSYSg5ox/ANjN5YM/siwI6LV3eQSJt5cnCCPzNzi41/BWa1DcvBmeQwmaM9RqR1R7tqPVU08Z3Duv4y+FCp+2kCnv7/fb2Dni0cORlzXm/WTfi3p8cDC8ksYqr5OGdqMBfqVCPL7fWBh0osaQn8MUvXVG+1BIhJTaudCbzTHSxP6J/Qo0UXYVQR8Lr9+HDOTQzWcaJGg2Y9mquw2f/Re9ed/3ibsBO5LCcYTwF156lt54kF8WURDEjW0AbPZ91HtzrDqxZmaLkmK2uBQo5tc0Td/pynX3PhJ8J7QEloVwovQuvs+pvZ8StuH6TZzernYU+qZbleEZS+d6n5npfcpF9BzVppceaT1A+pkjM9lnfDJNY57PYWwp7BI+fLdm7ypV6fNv5j+FO+G2SxtJZ/5BZIuHOSuOMlzE4/8z0HWB1rDBj9S59/eGsZb5jbB3LAWmgrT53mMg7DzmPnsSW369TYBlAmq2+injJEcLri45Y0G48dBPMp6+bHJStMz85XEQ4erdpz6343qIj+EQoVERcrhc9lNKbB+Wmf1/PoQscfB2mfeVTVTO60/VuAhIWGkPjpKkIdiFQBN+QkNkEJVt604VBlOlxjA10ZpjTacsbadw99lDvRRTPe8W14xYyJx+pHCIR5YkBajXKQU1NsN84IhRokUedJjP1lOg7D7eNRclrs/yE4FTCX/c8jc4MFdk195GBhtNL1VnRiSnU0SMyfhLNFiDynD3bdhi4G8s2/fXgjML4Z14PVkkg/LOnqoO9e55y1hhh7IO5wqmAc3f6y8mkZLzoJu0z+7eZT+Fw2ezIR188cciLV/SI9vj46dOwi+V/mKZrPTLh+hMd47FPEFktFt9JGKabJPR8JcY7f+BHpqVtDsVDceOMDnDESLqY4l7TtUtIGYiNWoMTYR7htJw46sKhbkmCKn4Lhcb8J//Jj0tkkpTXQBMwI0PcwtXaDTXHOxEDNaJ8XeGmnaf5DkI6YejVjPDkSJSvlVxeshGm3/wO3CADpmy4JlPcdKvkmpiJSQPlWRDxPlW7EX7yv5Qx5LsHVcTyuTlMPP/mXfuM08zVDwP0HSSTFn/jldzcn7/vW700kMf3dSg3i2SCacIksnd0HmGgddMKZyEuK1xliIKU6ptQOpb3Qq+pqKoGdCkP+OgENt7KXTIcpGVrwcbfWJYG3PPqOGNKvz22bm6sD75Gf1rk6SUYGX8SyRurrTu8jVqyWAn8c5j8GmFWaego5JgXsc8qXzABt24SfJmBTht3gTECH1ELjxsJruNP34blVPDnQSmD8NNvgP96NxROPrq2xLasYKzny9cmBxM8Y7zGXfNiiA7P7RSuUNzvrHhX3Prr/x4kADB3qmkYyg96lXb9Gq8UKKKXDpBwwTlpgzq0MvdFjHbZ0nF2BmgTzGDy3H8wl6uB+Mt/8mD9QqFjX/uZ/e1HiQ50DnmfQO9JhGSVbNVbXKAI+Go54M/wV0uy2x2QMo+i4QXUw95BPS/nvMgy5kIHJoC1uHz2PZ57p5UeVtdJtyJw8ep4zkulOpujs5ULIaseJ2V51pbbnPZULdhLx1Diko4hofJ/2zvWL5CUNB+P9uQIAOhHNuciC4dA7rixX4rDFQRSGeTjYUQiif8+0CQK+77tE6Sjp/d5/76xEirl35SYlHx/rDVHQ3hdtzeHweGkGoFtuE4lb2kvN4CayNx7S/NaDivQ9cBvZuZXYkiF8IUX1GvmPX8KApditMNqd2XslOBPMaUXPM8it5P1R24P4FSmYyr/ZaRnRk1PgdlS/HmmnF1pnNKGWoJQNnn+trfIWsixKIgEvUWWQiHuRgyVThMuTYF/7dA7Nz9CIgEP3U6qMFUeDP242yB/y1YxGXxwYnQMtiQBf8itYaTth4PH1lNtshxEV7yVt3Sy6Hi385mKm4+zx8SJEGZL6XPwPyR9nA+hors8a0n8ZOkp2mJ89yGDpTA5sMAlEEJ83eOsiu+i1Ch47JLUhS+0zAD1U/DmTLXIL0X0Ej6+iRnrRnVTJl/qFrMnWgQCcicYA1b7dY3ZiTDhgGk6SQV70wYeL4ny9vVfFqevKo+uNYaaNh8rLc234GxFc04b1fehd7LFUI4cV0wyK4hpqRxHhtDzXLRv/9LUhd7xhZ8m3bGZutNu7l9UYmfTZwhjdjlj8i35GRGlOjZnGevztJiuTOzjdGPyMILi/X1QJ5oUxFYJ/NKuUrECxJdQdKIYndHqYpRWKRTXiOy023wl6b2LEB/4v2xBwi6IfHtKv/ECn3PPItuhejZJvGjDJmT6j5yKOw3EBCNNJkKYdCc4WFIrgadg9x+BfG80FmfWCgtDozAf0LWe/RbFPIbsibgD9MrMK51eTOKL3JaM/qOAUyv2k/KO6nYh5vdumbXMiewp0NOgoGLAKyPCkdtggBPOr2i7sVDiMue7CGEK4E8ndvBFe9LR1FqoFZPsKcPW3r3KgFjguD4SjgFKZOwEvQjSrO0VpJobvd9bFn+DKlqkUXqlksGxqWFAiHS6Y+1AWbkUigL6Ct20H6jLbg+AIbF9ztWt+qIPk0lBW1n/qHS8Xiz//Iw/2asEoeq0nzn81V+tUGRQiy39sf4GrnderXAnkA3u9I/7KyHn5wQ040lMmB9Bqr6WV0EQvN2HbXjolkdqylAXr6GNl5EIWX/ZLgSeoSxU1HYMZFcWbzazJrwf6/GEUB+UlbHwJto0dy61xW3/RJyFsZq8AVGU9mDnL1Sq6R6YBozS/A7wT03ZjwhefbhDcsucYmLLZ29YWW1M57PDcW6ax8QV+4bAaLXibecszwcg8Ut/AenrofI8JTLLsFDaKSahRsZA6ChufdJpNgt4kxDre+FGQn7FQpfGJ01kjSYOS3RTC/ce6IIUdWrxo/xGUJ8AHWuOGIn5N6AtVPxF1oXEjzVqE6mww+1PDXWTtVqOXDP4qXvbwqsJ6eAhZJEPXzXqW/jxmh/2q7wcRZYZe6u4wKlorYZ5xnmeSyelzGH+Mg3/a+Ojz7bxT5tlFXWJaLQZAz1XklCh9GDf7ar9yVvJsR6KqGyDy5SBLepwx88SHHbzHINLKgLVr9MC1p1l8pVn/Qe///pum5f/p777/2jPHEfGUS1w5Df92lrr8AI32eqvwkshc4uzbD+6HJTVMwfM1/Lhi9PRwYfszKIJHyuzkNFnqNNpHe0Lh9hbIid4SZLg5ccBLR0oIAEVHr5h0FvKTQ9bV4u9XS+oHAh4HScN2csCtWmaByIUFUYu49g90+zsVQRmoh3sDFdiXn4IYN3XtmH93xJkJaQPAW/A9RpcMq1jUJg/FuqiniCtjdmaqiduGpGxl7aaB/ztNf9pNVa1FeK0hy1+Pt0Vta/LYJDA/oTC/ywRM4NysP9qJ54U1kjh+A3NbfXmmfZT3kuiCZvjkd6fIlOYXUiE/EweHjhoZmSI6xe1kad3AoBs0pyK8PsS7VQfdxEd2u7uvQ+7zgbV77EHLkGvdwiC4rzwB2eubgqooKSyPV+Mmbmp5VOW51hRr38HrTrcDAS03r1jmUzMH6l1Vr6QDCmyxcrlCC+4Pb2OWrAAzIHM257KD8wt0uQypLGeqAfw+M8cxXYTNLf4DBwSJ+ujlgPcaP/JBSZFr05Qj+iv7HkKelgdrJCxk+IE2otb2Yicko1Iir8V8jcvA7/SQmHhtUH1naFqBdIyMsc3ZAtf4f29sXAHNvAjuWUm1MLSD3PH9LP+flLAeepxOOlFLGWZ7tPq96Gv1HWtlrUyPxqhxsNe0Mx6/hrQI1aX/P9dn1G6cKrKWFWeZIegHdhN/PPvEr1vZzDx6CHFpfkdxtt0kYFuCJc76j+H/X9Hh6y1YcBsbK9wQs3Vx/7WrQxBP95ze+MQbkZAe3Ok32IMn9d+vXtND4Jr64Q2nx04/XQot5rgMcitKg2Fv0MmRVqMtf5XaHj+fYooAIQKUtl7lbqXJTSN/expj1F9/gbuZVr7sV/9akfrHIhGpi7oUk/xhcj9ID247Whiz9+CXVKRy/rZqzGO/Z7yduncoxcNvsYNNL8PE7zs4R4dv5DrCaF35yzoEVgkeIaHtGzO2zYLbWPvzuMLbLcS1pQmHw32BKjPG7oSHKOH70HZ7Vb8zxj5Tq6dRvVXbcinS6ptfcbdPi9Zn/aKCz425gIumXUf3j4PpwgqquyHX8pA9m/E6jNlpWqGuwgcrkuOQyKBmcv/1kWUq5E7elqN0HWGqUcyOOdAc6H2mbFfB7GQIDeS/jBAIgczPhZa2cK3+J6kRxXcuR7ld32Z+MJzy7l5E3+mmIPGsKg/89a+ox9iF0PH99fFL73QWDpXJ4QB98kN+OPgiKHf421degeOcGtTU/po/U/5WgGZwtyj9NrUZrQ091NVHzd92ONFziczF0lvuoDsOgUtUSufvFHi4Kolrr1LnbVQ00hmyrltFsQFceCGWwuCKur1gv9f4gU30DuKUgUr4hLZuV5iwqw9stMoySK34JPvF1Y42guNeO+pd5IqNah4jc4p2sRYSEav/X1YeyxszUWMfCB37iAOZzWtGziYCwhoY5tMhp9eqzbGa/tPBAKTHAgxkNA+LqegijXm4rVqvxjTd+OkkrtNL/d6Jlq0oUgwD6uJSruREgjkoCyQD33VE8Z3i9lZMJcu3NUzRnO0jBZ7DKBZMwBUdeqie/BSGR/ZQUmhwXwHIgFSPIpqCdSlLVaJv/vHLZ1FnaUHFq88Nqxc05zBxFteX3dha2zYzT+g8wSP4lKLU349tfUQUu0D/5+YTgTYC8aAs5lj5A6uAp99aCriMioyFvnpskNPfUSU6NsM8jhO1XruuM+Htg9zNkeOosUwRqGolwmCh8+sx5QWYSHVHk7VRWx0uQr7d4Fn/9B1U6P3pousrPjfpinp+NAHMtIQ0X5YlIAWiabWjMLxY0jYa9XRQqnHBM6YP1jryGzodVmlDwazAbIar28FOuri+Cyf7FS+4pEuXNI0WrjhdEHhoKJ/obc0CPX9R3C/Lg0XTWMF6M/QL8iMOrwxKcC1pY8riPKWppAtICwYU03WULGIw7GdV62uShTLFHlrqZ6wd+i79GQMhnzDMqGPArhN79AAe3MzB2ewSEiZdFV5qxE6Dqx2hNZU9a+HLNqRNA/5hfG17k6654PKq4KZqM15pGvPL4qpiJw1BidS1vYO6tQhRv4sCdRxOVaZPlVj0ScLs3VVPKdQRss6FEXEWclpZzBAAY/94lAK9AQVJHwrJI+d56dCxq0DVamtf5/WfVxAgo5/bGLWglbiL48I0DrZQgON3doz2rH84XOmsg/M6e+GXUKO/vMujLwytArYyUDjWabdWGDrgae1912IdgDkVfEIU6ZfUOrRq4Tb5xSUT89tp8nKDd/OsAYhzotUaLYUdKdR1W7DS1PThEoNzTKGRFUPEZ2DQbzGrgQMaGm4m4rNlBdC7W+/crDqbuXqw3wKGn4FDrHJeRd5ABQtsRgMN0HRb/9r2ViQoRTUZAtKFMFU/DIf2K3KrmFumUHpsL60+r65qxwu610T70r15k7TMN1P3/TdJ/5fJdlfP+SN8cxzhlXKOJ6T+e/xcNFMGdJlE5Wb3++PLO53yCDhQGaNNi//AktnlphOzIcSJetvv4P598Lnx2CBwuaKbAvtjwp+gsu2Zjoh/pedhSG1MwdNENDKhoIzjnEM8uTUORavjol0JKLP90T8CR6kHxdvEud9V4hZ6sp4Qo/sRFV57ID/7QMvmRXtpqFc+8EEjW+QPYJnYpvJAku7Xel7IuFNZRe+vJobcd96yHdcVcEFponc2PWk8Lb45mj7Y+BrEf/ULS+NpEAFFE8n9iUCVSffWJk/WKc8S6xjWNds4zAqHyB99b90D5ULCWjPZzHBjh7dWgxtXc9Omdc6yxtTaDJ6Ac8+kTSkuj8A7g0i46RPE/4eUUSl4XviclJtr3VMZYUxLEZS4oIJOWWBZWiy5FbU6m8p+5GQZi9IkR1sTO29fAXhR+4rpzvGbVkby0UOLw/CYrM9YDRTziQOUOk9MBe7dPhheD7IXG7HdZ4Pk8M35wR2vQsgZaYgCSXGHuwOoYSt7vPOtt0GExBPwhcJti1LDYXcrBR8PTsMkqdaWNc7ejsnS05jjga0Rb2CyIaaZMxZEaW4RVtML6FL08+n4rgCmWFkU6qmBjF2osOj9q42CfvmgYpvuw6EITmvrefGHPLfybXH4kpTfEgHYRhFKvJEFCTZy24rUcXONcpFg543pIIRfvk9GuUTUIFhLdfx9wwiLAa2Px7Z6loLhmqLie2dmHBYrEvXWAfYKVWNXvcc7RsQB54qLykyDfjqdYL1jTsP8ej2GXOOV8Fb0pDwtS/Q7FJgw96GgD2TCia3+mSLSh5dFXU3aTxokWB/XBD2+XKwkU90KMV4I1PXjCXBTGPdnOsFYLCCu+CHqyYaLjXVCe82iawMwRfs+LaeKxBYHq8Rfyad2Q1ZtHYHI/Pj0KQY01FJtptL01ORWz7UU5nYr/fA6reonK/MaYF1HFZMmcnXWDILiBaygw3vLaktouaHTdq0YQkAWZbw643UrR/Hyxz/8cE49UNlGfUcdZm0JlTHH+ObIcYwuHNyXaq4/wuVFTgUA8Sp2ej5ah2vrzWicOh29Cmp0ZR7qlUp+csxMMZ2XtAwXcEgTeQSu/g1na6CVy6OFuyv3s4ITMTXFvK3RSBIrtu3ap4P/ulU7JPy8iZXVlFgu5I9U6bxCIBXpXX1W6oOEiBiCtfAAe9qPgx1CNG1EN4+FdQ/5SBQ3OqVUgRs5BDk8yhEMTjOarifuz6EKNQGLxGCq/NlFtBOLSpk2i3ewmpzMqccxx7ts0jHyLZBFm4fjvhQyPgy1aMiLwceRkBVEkEsTid27PWhvmoSviPxrfRfLb+dlGmwZvUdpdabaz8l2Adsy396y6tZrE9aXmgSExiGX9APtR2nG6bub49FinxJETN4vQFsFgQInsiP15jQhrnmgfRmxEoppjKlrwGg0VkQSUO0evnSZUu9F6y3uZ3KrR/gJpibknUPyPWIsmKigaNGF9GCuxMbvc4vH7r7XRhU4udBx5ozbuI+iABTkFHcxFPB6Hj4soRnBokPTzv7PBkngE9dMM6mKb/W2ZdSeLeIdDw6LqIKa1MXKZQOIZIptolK1X+kYxH+uDT83OT6kiIg7Q8fcb947qSp0r5HzwmkdUzDzVZbe8c3NZCl0c+prfe69DL8pXmxxCFiqJudT+p4+bJ7h947p7VNP84fnegIz1ze10Ugq2qMor39W+EuYU46+Uf9tlZo4gyysc33p4YeQSVkg2YnXcmJw0OHgPqyA4FPFr4kBDnOvoIxOnz/Cs5FCHyoZ18yna77bQPmW1u/sxONO+kKaKx0WJC/TWqoCqwgPwN+/EWGv4uGgcF4kLhUM6ebSwOca8AvFhSF5tqNxiJSz015zh6xXwTsHCNmqSYfdbkf4NVZUsbDAcWaYIs5lJAFAaHQOpqVtYzQsf/v9Dy2el/FLbAspXwVGtkmi5XR14r8S5XQHwIIqapupyS4qKYGOSFSiJow+G5dk6aMVVjNQcQ85EIJtN3TFDtSScBPfKXMYIWw4mmPmqdeN9/B2j0vnAb8q53wtCNEEyWENsBeXwY1h/5Dq3PjlN6B4vp4QgpR9wuLx6p7DGspBX1tboxldksMbtf6vfFdoN5yssgPgowffs35AmMxUSWa/NBLuvikYOaLmber5aYyKGnmsjOv6J9JxD9vbjoy41ntLOyH2RbcXm09fIkC9VAt1+irM22mcbnkJ1ni+WtBb9dRF+hkmrb3ts6n0sdK0FKUoKvpbgeCTMVhABIUUjRD4feeVv/4GcR5hxKoxIxgvEVDlKE5JeM5fpouPvpZuQuyJHDqx1md/ui8ftXx+2PhS7Z8Akq/a8nIa7eH2FJKJd/MWyPpnY04UsLu3g3g8KsQ0Uce9FGYHJiMsenP+PojAIvz5Z7ODho2ueig03WKMEN3ZnGxpM+3+L1JA4efQAQSKJpRJobdVVrfnYCh+gQiSFUZHkKnYIrsTg1Oa7H0AAYtWBw6hv3ZvsfIRzNnCS85I3j4lGLOtGwu+DyF7fhgMdkgZV0JqfMAhqrvAxCr1KH/1lpgvbDxJkU9tC9FcTEPP0CTEFGjCtxYhGClkDR9rKOTfJNXLEWibfINO9loYp4+nCGXVI0mK2ZWsCC7cRfpDHkyBsoinpR5FLoEve/Z5Pg9Xi3H65ZLUfFvk8z2qoC0PX6zP7pM7XbPAKrY7ZDr0giZQYCP0Df9tzdvJX75K/mo3CphLsgEvAJ6JF/55Fr237yJeagKfLND6pr8u6QQGczMKB7pR/QLQKZAtkPWNZ5GckIxCkFgt3+BRcnBBtjV1WnD63fo0elmQ8WrDvSTRNVxHQJ82RNSG2pBCV442ViKV49H90GEscIZ6wFZSdm9WYY2PQZsBjroervI6RYb4CKcJUF8ooDfQ2wz1lm49JVN1F7yxj0TZBVefk+6YjSSWsbxz97PEJFSxBpdQqrsGEBUbNKAtJJIhtFpJERP8qzHIxt1jVj0pivBVIkqA4tVrKb4BERH/i0Uhs9adD1XR7nW0YvRsRs9AvilZNrCiK9lOrTeDnUguzmwfg9PVSkwUuONIOIiBjs8Az1Jp2hKoetql7S4SJpra8WlV/jm8+SwmY/8GdjmSQLUmUBSWCt4m6FtxaFHWDhI3xIeTpHjv2OqtTk7KPvKm1KtFW8I2tZ3gZ22sNDYouFo/g1spirMW2p5KpMkJQs0U5yLLBKHamWfkTDIF7cqmND3vMoih4J4B4m1jl1pmHTlqjgPDNAsDVWa5kUHXmKD5YqYGXnxw876GV5/fZxltEnUF+EsK8wIptkeYGbibCfOS5H27cWULGrp77kXctHiEFWsJoqav8DcM8qR6bHABdbkIb4KEmmGNsCTCg5567koiXY1T21rbCXyBLKxPjUXQx3X2tbA6BZS1TJzIQm1vl1vgtMByhR3gPhciAac/qLkcepqXAtRcF1G2nu53qyTcl8Sgd1Y0Y7wBjrRyF6A9ByAuUhxM4nL3jhIZvNhwG9lHhS6UZOWH1HudKp+lPNYBas5nAw6aUN+WZ2KU56VpQFjPxpcYV+0mH1duKWoJRMSVuhDoheXXOkQiS/Ye/p8lMeco97NxBKvJPxcIVHDR0Syg/X+7DRYZzP5hPzPbxi2tIsYBspJ0m6dxvJwRxbqiKRcdsnZm0qWunEtNf001bwJcT/p3gfB21LJzrBrQ3n8pVD8BbQlL916kCB+zpiHR/QqP4bosha+OhVIrA7R1EdEhIf1LziXY8JrpOiMhg0rW51AqNEcv8uJ5itRiEjQ5VU3DFxve7UQFYtdPtJHzQx8T7lSifzf00kBPdFAWpqBz0xtNhH57jRhuDX4k5kJ15DsUdWsgc/ro0wN8lUDJpn4lHrMzBbG3pBhpeeOR0aR+jO2SEwxLKhfdxRh2RBn9hNxfDXOW5crJBQY+xBQ5Z31xhItIYhxRrTbZfY1eDKm6zchovfPwN07rBf92pmWDmIzKhxq3BESzZiBGjGXar5X87j1j//Ip3YhUB8W+fpSlC/T2zFVWhXKl0T4oSQ9kVH+c5PgGO7Dik4v49fppTuWYhBKlVSzdK5U3LNah6dUh/XPOSlVlRoIo7Tezbl3jouxhvc5U5VrYH9mFQbzb4OsLE5EbDqk03actzaQPAH8PuK4dDAg9/vmHD7dYHS45BXWQmtCbTYfQlysADbjvnM4dqfeq1nkr3mhrgvfpnEIo4pD1uSsafde3J/aVpH4RI35xJIgICmrwXfRbMq29KyMSLruVuNbdGL/ai1yV2kMKf0f4lf4+52l6BrEEUS1CL/Uf0mJ14Awbb9WKpD8hS8A9RLXj9M3n9YX8whPiJiJhymYh0BnQMkD+GfGxwHSIbPIu4ClteA1SQx57f7mQ1RD7puea/rLWUnL0dFv9h1jmnitGzCatzh2f86G3GuQsrACbonQ8Ktt0V15/DGzr9anamcqMblyCIF/ksvLflPkJRE7K9hWKSHE6cAXvE8TB31+d7gz03VM8t1sc7zHGKAzSN4it9BfIfRdDop7Y6dziAMANp3lLP3QJMkx6n3EOIpQ8+6GDCm3VQACVBdcXL6nR3MS49p1Ns7NmZ4MUjfsA1gViULeUb0n2KDoqQXPwq1XtVCkACyJ6NtYKrg5LrAEiNvlHUyxDA/1pGQhHSVgSsHszL5BMAYrhsLDSzsYua90utLivnL0ULWZzweRma/20NSItV6cHeS/zeVmm4Wism07f1shdHPwRJDImaT7BnlAQkYccGOx0KVCaOCAHuD5af8XkR0QUh3mms0JtDmMFfr25piGx1gFVgf8VLIpFvjK2tN5TXHApaBs9yO+yv++dhZbJcFYGD/rew3h9wi6o2+3eTqhWLS1hB3ZU3TmLIubvBztYZnKP0uHmNnakUuJ3oJ23MZyeldLl1AmTXrw8s5NJGWT+gNqePFMIkSKc9Fty8H+5gdsIoS1jW9JirvXL7Otl/oo7sbhP7epQj1kvNJ7KIHwtjIqXw62vH9MNtSPl196ik6frH8CqteCw6RjBE9pXVrHXUNec6O/aXXHhffcHEEw/Om1fwA4Af7zkpCm4WaWSY0rcVx3CgiyiejPelfOmq7BN5K+u/QEfidBvIOB/Yjv5ddrUZm0kUcfQoQHQcTq8Q3Y8K7jWvqJYL44fSlysalq8cwGfTcEuFSOIyQd4N0qr8+LTEKzNKs7Tbf9698Dp2zbbhRTloYrQzqwQFxQrI1zr5aivGyBnWwY576sjry7G2OaPdVhtvIWhaBcXYS/Ud942e/9bQlnwgxggKKKki0mnPCXp/60jWB9ZdTvixHUTf+bTsbETLjl4h0aoJRzuONJTZX6IvLhlEvfJcFEb69RHro7SfQm/6WWv2iS995gTW5G7hN5+9LuS0Ul3zX5iCfEaF5Rwmyg+60GXz7+ggeviSThF1zphS3eZ6OPpfRKsXye9dIlWMkdIqtk4yINzkKOhZzq+WhwRpvG4hXF+uu97Aq2q4i5fhEMaN1MURnk6k74S1IWMCyixk+EtltSayOra1Zg1hp/P32byiWsg6Ze3KN3LOtXJKRU0/cEAhHn5JaH6Uyl63ywX24a5fmNPgPOOTTshum4OKIRr0ohxiYZXlUxvwRuJdnP0qNCmkYOZikC2mFaRhWz1BxxqXXGzizsCmRasFNhGH/dybBmAgWeXERnIslZ2LL11RSRCzPSd0YmDISEshYdD0P2vlc0NZ4xqRPEgP4/aPYfMYEIqZsa3lnIsJ3Pif+nFnbBSkvJBgByligfgCXeZlEDPVG/Lz6++dO21JlTKy0Eq4N4+Vlf8SrtQHPHdGPy6AcKxlXMhy6906tTgLi7THnR94Suc3FuBt9QYgFUl+Ps93tRDYI8nP5xggpubZjx2Z9dX8ZLgqWvUlC5TxLUtLNXNCpgmyaskkjwwZSWzJpQqRMsdyC03rgkKI98aPuWG/N+uSYLlNcEeS0Nka0YI9dzua6aSfhTkdAmUgP7CX4z9P/Bo4Nqzx2YqDkZhkpGHqSfKCktEU+1mesaiSlGReF+KwuRbS7HDq1A7/ocXbgIFx/Xzk1Lr3zDOfvDxX7kVEs6fbA33xCv9Ejv//+NN5dGjRJvWsAALq/+tyavUY/tiYPCh0+81hdP+S+5QGl8LzwyTxiheIijNCM6he61aG19OH3xL8U6XCFls1g8arIJqcA3V+E8ZGFo8ygsR6AbLaoZnQsyura0eR8wOuEXJjXIaPWdzYVnrdl7PfbynQGAeJsL1M3YX7fbBchpo2/Z7dmO5vYVrir+KhS4EYEM7FB0Vew+89j2iOjy5XlWml/hkME9uXHrX9sAZxmWHwjfvqViIMUuYD35129p+yMbVHNbw9G8V+urCHbkQf9C3DFAUGAlM4/p62nCzRrLklAD7BarTSpa/hBvXUeFVoDDeB1axgCdLztOvxlbCHIGqIuNK2A2B0Jnw0wflTccAb3V2AJZnY2zj258zZXW/kNwNltzxyxphxRa2NEO/nJ10Prz3v7IBQtOdHrWTMgQa+Lqz0Spp6YUKl4AUyoN4Tc8ivtuN+acY4TViJXB8e/TDS+iRuOZOhQAkpMcqgwl5D0hQOxY3R94E3Sns8aDkBGLZRpe7vcoUgJRrga8CPfeqItbH4WnPnTOJMmu1phrvsUVQwyTdCaG80XjNVJEA/8xO5t0h58QIbzUUIPuDnjbOj+D0Q/EOiR1Hok+6eImzM52N/jKQkfZ2tYJYDAMBTDbzxQ3VFXO2zI7dGYSzhzUfLfOA7vOxu9xxe5mlNFW1SHYkZDs/dHyTtEQeZh/iN2yP/faA3EtbRycaDBZlgMyD3vgwZXKG7wOIiMUIom7TOIOB5ZM5iBp6xuHF8+24LoqiaG83gQjbx9nSTji/2vDKSkjlVVjmNTHuF4zwm1SFuG3+sbiB+g45B7P9si6q5N668tBZDDAPRukgAItgsocvh23JCt1U+1L1X6C2Ng40jkA/9m0lXgK/A39mxNYR3I/mAd7hzVJLyFWlDXKmriH6TLh+qfP/b4QWIeO5g1RiXvDkWNp90JB76H0KIrq7ObVX4ptSCrOD0sIiJX+6p6KqlsippAki918np8Is5h0FQjqLpDnc4ysYcQLpm62ninsepdc2yOqDRop1QAdaWE+XJp7CDm1NOlZtNGdqKu/x2lkehCNNvra21/wAFjp+0+KGqqTCejiCIQaDlEPHL7UAwPBbgdH3PZfZqgz6lY5p3e/TBEROPQZ16KDH9sEGZUpubTjmmliYp28voN74rW+bnduqkmk8Rktevg9KfXuSDV+2y8T0Mr2/jOa6uWAbOBdylb4bqoOK0AVZVg94BgjVPzHnf81uUaJc38EIsC1JX8M1GU41JuzblXy/ScBEaMIXNfXBTXep064z++l9QBR8vPh6WN8Pc7bZrpHbriVQMZbINnl6qR/oVCvNY1fm/ApnWOhlBd2FDT8jtqVCs65RPAFt3US84AgOUuetAAAGW3fNMVLm/oTN6mkzdBLS6t3TclCbU8ug3NvFrI7dEHavrOH8ydpXTUQk55zFf965JjQ6WuExcBJySAgg0Bsj5yrr4caLBpIiuD7YuQnhuvX0E9DpLA348sNg4SsziIKVQwANKjc6QOULLFs5dIxJJezLDddQzoc3eLFFKIMRt5EMFcwKuGyl93ehXCuiQssow2HfjK/LGDVCIsiG8EyF+AvhrEUII7EELYORPxfNUgCaoi7YxrI0dwpONjNc44TQ6l3B74JD/61ojsbWKq5cdpO+msE78vVgWkKmX6DJbFFR13DjFZ3ipinYCIWxjmCq52U3BfMxC3IpKoGTOtUaeFFGX8JD+ihgTXgBxmPtCmHcUyLLvQLdklU4mZQIjl3Q7Apd623X1vfO7f/aQScztCURNAR9eMv31DuK9oiAoVtFTJ4VGB+dnf1+GQwbFjvWrb6Ui8aqK6OUAxfuymoRXFCcIGElv3O7EmhPX5/BxF7BFQJ2e7t2oGMvyCsgclxPdSdcdHm1EWpnrd2XHRQH/zTGqBc6qvUBygpYMdp8xTAbLwjMt9wJPObTnNWsQsCpfLo3JH9e3GUtlmH03Y4PuTFfMHl1ufVSHWiNFE6csdbuxEytX8qZlTwFi2i+VJPBYMFikm1gyTZ0/Z/O0fOQKRlBdNALGFvM+dAVJhyFBWhl9+0iArY17heM/VcZuWWkLsgPzmmSYATxgIC0vry4mKb6eDxU+9vxrNpYTNeZrxWWNL3uZeJkZaYJLlj+6qN43AtNiGRfSdHAudGm+4v66n1Ue+LXHL2kPeKw93VKrOmzYhG3MiTWUjuEzGbQsK01aAjmS4hdUPLTJUUYMIc4U6ccGQP1pR+Hcuuoq5ZUPgpzrc2QEHpEJOXxH7i9iPIiuuMu3Pl1BVlTY+2lx54CUQv9Bt8l/IgM/5VhfR2Hj0Vh/j5d7hjJ0I+MEHugMaiiJ9KQOVVGdtQLS8eVhqQAiEcBrw2ZDXdIL4U0gegdQs9/h0HwS5KF9ipnMPy3rxYfYq9fequMmielyxxD7uYTE//qoBRSEZdpnEj3yC3SjbsuO/R1zRnjKvjY4/qnZfI4qOtdv6+myX3jID3//MvAyABLpm1yeN9mlhOTxB6kdqwOfyB+rf+z//+jHz/6GAl11593+f50tYfk6a0tVBtf6k84Ly12asrVpMaqyvNnMy8IDbF//3WbnpcMAAAGDMAMsFvBEqEjUU/V8UQ0LjZEpv5dKQNYvvT8nSddmQ+OsBLSrD4YwONc0gKVWjQdYbJbHOT6wlP/5c51Mdh/0uHGmMG2SSO9KhYQTqSuozK52DLzH7d2d8RaUxZBAUQHmSd8PSxZUN1BnVbximdX1lgY7WCIqJgVjlXrIsKzY3l3Oy0WfPCavXTN8RukVsbwJpJBCTzjltjKmXgLhfhMaWBit8JZx4ptYNIxha3s1hXu/I7JbTti+jRRlSWECpmNlxhRdY3n0SwFzt8AvZR8/ar28rUVX4iBXhys+5m++6yUf15LYNe91zrX24wFn+oZxtLkybofdvrwCChm3MQnAo82WyM9gJRO4Nwlo3yeUBr0FPeU2//W1pXXI+duDdgClfd4AK3OV1elp/3fte3zZ7KQD8g5dPX64rj0BKXAAAAAAAAAAAAAA==',
  },
  strawberry: {
    whole: 'data:image/webp;base64,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',
    cut: 'data:image/webp;base64,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',
  },
  fig: {
    whole: 'data:image/webp;base64,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',
    cut: 'data:image/webp;base64,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',
  },
  watermelon: {
    whole: 'data:image/webp;base64,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',
    cut: 'data:image/webp;base64,UklGRuyDAABXRUJQVlA4WAoAAAAQAAAAfwEAfwEAQUxQSE4MAAAB8Idtmyo12vbVaqFxl0wgOMSxuAsQdxufuDQWl/GJu7u7uwsSDxD34BrBSaChfdWft1Stquu254mICUD/7///9/9/UiotbRycW0b/MEGtnrb6xI3Ev+OF/esWJKjVavWUb7p5OzjawpGFV0iXqOhv/9p69E7qu/efNVqtzoz/zmajTqvVauurCp6lpp6ZGBXd00cJOYJDYKvo8X8t33IjswaTary5acn3bUICrMBFsHULHfrb7rsZRV8w+ZWZb+5s/GOQhz2YKOz8O8Wcyv1UrTdjepoMVYWJ33X3tZbDh1vUnL33qjGltbe3JfRqqQIMhdvIjRcK6jHVa4ofHZjpZQUSjk2G/PlaI2Ip1H/aMzLEHhiUrcfuTDdgCTU+3zK6iyUYKN3GXXpbLWKJNVfnXJ3uaSfwn+AVuShDiyVaV3bphyAV3wmhsy4VmLGUV9/5o7HAbYJtu30ZOiz52pdrQ625TPD7aXchZkMxe1OkE3/5LbhdhdlRzDs8wo2rlIFx9zFrlp/u78hPTec90GEG/XhwmDcXCQ1npOowm4qVKTN95NzjNvSsATOs8VZCE4Fvok6VYsatT5vszS+K0Lm5mIWThzlziufUp5iRy3dHqThE3vOKBjOzuXi+D2/IvH7LxUxtuj7MgSuUkZe1mLU/7Ggh5wevBWWYwcWMH6w5wW7ERS1m8/y1LbggeHMJZnbjnSFK5rOJvICZvvYXL8bzmV+IGV97ph3LCV2f1GHmF99NtGU259gczIW1m1vK2KzZ9grMifpbfQQGk/d9bML8mNFfzlxOk7IxV2bHNmAs5xVlmDM/7/NgKUXzI0bMn8eayNhpZJqIOVS8+zUrqabkYz4VK2IsmMh+ZhXm1qpYewaynlmNObZsaxDzNF6tw1wrXgtnnBZn9ZhzxZRQpgl/bsb8+6Kdgl0ibmMuftpHzirhd0Q+Ep8NlLNJ6BPMzbnDVSwSkSzyE347QsEeEeki5unMITLWCEnEnP2yC2O0uGjmLfFma6Zw2SFi/k6PYAjrJRrM49eC2SGuFHO5frsrI6jiqzGnaxfbMoFyahnm9vJpCgYQxpVhjq+Il0lfdA7m+tJRCqkLuo45/1FrifvquJn3xJMNJc1tJwbA3a4Spoz7DAGfE5TS1TMTg2DWEJlUBSZhIMzsIVH2u8xQgG80laaRnzAY6ne4SlHEIzMcYM0smfS4nMagWNRJJjUW6lpYwLdbSE2XlxgYzfMV0tLwLAbH+tGSopxvgAecFioloW8wQBo3OUqH3RoDROCKyQrJGP4Jw2RWF6lo/hxD5RFXabBfaQaL6p+kIaoYw+VdHylwP4sB07hIRT/LP3WQgQsG0m9gCYbNw060s9tuAo6PvWjX7T2GzvOOdLPZJ4LHl1g51UaVY/i8G0SzxqkYQI1/KumlUFdCCH7qTy+fZxhExZXUstoqwgh+5kurqGIMpLpfFXRyPYTB9IoXndpnwUnldwKNLLeLcIKv2dGoeSkGVM13FLI7gEE18Sv69MiDlU/DqWO71gQr4n4X2jR7iYG1NJoy8p/N0IKPWNMlKA+Da1kIXWYa4MW4UEETxyMYYB80p0nHDIjRxMvooVxihhh81ZMewY8xyNb2o8dgEWbwMVtaON7GQPuhMy06f4Aa3S9yOghzdFCDLzWkg8dZDLa5nenQOhNuxNl0mG6CG3zOlQby9RhwDQNoEJIJOXirJQUGY9B92Yw8y02w8+UH8hySYce01oq4Nhmwgx80Im5cHfBUjSTNZpsZePA6BWENUjH0Pm1M2PAK8Pnch7ClGHyNK1VENUqGH3zJjaiOFQD0oiVJskn1AFQ9iCSrPSIAmZaQ5HYRQ3CikqBORSD0qilBfWpAyBhP0Og6EMIbFMQIezAMpwYQI7sBRLmtiPF+DESVPwikjK4BItNiC1J+xVC8RkXKEjA64ECI8wkwehdESLNXYFQdRkjbfDCqGUTIsFIwEreQofxVD0Y4kQyLVRiOb9sQYbMVkAp7EuGbBkh6NREhFYBkmkpEaBUkzSVilAaQxG32JBzAkJzsQ0IiKKUHEaBIhr4u+aD0KJiASVpQyg4jYKoJlL50hj4xCvpwNAEJwBRFwCzos1otAp/rYQx8AfehL+gh+KX/Xz+avYS+sFzoa1UIfR2roK+r5t/9WhdDX9MX0BeU/m9/D6EvMBX6PE5Bn8UyEZai//lQggmUDD0JmApLlR2hLzuUgHgjKKUHETCyAvpaZYLSQxL8noLSPX8CFMmgdMKdAJQISeJaKxIuQ5JpNiJxqg6SEogIr4KkqUSEVgJS5Sjoex5IRHAmICXJiHA8CEg3EJEWq+BI3ErIMjMYfYkiQ/ipCowqQshAbfLB6Ik/IS3egdFWG0JcToLRKhUhaBEUaRLkpPwCRfltEamd84AoJ4wYZRIQvW5OjLDQCEOHHIhBvWtg6C9Ebvs8GJpFkP1JEHoWQJBqnQmCEmUEof41AGReK5AU/ASA6r5BRK8EoLz2ZI2uhZ+zzmQFPAcf0xoVWQ4nwad2KCJbFqeDnvwwwtCwCujZriKtURrw1I5GpFvtBZ40b+LQMNgxLrIgr/lr0KkcgcgXVoBOuj8F0MASyFltQQP/e4BjHIZoaLXaBDe3vKmAxteAjWE6omNgLthktaGEzRmoEQ86UwL1rgeamvGIlp7XgSYngBryWVqY2ayiBmr9AmS+dEf0tNwlQsx5d4qgQTUAUxsr0MTuNMDcb4ao2k8DLua1crp4XgKXip6IrsKkL9CyTkUZFJwOLO/bI+pO0IOKcaMDfVwegEp+JKLwN3WAIm6zpFGze4DyvjWi8rgvYGJQC3TyewomD0IRpYfVAknddBmtnK6IMPLQG1F76EcQ0c1A9HbeByJX3CmGeucDSNVPAs2UM3XwcdELUd3nNniUf4forphaDxzmZUrKIc/zwHEnCFG/VzFoVI0R6KdaYYaM0+5IAkOfAEZGVySFwjQdWGimIWn0TgKL4w0kAvUtAoqiSCSVlsv0IPE53kIykOcdiBBPuCHplH1fBBDpYUhKlQuM4KD5CUlr4HVo0MxWSAzqVQ4L5gMeSGqVMwygkBkmSA5y3mcGhJcdkBS3ewQHnyfLJEkYVQ4Fpp3OSJpVv2lgwHzBDUm1ywYdCDzviKS78QMIKPpGJmHCgEz+q4mRIymXjS7nPfNOeyTtDfaJfGc6E4ik3v8Y393wR9LvlWLiuIxuiAGF6Lf8VjpZwQJIPrma16rjVYgR40r5rHY+YkbLqZU8ZtrnxQ5IFlfNYfdbIJZUxJbylnizNWJLy4RazkprhVhTmFzOU+LDSMSeVrGV/CSmRCAWtVDXcdPbHohN5epSPjLfbYVY1SZGw0W3IxC7Ksa/56Dn4YhlZcMe846YEorYVtXtEd+IN8IR83a6YuIY7akmiIGDL/FL/eYAxMRNT5s4pWq6G2LkwNNGLvk4FbGz76oyDnn+vRVDIdX4At4wJHdGbC0f9cjMFbUHmiPWlrU4aOCIwlgXxODuW2p5Qf/oazlictdp2XxQvSFCgRhd6PJCz37iuzHWiOGbrq9hvfqT7RDbO4x7ynZVcxoi5g89U8luhgfDlIgDfSe8Y7VPa8MViAsVLc/WsZgpbZgd4kaHsTf1rGV+ubwB4klFwO85bFW2rL014kx5z7PV7FR9ob8ScajtmGQdG+lvj7NFfCoLiMllody4YDni19ab8kXG+bC/M+Jbmx5by1mm/lB/J8S9tsOv1rOK7toER8TFDdXnNSxSlzLLG/Gy4P7tKQ1riOd/9FYgnlZNOF0ssoP48dpca8Tdbv23ZIpsIL5c3d8LcbmN7/o39dJX/3qVtxXidqHJ1EufJE18f2lqEwHxvdeA+W90UmXMW9vbCwGg0n3S1fx66TGU3PvDU4Wg0KrHL1eKpeXD1WWDv0KgaOHZOfZphVYajJUpE7t6WiN4FJw8Y3akFGooV/72+J+h9ggw/aJm7kyqp9bHo+u/b2eHoFNh3ajbuNTCSoORIqJRX/n+2byoto5WCEodPfr/vuza22KRArX5b5/uXzxvQICTHEGr3Dukz6/LN6eayKm9uGr54kndQ5s5yRDgWgRERvX980JqauqLjGKNVqvV6o2mv5Momow6rVaref/uUerd+VHRXRsICIoVdo6OjgHhkeNj1Gr17AUrd526fCPxb7x+8dDGTSvnJ6jV6gm9QjwcHZTo//3///7/z0lWUDggeHcAABBpAZ0BKoABgAE+PRiKQyIhoReKnjQgA8Sm78fJjAwB/AFmA/mf0AfwBOtU8/tOprkv2D/F/Lv+m+7byP23e9/wn6+9q/V72t5YXR//S/zf5WfMv/p+sD9i/+b3C/1k/6n+H/xft0+uv96fVF+2f7U+7f6bf7f6hH9G/1H//9sn1b/QP83z/4/ux8Nf9t/8P7je1T//+sA4RX+S/gB+wHyE8GfwX46fst6l/kfz7+j/uv+W/ZT4+/tD/i7r3qX8p/6P9d6kfzT8Rf0/8b6Gfsv4t/IL6d9gj8t/rP7AerD93+2HeZ7d/tPQO9+PxXgYfVXrB9r/YF/pX+C/73rp/4PDK9m9gf9ff+n7Vfpt/2P/v5vPr//5f7b4Cf6L/dv+769vtX/cn2Pv13/7ijsNYaw1hrDWGsNYaw1hrDWGsNYaw1EIjLJ4lzu8s7a361xUHkQIgL3O0owpuJef/tN8Yh6CDCfj/+MSNMQ7h3DuHcO4djw58yd4P873U9XQex9edHJxgv8kJ/HheU2mmhabtEMjaYxD7pqmxnc5f4qjeprhxj3YtIO+WoF2vCO6q6Cz/jshrNKI8bUHEELvivFeK8V3rngaujTTb+pCfm7Vj3CZmXRS6eZO9ngP+l0dg+NVsKOpDoZOa1j6mTkO3wvkGJhnaQJ7ZLeFkgCGKkzi/5x0nefAC4VY+sxFlXNo3h8/vN1XhkOJIxZbOPsDNWhGfjMCKuHcHQsYgztecaKE4eRxwN6N1bqpe7ww7dJBOELnRuwXATxnW305aZkQuAMwCqqWKgtRayxHaqdK70o3gioKlJKf1e14LqHnBcu3EV1hZJFAdic0InW3jZzDl4TczWO5xxGBDMetx5qa9+ttbZpJiinXl0hn1kvpEgTNQlmPGajVNKZkgD6ANe+oe/Ikuy+mZ9wDrK7HrKcLZetf5UtRyAGQLc47ORntrbwBoi3BYZ4qHAKGYE7PV+LQcAmu2TYP8PsHLr0S6UUQFA1onnHKfzQaasQuxFtXK87si8DPvEqfdyPDHn9H3/5iBBzBNoKqI4L3WgIQ8hqr91PNIoP7IOleAuccRiHsnceEl3um/dNw+ZUTt7hR3T7KkfRULTyE/z9EnAi6UEPyilGDICXi194gS6s3mvjNxziwS9FIvcwfMQkvVu+NVql4u1k4Y+An5SYLabCgjDnfLNfC8lfnTxZzUDgxXe6bXyydNv9E7Ftp4tz4HNVyaz1gltonA9ppvTmsHSiE9EuR97UFwcQOFQu9wRwb4Z6vCdpntwrwweDsu2AcCIntLVZsW9d6ND5jl37+dENYFm5YMfiF9scXehodaCgnKdLPIprcm9rGbFB9fpCF2jXrb7tIS1lbALYwkZIexyspdvqqjLcZxOL1mmKxuiBbzM4SF3r6wJvg7H8GLCIvYThSkMGhVgRkxziKEfbdLx8mKKXw0fu7hkW8WMTxAw7VRn3RsWUBH8dQ2mgU9Y8JRFDG1xAm2hJFWqbf5T3eusN3lMGXfEsAE1ArKw9SEO6tmpfVdrWeXsL6V7tacSDMTH/UHQI++qHy/HDpYrIhHrNyTZu8UoeHV1gU36Y4FxrhBsgpbUjax8Vim8AWa3YaLWDOfDGO7r1Ng6h6vigwo74FcLqlZ2jGMfBGPm7LyhyyFBJxBIU6LXzAgOqKjH1OqFsu37kDPCDz3KAgfBjvTGaX1/gk2XGjquhmzd7n51l6jau0p6zPizNjdTT454wX/SUoDiVvG8U1JRcykwU+dAL/wKg/SH7bNthOp+wrs1qvz5R7YPi1Dh0KRXi8hjA8s5HKfR9hwLbXyNn6l9sAsMNN2dhPFzXYatim6BC35ses5ajxMxxWEN8WziY9RCr0z9mYwzA+FNF7NtHWNoCAk80Coaa41Yq3WiMo5iaZP5A3snL6+zx3Xw7lDugmHP573BGA9XaMTmWfI7Q1fiJ6JW8puFKNIenIfKIUO1TZ8HzpLl8Yx3lStptYHqan13ZbPSfZEfIZRaVaIUssfl2i+RZcG2sTj0oqSnEKHh+QqmFbp7oenCy60B2Y53+pCSPz+uBg20vO5kYjOZKZkazvt19stQ6jsZ1LuRjy1/tnrVlXWJQ6iAproPXF3dYVJOY6sNWEMNzVGgLBIqLVb+34QiuP3gGhOnbFM1TRnoizjuysNKVXA3adhWmpx1jgy0dJW9VXxQfYP2EXQ8uogMx5IghBN8XdGBP6OZC9xdlvtC82YzYeSOMzkThu/tjDik4qjJ2nOAFR6FsfvtR7ol86qVZuVhGIIbP9pXzLWBouMZlIGm0uo1IAshjZBIygOa2zk+XpP0Ow1/+eY3j23IKeondztyRHvn1YKEBuEJ1ODhHpbgMn/lzYbegqa+5HezNQdclcWHJU2haTrFfYJJI6oB5pWd59hVFl0ObIQiFnE2yw6VLwCq77R4A0/jEXbTrXMhxDd8/nGxLggDSodMJ/tP+EkxPSI8IwoKCyo02lc9s7r2RP5yp9VpuO11t8LyPUPbtTWhR99VAsAmNpNFOY6ihFDjkAvP1iB03e17kPLH2GyYi/aAqVBk1cm54T/FQyxXwXdCnU2rsQID7ijmxNwGkchGoqnM7yUj1u9yFHzvkR2Ccvd9ptcc0lHMK4V6Y/0ALdD37LHyXUYkNKhZaBCBta0pr7bAAE0Qkf1jwCTxTiS56HfC7OC6Ng8M1j+C5MVsEbjXEGUcidRBeozY/KhrwphgwjU8xUWf4yjJupft9KyYSjag2PvdbXfocK9ER0CphVyItiN87FtWbNXLBqRRv0oHer+YuD8xIRKZmhlD/XtBmrZOwIZ0VxDlrNisvF5c2eNv7ZfwXNKbA/3yz40m1Rrah3pJ7giJSCo6Omkv14Nlh+ID4l+hR6ESlGlebJoqEbwXN1p5dqiUCfaKVSNI50FWDzfgNFomCooWDVJ086J0Qf68KNQy0VW0QxENIVVIxDDSGjWmaB358aXn4kLjlnWNimLFX85RpR+Kd6q4tmuu0KfurLvey3XcFuikDhTJ7mV0IFo8hPnzKYPw8zHBGaX5nrS+f65Xkg5tmf42IueGgKo9n1l6UQTsQRx4nhZHbpCZPcAwWtHRPU8Bftbs4U4/WXmEhiwgsLHgyrMkHNZF/LnVC4I3GjVH3o/I4LCEo6V1SiUf7JIkd/HDuygXMXns0487cYAwNuc71rJEHnPoJJC95COCfY9kD1q5aHPewJePTPxnRvydPJB8XvV0RZR4XgzI6MWXh8+4xcaV4IkXFL4kLjVLJRpFEau1FA/FuFc0nWbMVUOggk3+BDbueB6gVVBNNdWW7GshmaxCIPscjblvRXRtuCRDglcs9YuBPa4qPzSSuTfjZaANOjevg7O6sEyFlvn2t9N058TjOOJp5pHnM+/I8V4rXPwHzLYbL/Is9VECEPhekhF13HblzVph7AphvkSHQ52p/qJfs/Ovt2wDJrgHuRVF5I9+52lJ+HIqfZcb+vnmMKvSV32ukxkbnWbUFICkHsRAHX58I+9l244NZzOV3l2lawJqoDApRKvm7i9KX7OejV9zUFspyECYl3Z6Z/M40THg/ZBKK+z9Nrwbflbcx0Aby66+qVCoeTCXfB6U1NCrUrqfG3sfD3Ew7VAhAYj6daMTfoCrLfAihOgtvyT9yIxlx6xbjejYzHAInC8VwmDDmLd0HBWYZYS5ZUwaH62UkTyujeYgp6MOHlWX9Mf/ZEt93qRKYmJeVgPR+lWw8ZPy96oxXqtXX3UQfUQ76ihoNSPSxJG4dw7VSmQICZ9/VemR/FQBNVM1aIviBZ6v3qRTEUrlKXgRdXAT2w9KadVpf2yAXA5cYqhdnc3+Jk4mKpPLYEVaka+MQ8vPXsoZYG+esUAP7kBwAAAABfe80YOGqP0sySZddDMKcYXXXCoI4DmWuUKW4VvGEbvp0VOmz6/Cg4/I7RETPd/v5ObrhA/GrNL0ivX2uljdGX+dRk+yv4z98RNZ+iSzYIdWT1TtuI/8UNe+7dm6scW62gLQm/mHZAm9iQtnyfJpIcWgLibaHo2/rQt/K3EYLhipGOtSgQBVOH6AtrVE5M94rEpXb3FvTYk5os9XQCL4Mu3oRRurA/4AsydSJiKoaOe+YDFm/b5Cx2K4MrhjlBeL8EAWEKtXBBfGzOc734Caaxw4CIyc5t0IY61kikKmyQOsZCyND+Uvx08EoVviTU5aypLmszhFtfg7RQDTN2VsQgZH9X82nA3SUNyHDC9km5p/9S5+8zXweDg8gEbwsOsHCv0MfNGCPg6cY4fD30IZbDvRZVFGnNQgdjP8qBq/9OhKlu+PuuYNBs79GhwJJl2qYOKbVLzsAFbuyMYe0nd4aSKnUL/wnpsDDebu7f9pNTcYjeh4HMXu1C4sn0i1iHu49W9TtBBC39c2aG0H8x8p4R++Guvc0kAABk+92T3bXnae/mG4lLo6Wcln6C2TJQ1JnwiuWLiMtCcraLP/wJ/1A1g2DQa8nVf0WnIGIgwvJmJer5SKKLUGxSVZj2shPyLxjA94WEMagaMANgVcOnWnQacSq8Jf01yVtxEdCBvYZyOOT3JOQGpWiffrUBtZ4AKxjJRejOaLSSAfIFkijAHqubhskUC+nYzFkCKneNlx22nL+raCMttQALHn4TqlPgFdfl9Lgzq05pq4x3ukQPwT4EJ1exU3KtEs2JjQuc/aQaSWtgaAdIv8TD6jP1nGJH5ZvS6LovDDj7bxOyf8pBF+0dWrMpp/70rg4BTYPbY/oQPbul0hfxHMyb7F9PHdtlufVmoxqm6p+vH6ozcaFCM1JsmYHSiKfdwHGiIyO0NApcq6T8/RK+zsim5T+35fmueB+m/IkTf/jwzj4voG4xH7YbOS5QUoG767cvxFINOjXIfDCpYhPSQT0x8mtGW/u0XuUBz7vQiWzUh+drEi7j1vzNPUMy87lBYBjUC19uBH5/EownSRDtFlhAUYStzEwJnMkeA4zhR4PQWPyycxaaSosoSmTJtAu4VHtcDK4MT1KFM4RrwakFg8/lWTx3ESpkqlI8VmHWiudB5Xh+rdtPPtByNp/ta0AHExYnj5nripDdN4uWu+G+mdJfsJTCWvTIxwpKs9CMdQ7pDJZ9lNXwchAcwgsZsePpWQ2vkdGebCOSQ8gWZlvbF7zzpn1v346XVcI184uEkyvtLqNF6f2IXjb0qFiD66CiDqPtOK3dyJFJzr1Sz4Dl+7nWNhZs9oyuqpemn3GsV8uV2fpym8AWPh063sXvJ3Qx9DvaiyRn7+Nxo6j5SOkNfkogXgCTsORaqaoc5cwo+VDQ6YpJYSvlIKEUTZAKEantIRNSXOoK48sH+MNYLDNEpyzhXiRxzMljr5Fox50kZkcYwhwZSp1NxvZpdOweMTUULAenTG3ii7SlTB1dbW2jGgwLps5bG8pr9Ju06DtAONFhKXeWpISRJFthfHznKsPLbtQ2OsxCdZmsZZ2MwvoirxceVc8G/1NdbkpPmrYAWIF9SubRF10iNPh4iiBAagtlRyWKzat/QzlHpCEPPXFVlx5omZDhvsDv5hmY0AUxw6sr9e8UVbyr0H3w2gTJXC+YAuDKV82SE/ftsLz5I0ytOvkxu8sOIDNd3Wa41mjKZPYR7RvdQ1oWoSj7Sehjve0ud83D4ynQo03b+RLMqQEE+fVbIt4CGAZSiaaIwaBq4u4D3tF5w4UdY7xqv1QIuTy7ah4BsvWIamuzgBaTPLR4noVG7EH/jH9Nq6s7DF5jmBb6fnwpPExQ3ZQ0mw8qr08M6Vfg7Zr9NPC9AGxrGeDkNfJStOZ0sRcsaxyB+dNi/WOo4i6Xa1oi+WppX6ors3prAiPpmVHUzwoLCCC0k24Lhw+fiEsxRH1GyYiwz4Y3zg0P6jtYnocHEimd7tX3F6msxiABmX5O006Wh9SuFWBC6SK8Sql0a/JQ2lGR6TMoRexHSFqwSQhcpwbQm49H8WfyMMgSyYqqjNa+78Z4YmZ2pcgUmVw0mhd/D1TCqPaNQELTxNAhdZ52GdvbnQcexAIcXgDXAoQ6VCkj/1HQiTM3P5Tmv4b1a3nXmn+zoDGqkSR7pGvga/62FFzR4TaCnNepUs89TLdxHv3uIOh/gqamoCVzBMTwnU4xnoTN0DvFUS4L80zxQBQrMlOGBrwoQjA5Bs9JGtha/A1JRfa3dk0zX3nb9R2Tp9i6/GXBvqB54OmHbcEWxVCgnFio67bde8mvnNZVRc3lnkRNfYmEXJa2oQxwP3H2YoArLtj+rvOss82ZK7cVZnSJD8SKHQlPuGlK9XdvG7CHR30exPsx52Cmk0n3R6TiD05bfTQqCyCVmZC7l2L9hBxdKIgHSh2ncZIzWxiddJhvruWOS5gFIZcNAcGPF09TUuFeHdE9iHwliwD0eUZhgxzRYQkxIpQUTrN7ZCi1iC0y+aJIMmjP5a2ERT0YuMASIftdAeZ2/Yn/+vVRuowklbWJNMFL1yx8DoxcD4eWwvD9aHROXPO+ErAts8YNuyqIvjgANPwnPamaNhdckCZTcvsuxUxkGbrNFQKt/4AG6PX5U+HRglpPn6eNZ3gdWplpk1tfhiXUyL2/X4j7/DRkWJG/4aeJw8qRUHXieg2RU5s3Lw1+XRv9MhhA6ISv0Jc4PIjgEhkTDBMsVdZI1Mi1HD0KNaPb9bgkaqWXvZIrKou29zOhDwrzV0SkV5DRfz7k7YrZQk6lVF/j60q/zgZip/4yLkYt8iwUeZ/VCBIwvwbGtmkUVC9wvZUVR9DqN+sCSIck4n6dPTantgRlT/C6XsfJpWhHy7H5tQOoaOwqFMlxznnZrDARBn5Umfm2wDzMcX/vDzTL30ebiUUkc5oPOvPYmwX56SBaSzLpNNB6MIEr70oht7lb0QzgWUuBEvkF8MOCdvI4BekRjAF3mq4OEN772fDNu1ZV9ESQX2DfQypNAr6lmrIP+RDBO8aKsmqxuwhoIW/Be3MntdBLdgEsk7E2w52M16eJOWNZQ9mWJO3b5gycHVu4//72qL/+6dNu5ONQQSe3aUmsZ8YH59AS0vbDBl7Z7NWsPAFD+3hO6H1CFc6AthGtnl4utrpGpxAq/VGmQyf/ttBAvKPmydNAlMbbAhsS3XzIExeDI6lbQbASFIFVzt3on0N+vouYjAYSOzGv0TfN/viQTy6UeKD2D1aUIZElr3Py6dY30EkXW1X6uqw3w0a3uQ4Yu7bI/A8xIJSnBzGGw/6mB9SV/pw66jp2dVsvN0X918zNZ/IDFPlaON3q4STIh2okXF6OR9b4sjKHv2KIdenb9WrJ5ZmnRFtNcloEire/0lpic75xs93zaEmdzN2WcSNUcnAeoud0Ub6aqdk2KO+xmhKvTO4HwmuXDwY65Hlnon9St3ItKuVxTMGSvOTXsj3w6NSQ1Cb7iEPoahZJa8pDkRikS72HDHEvN8zyl+4FdgRkEEmEjJ7DNqp6uf5MGzEkPhQVFOk6ZSx+jiqqMsX063rAFyFDz525H3eGImiish1pzK9AT78FOWpJJ08+Ygvl4bxP4+yUrsUrU4pexqHFqFqoITk7PA3NG9gbwZcfB9yh5w5fQuCE2pczY60UgdJoeMm0ZDPPTm9GL8kK3OPL1yML8whf+2JTZ297hUT6ggQNx69oSfwm27fFjIRg46a6UrVgGWseBXnI0F3Fm50WYTP4kejFpi9OqtAop+4GjU+IvSF+Z8g8m6YVfMHW0uOVweox6bnxHkFWpG8HsUZY+TvNSN/qBvOINAFRQx7U/x60cCe0VYkTWUaph4Z7KicUXwOYlCdZbFIw+zckFGxynK6HSq3/DCB3cSkJCWxqrLmfNi3U7tuFwstymaFVM0n+xmsQ7++DpedmKNKVYuL9jWnTmSuOLc7lDKPVrCkHy/MD7zC8T2ViraHbpS1NTDfmib1pGe3wEf0dsmaFcKA+1hSCKoG3qYEVjRj01NCKMM2qcRCc7wp2enxm7VdKSB0f2GAEbE9YdYKAbsy7cy5xGtsBZkgiQ/KaCtls/S1a5m6aGiRCXkgPvKTL0FAgAbYM9LUfkr9fKB6qO56z/yKonBLtOZ2rtQoJK4B3CKZs2Y4dP2uCdwaYa6wvu1ZsQk+ssyCqvYetvZCeCe+ud4Pstf6zPsDynvtshWbHIa8exTwZAR4jgAg/AA1BoRE5/S6GK3xfeQlnEOPp+DT34lCSsfOKrsyM+kZ71NCb/JVI45Q5RbjI/DTTlqDOB3w9lkSCpgLyMpgdF/0O6+vcXq9jsZHVwUpXzv3/qBfAcpLE/bLLA8ij8I5vKegAs8lRZp3UMBM2fIN7iekuojxHqZzNlBN78YUDKcT9GM3btBulZwrDFPBPW8w5KWyoP/OefIeNKHgUJXdN5pXga6wF3QRXbHZ0OzI9OQCT6jnLxbIJHPJrpo49mluzwsX+6Uoepl1W3mLLMtnEPCi/U/uoEIVaTKkCEGA1eVAysoK9LjrRKO+Hx8seofQG97pwGL8x6kKVdzwXqtyorNrxENKuEA7aZrBWZm5JY06J6OS3KqceVU/43nI7yy29/KEdy+jsKHYMsW87RG6DrX9v0wfHSc9Ztv9z31GT+7R1fCog7Kddn8Vv0k1uHlNNJELacIgQV3O9Vx5QSZaVdnBQ/Kk509yt17WpoJCo+LpxFgNOBmyyU1Db1PrNTLQkCwsWJKuUX++bq7BwupxzY0id4r3Y9hdkkE8+h8Z5GDN761uXBoI6nz2DLXLD07cPDzGqbtC6VS1wEIjg9XjbEYpHAugD4+Rt1E/CbZnYE5FaAVnBF39eeoISbpCPpqAFr25XkZFRxnoghIO91iXzR0VzZ2oy8JtXD3/UOSZKHYVTakOg/RTSfPeMjAKhFKoDjKiHsemzkAo+odS65wRHxWC/EuhGECP1upj2v07xszxxDaerDmEmJG6/ZRGGuWOkbcQje+2A1d/xJZ/l6mVJXSfcUnJBj6SU0tuGbCCWsVtMXZDwksEHnpMyyPcpb+zSmp3dpRFr/9jRv/cqWhyfJFOSpQyDeRfP8Lsyqo+uP8hHmiKTCtJu+POhr3QwE3oa0JyPS7d+WpsNLnUfwvr7/UXfzLymu9uDC2kP6yXeF7o+Fhg7rzWmf1QfqxkfCZVJkA6wlEUhrpG/xmJ3fueTxFkHYNt5KQ5hGyXZNFni4lWAJUTcTi3mgJWT/Fvw2mcmziRiSZ2U5ZGikNednLU62SZlImU5U5MUiR75ofYYaDUkvPwNcpzMnHEDJa+KbUx5ibGKXvMTcYxr1wMLoQT9RIUYewBXffDFxkaUysszIogliH52MuKlIuS2Ct3QzCnLolN8bfZawgYNLth+Bs+671UXHV2vmcnPoZFhkQXHuUs9Xf1vNsQwgq5bP+vGsGEf+mGzNWPFa2YcaoJRzDo3ZbhEowaKpT0D/Z4FUQrFnAZTRHpI8H+gchND6VDLBLCznUrRbI8eiHVZLyFlT7BtUZgVuD1R8icXzqpihNc572uqNjRk/y8HS0TNgyqR8j5CwTlifXW3GKmAuU4BR7y3+FZ58CsVodkp5S6fuhiNhht2gxGFZIUYw0KoiWKRor2kVlHvEibTgIqdgjDPKxth3EZPk5K+HiX+pBfknJRZmV7iQ3SBBrrOQTpn50b7UfT20wwbyNQO6EjaWiq+Tit4uTMnb/TlyKH4iFjW6UJPOEMC5DxoUO3QxjcBfsNSqYLdgZRyCBM3sWzqN5hXtvbIeIW4FGuEWpAJAo6GmlMvCXw9NKYUEc/uXeoHAHMyvRKITQbhCZeyZZYQR5rJlaqkKWjaSQPJd7WWftCx4wgJyU4D4hLdQTt9SH2YIof8cSKkd7GbhpjD05KR8Y7SfOVKK99QB6rRTvkz4zlkamCmBl5hr9vjO8gjOFmGMGxu9wjbLkQyfD1uSX3SMjAAX1SAW9Xscr+dblEsH7bCvBDvjjywRWfkfS13nrwyvfJPOOMz3lEJrjHw3HZL8kth3bsmW/j0MSAxGCKCwQnC8jYRE11Tmakw0s54hVryK+/YKrODF1/HajXnxbDqUe6PbfUt2QcEh/0el9HuRMbvZAa4V6L1T/y/Ys6sfQ2pjuIeQZbUBYqlf39Wfp0wyY+lpWUnlIQX4Apocy/9KFDOKqs3bigJHziqtzEf4XGuartRMbLtIcNXC7zzTdmOxzS8s4Qew7BSaIVBSQNh+En6SoeJg3vuPDkI0ruGTolrwFjePktREE4F+sjzcahwF+dgxgQ7BN4IlRGiURjuGdqA5d6sN9TpS/MC6h2sDj3DjnGtf0Z+TZlKVWl1XYlBkKid9RMMW5j1mbIA0foAGjlg3tYMH53yML3LF3wdwIqVoJtbcdPRpl96+GRCgQ5kbq1UnSv2VGajqqL405TI7hFojlEiGXFPQP7JZs+4vlbQ3MwEAU12dgRtygeGQ4JJ0NyGur89tvMeZtLEmmupOkgs/K46bekrcv+NEUD9vAUqKJ0OgHzDGUmuPsdq1AALniPu6fCbTy6EDfACfVc1Jix7bEQbf+tVmLf0gziPVZcIH1b2R/a+i/Zoh3Ak9XPKcQPq3Of0W87vQv0bjSNcNTZ1VZ5HrkYOZJ26vQheeTHB4LRpH4tOVExqWtICRnf1etRVhwHHt7NLXIR8vb9WsSOfEHwJTThf6pQA1AlT3Al22rTXeTWwddCr8xK/fdcwZRgiJqqtzJF0MGlMl6StqHQhnMRhlvtmhPNU1z6NqZgjQ71X7ZztCN+sUoPqr6g2KgNkbkpT3yvl6j1fBatrEXsdtAIHkP0Iei7KfTOQeQjPsKLt5EHpVS77vCa3FHhhpDB8xjXPuRUOYpbhIvBB/dbk8BQ8vUUykXAviSgnUbdED5boQOee4pxDcuZOVpyVeO65vHKf7r/f4bsrQPnLlhJduvjw+iat3FAJH/gQHWSafBYx9gooXkg/WkD/MvIxgO4e5OcwaksQAqVyFFa7TBOSktIfB8RZSMBYhy90W4d3lU4zXGx/v0epvMpnB7N/hPqH40gmIhNmkTKDc3y1Sbe3k+q88sbR0BX8447pETFROT/CPgOETzOXm0OBad+oRhP5+EX9wtUyVasL7Jnx2TkEIeh6217ttfrNahZu+zsYbPJZEk1NwiO8LYTACDdzU1IN5wXg3b8YOtoMebEzRLfYEqI+ne6pGL+9mms3paxpU891V9w82NFK+PBFS7mxHL+lCRwWafAT6qrNzis1QVVnsNfKpFALruKSmSfY6rv/Et5fJ6n28IEA7jHD1y+g1uYH91PmAAqe2JfqJ+R9HMustUOtyeg/UYOpWMjntACaPyw9pz0Ic0ElSwO3VqdHdSQ+FLabmxxqr907RdJpYP0mcIQ1w1i6lSkk2/PNyoapbJ+UKxf88/a2G4wJ82Cqf3ZDj8PKLVAVTdt/oN7CIfRvrp4DintWw6ISe/eaW64/hpkEBVSv+QiWLVwkVKfPNv4heotjaU2xZ0eZB0DfvXVpY5dWG+ZZMXXcwtCUjU7XMxSSutdPY8GkRuMyTY9P9dA6m2We8NX09SJBUKxg6oK0Ii7pRHfcThd5f5ZMjB4ZicctF5SzjvFT0Rnd43glwlwqnAQAgB9r7IIjN+D6UdvkgTqFqXqMI91S5cGfPg83G5DcMfU1bMoxenCZ2pZEnuS/qCBxlnsjlVrvgAAhN+6cJynLPzZ1QYgfgPlfcFzixTiIQHpfnsIvBpsKbe1vWP7iy5WQkZasBwDjQVZ2tFw29VAHe6pR0NHCswwTunIIvnWcdA7H2/VGwS1H+q9PDUfklmotcZ8UFxAnmBzkVg1Vx3M06vMGbJdjyqJX92U70p9MaxWF6FGwg+oP9Bqb33i23hHEEYm3gufN11ecI6oTDSPKyddSvLqWkCZEzH3T3qojO67WxzAXktlOx0mRFYO+5lhr/hpFtkVtCqV+hsOKan/fZMbGGB7IAC7uXFDd+MznKqqe/RcABoKq/Dnk/mSAsmEHLlT/tTX7yrcBlOcc0ypKadZr/SDs3eWAw8jkAFCWIVDeEBikbbqkg19fiB0kWLnnbScOvsZ7iBEgp+bDuDL627yqMlEhshcTx10jQ6mRJcjhplpl2Y9hxq24AB+224y4VxTXWY55ET8UwjmT+mJma03DYL1WKmPQN+IX1P92J5QlCSZOowuhy2JbVPluAIIIdasDYjsI41rh5Lq0HKG49Iy/Hv8Gonidu94augSg7oB+Ktd5NNGZ3DcgfnvtakaBj3V4YPFG2SPPWXu9Nzvi00depVlTA8OWc8pHd1rb/Lx/0/tGeKoBe5yoyzD82yOL4P4CSn7dpTypkP/OjDiyz2gk9c4CrzDyoSJJ8O6ZteOdcYDrI7NrZSoNmwmyRfgbvzJC8tJ0BvquR7pqiJFqQ1NnzKwbin3XAn+9Ub8Avp/kNj9iVqCpUospogm/ojZOwPvGRPLmnoDa2bW0vrONNjuNVnk6WsTWcv9/lqSuNdpmDrMKei0bx84LsKnwKCEik5nD9Uh3Ts1FIWJn9UGegHeV2XCKGtbfW3ZxhOYa2V8AXoQBJsG9gLK5TRnnLh9CtjZOpYV+6N6nAI0v/tbfhjN39LekM6Iu3iv+M1QYdXVcp1ix2NfA23gsOkzI8c9Peez8WTf1wwYeZ+pyf5qK1dAqzs8O3D/qJbdVo/unkUQ6XAnkGz0th76JTEu+uvBx4/9JtIX6h3AbBxK1U18ZHaDD8qZvpXA6xnFMuMCV0fSqQmDWdyidrcM0VoQHEAF37a4Oi3k4CPe35TVpK3Zk9bgWsTTyXITuYYgTlFxiZK+J6jHk5rrPO/hu7ExtP3uLsxF21yVkARVsMNx67DqBtcCoE//noMAy4j2D+5NVJ4Q1llOHliFgnYqxlortqzYUv3BorfSRVW/3dVPf1L45ViOTmOadW6X2hNHuX1ay/r5oooJOk9T/OnHJfnOWmDOSsIUpSA5toA40w3LrG4rTsDsnWJmtHlswYPojzw+c0ttU5FFd+q8ZdEfkibGcXL/Z8bgTKO8LXAxT/m+6y10HhiPEvcT5CkJoK781ZmGqDyYcFiwMAXGYr3IdB/E6Jl3akwv9sjOmuox4e4Dx4oppRat0WUnEm/9LjiTENpYcXDomI200IPUZ8ZjMkvpvvAbFIxy/+nfFpoaDbtkTtEtIjl5vWWlPlOfLVVfdzjYOlwIVHasGWOlX3zSG5pyKIHK2H2V8nOm3HrNiQCLu52t0STHBmBMEJHxqjREp5btatiZxPw0qgazrrUtuH9y0Cm7oCOA4DUqRD83MX03Povsp59DPcPZhg0CIg7VouLUIBu3e0OhH+rqv9zlLv93wUEWw3sXHGkbCmNZcsPglF5lyS1Kda6+ywt69K1itAmNKrhyhJ1Ili2mSQ8cFpg56uZX1FxWh3SN7OVFxnkU2KBmEl37nOwIkO9pgVt57cpU4/XXDftB3MquzInhzSllHwfkfdXkc2u1IKuoC58ZPDqDnLHjj2SLTmPIPDJ3nbY+eaCqzOkcxka3Zpz9Ua9/FoWAlkiqDyufzVOjvq4smHA63vNqcr/cwiqZYEzLAn2tU/eAaSvOQ4sZd2k1y+1a0GrOVPQhuHj3R1QHMHVcgTBW5opfzXsgrz5WFnEygO4zP1oYNK4sPoCElWQfzbm/Be+Gy9CbytmmzyP02JAQeAv3Z4z1BMFQhmNJv3q6Hq9hhkBlk/WiON0y1+wXvRZIooxIiE9pymwI8DakfOZR+xubdC6yH27SNRo0pWF8ZHPsRjwzizHFIlLcAj/h3J6+GaQmpIDADyQjilZGrgZnGgIXGYznoaevEHsn2S5Pkl17W49PcDgwyvyGxZNU+CA0O6WzALJGjGa+O9zo2xscMAY6dcRNtyo/ryy6A5ERI+RgmM4gAJuFSZ1I1dtl8j2wWZZQ2EnHp3hYw6MbcE9XfdtMAVg2Mu9mQWyJKigaRp0OwV1KBVjrLQqBwAM9EhzRSDKoaNBXAQwv6rTMC4qahY9AYBGAlURAJ0MflBETgYZQthLfk/+yI9erqRZx/EMQyMEn6TGmzua7ATOq5mw5ecrMTQ2rznWfmDudTKe6ZrzEqBuP74aMtkAsrCCp7ppdVJ/4kJuUx3ao1zIu0IxTAFZ7dIRxnSOSwYnEIskqPW26FWdf9AOdXAxMeQb7YMZbuTG9VFy6I6InCpqdNPLbupFj8LmL/vznlSlgtUE7SEybJBS7iBLTse99vMn0efT+VXWrfJRbKloOQTYwc6tuofEoZ4HzoI/PQ8alVFK4Kc/PZClXBpU1q8g2sxLBVUVohV7H75rijUzOyvCfVSy23lC4a+t05K8CiTPscAl0JJTgnPig4CBiwI8zsbkNbuXHfgxmyc+v9cOLSJ/BV7mY6oR7VOsuui9lFqIX1DZAHykvGXOCwFXUE0RomVOK8PHPqMjOLwgk0fJlXkIMgtMCVl9J387sbIscZ/+uCjoDMRpOnvmIYlEaOhQ+znH5sYwZ9MswS+jSqBHfL3HsWQZcJyoeWPusgc2h8ia04ablrxgDSQRXUdHWVTSuUG4ctirrKuCl7s21ZrfLxfxWi/vJvqCRCfXKlOM+FhYQZquUpRS+Dx3P3/Xe7ZFbRnfvE9Y8ktNnaeA7eHAXFYAwRfcUM/PAzw/MEC30RTzxjCouqnQACxEo/Ol5qc0vbAUC1KPczIkHQ/Nusx7+boAa7ztWxSxR5XbZbRlJ9kT4AlywgFP5RQftgYwjvko7trwR0PiLxjY8Q+Er7kfdgzhUkeDPP6umR4jvHWSJkQsvFHKvDAXjpkw7Y7d0Ncoaxal7SXvGrPXh7XeSgmgmmT2LkpdjrpkJFS6/+aOjsTozQ+MqNhhXpAFCaOiIfHTGuiJYWoVpPivkjsMBSFBbydB3U8o+8Bmk+dvsqRtXxLqNBilbxe5RB/PmqelJ5LfdfnEQW3vVU+CtHuKxjttXjmN7cnjv9fXndIV+l6pM17YtR43yF5CBNlb75polc9bw7uMlSxeR74NK5zd78IZndJP8n/AJT7f13UcTTkx5QfTHDmoQTrzVClIbS2kxROjTh7HX5Xvpib/PmZhNB9HFTaIMcl/fp23qEsxXvJcFlgjYR0u9PF9e9Kje5ozNrwf89ntQGFM5Q5VFM4a+DVDesECRpG4rrfFKV/9XkA/BNQHuYNHoDurRbK//6tA4Mlo1FNHFFxYo6fAcJLMWnlvIDZWi/VM97KfuCfjJGdDlIkpJDSaNV7IjmRILSl9LAZTjlEteFrB4XVM/AojvOCMPE9qJEVGoSQkpkANapxRZWoIBRJWo6ui9+821sKMNwsis3mo3IVKlt0FuV7UF4NumQOPJgFFIGPlVoC++WGD6y+nK3z6Ed2vTJYyXBLbtvVWd7RNP/YI16TEuqyrrDcb7bh7KYhIYYFXiFwPI3D67lYbOi8gR3Q9+bvPfdSLc1ceL7HEtBpIkTYmyVBUhToD/HapRJu0pPxvvB2CY4luMY+gIuyaCK+wjpD8yskMgjZyNB0yhjaZv70ERvvoIDmDLC+T4+W3fk3sdWdRc5kws2CR/ps5boNiJlPGeZYWjEij4QVSG2Cx0+RNx/YcZJXFMyr3dEP1OMjaxaIsOD3ePl33ypbsZ0Yid6/lXOMaVE+xXG1M/M/MlsloZ3vDfus8BGizUt4nEV4QpktLR7+FKGEHDNcMMolrtJ8/i8fPlaA91+y5dCt7UhRF8PmrxzbleqrofMJrbeGlf+ESKdiohvNGdvnVp9gAdfXR2SvfrBIGK23Q5K6NsWhY3xQO6zAgwIL7xLsUz8GLwqu04pgCqlToVgbwcQ0bXlMUZyFz8VbTQ1GxfAmbiw/iGg6JuEyaZfWEQHhIC3wQGbdMKafh21fOjby9LnPn+PdwB6atRW1IFPr5azmocU68atLHIQy7heoiGfcliUpXOQ3yg00rlP00PPGJA2B2GItsXiMHR9rjdouSx8CJgroBApAO9J5SsYiLekJMzzLLKod9wmIrx42rvmwq6LyqQ8nPk3uZHZJRg+Qz/DKwZGZc1+6USkaojGcfvd4CkgG8Qjcrfi+Vk3eINOi8H1bZy5+3A7vMIYTBuD07B8YjmQYfdt/nldkaFkoXsA6h/pur1+CjVp7HHi/uCISvmMKlQSWq4Y3lvTNqozQ+triYq14EqweKW/9iDnitBQ8B6WJWfe+pIDmmq+e+VOgpai94CsXc7Me5iho3YbFHLoGm3rV6JNTCUCzypXNb9/gPyDycivHWjWvYP1TjDUirByIRXwRDU2q6chU06uKUpZRqVSD5TzjQI+tRrlMzkJWFkjJqG7L2O0M6lzCXe4w2uSu1kta/yKsvKZMGYg0XT5JVTbX9NzBgqT67zVWNSxA11vzOT8oCjlYA4zGHc6R3OgYJ5LK8BsLISTWzxhfiBkNtF+QpKwNrMlGTbPfE3t+OQKVoiJBrcg4fhmLvUpYn1h3lCouMsLhZ0SCuBM6pUr+L7MCKkNdobTVd4Nca2+OnZGKVRe4KFOM3bOzZDC1AG80paKKv2fOIk3TX7E4+6aShA0a7DwlayyR3qkf3h/70jm4ZA/n/uNHsIshsVAZ/C3zzpaRFaXzq1Jl7zWGJ+JGPCczMjBVXfLfUap1yyHrfvv6jeE5HKMWyRa7QTO8mNj3uSZBLYZ60kZjM23MZRASVYKzIomRB6fLhQqwBc/VrJ6w7YozxTUcGtVNmkRyl5yxjqY3DgkqccBamjGRCOjVOqh1em8F9xPNXdDpnUSwDuIm8hTIV9JSzrE5Zlb4vvHF9e0I6Tn8LNnMiAJOwEBKEWoLFJ07QycZKY8dXvRImqHaftq5qsygGH/SQJH9FhAipn9CZ4QhmaAVooMccw1btts12ETV2MnY6hm4bMIT9HsGvPi+cIAF4unsigcZDMNQGIVVhq+rcUJTgZ2O1jPmEnkR6EhWEMYCjgwcUyDGtEn0PpODgyWwcuaUX1kWXSEUyV92qyvFIPm91RppphDc20ReFWq1dkU4votWE4k9doF+5r2JkOjU5TwNMkAMdZ5A3muMl4Hi5/7xoQZkjN47TXbjXiUI8R8U1lzI2uIujFjAlHWIRdHIS7Xg0STjc8xsci+cTL7BvyhL62hNa+7saHUVrUTP14feIEkhCSGvn/LDSn/FpUBnZO0AGSS0BVw2L1QPF3VG9qmiWKMSiNPNQ9ldn2ZOop05aPYA8Xi+JYtpRt0ZIgatzc80gdlsyWj4fBe4N0+jdRfVINooTlnl3nh57TjTQ7P+Lo9VHeG6zK7CdAkE9q0KqYYqThp8YX926hj17wmtQhxrLKn7JclQxiE4TDPvdebdzSKYv0EzcqvgNordIh0bs96cVfYxCWRNHXHpZ/etB1CqkfHS3sa1LbzU3XQSBsLH1bxW1S0/V2MqNAyf7ryKKwmiiTxINXxZpvpuScpniDoinX+JbtqgYoDygmPtLCY97KD2NeOX3eHs4OEK+nrBq8VbgaXezMT/2arkd3eem0GJSek+sWwEBNk/YgghdF5jlOK/kcKgqwHdGnagk8fKd/amXzEMObUD+yf9Xck8t4KTdZtIjXsDZ1T/4nHCDOaLaIJlRLrIvuKw7tqJkU7K3sfRbiuB+Mag+/b69mOZVuWc/TuwiADWFyiY7+/Pf7fbAgkjh3LCYD0Kn8JCoOp6+yfDwrK2TQvpYvgc8LiibNRFL6HF3tx71ElU5kW5d5YJhGghHxfj3Zlidm4cugaapm9vs/j1ZArrJ1TmhyWw3dFJf5v0sbfZFQCnsVdEM0hL9E0V4yLO5cm1twT8jNfjxHZLn7JVS62FzoWe9xS4JiOJZ9RZkc1kKFxecMslG0VKThpI1pExu900AmvLJQ3QPBv/3mQAr8HIRWxwzbwd6mnIpgQIdY/yoo1QWTFTKF7UVpjVW5nhsh0tk6CpIkzeiiPmc1ATyX4IzwyOsF0BlmLZZlD/xwr9muftEBvPXNXAJj9eZwP6kRh6wUh2JXkLj7jHcbN0D2aqDiyNmmUSS1OFStV32ZUP8XQ166igOqlu3Tb74TH3T07yyzITAAIOp4qzxeT8oCoKNHG5ai7u1wGjWa33EyHy/E66SuAMuCYbWj1f6TiXw6gtlCm7o2xX3zZ+OmpsskdM+mTlBGRTfQORySEo3MVPynanNQ9T+rsaE8bYqXU2vSGS04YVrclgyhj1ctCk8ROISsDFil4m0pgryUy0q71GgXAXygm8P0VUXEgNEow4pWe+1Lm6KfRgtHD6iLyXKUayzgrGLiCgHzQ9NdMG5IQO7TIU9M9i1X4aY1ehRP+wKSBb3zglxQJGD1mdRRbzTJtj9rco3btUtC5YIggWD26zLClCUwlKQXGcEWjfY1B+yVy2mlEowIXS27i9l5gTRhCDsSofSPZdslSQMtxmltnH9jPY+BO/62ehjY96ChXajJL+hPhL7yDagACD3211osf8CPHnwTEoiulEUEfT5v1q/m2IOupl74ZXGdet9YaHYAqq6DdO/kr+/nGW6C4vl85B/STWdP68L4e3Hhp9wn+D9Q7yG1u6/hJgAqk16MOLE/l+aSdneEHp5uS+k73dYY5w5X647FbQ0YNqii8zqgJ5oXFB+PLgawDcDdjm+XRB1l9K7aLjDOhnBkVZLpeyLwbszZ+1gvPxbFErvhmiB42mHOnXkQOJn3st0nHKCw2q/gD7xJ0nmNGLL5EQbEU1NtOqeTjCVtBzyYSAZ1KF1rGbG0+MFvI4MeqGbCC7emygOD7e7NTuRNu5ccZixTJ+HD4IT3VUiDkyhgyFvEtH7lPeWcKQEpoQJWWYtAJcpCz21NhpCG087KblOsXi3wQ+9yfStUJoLp7i62bGmK6eKExNotiO6f/I7i0A6DpsdyF88dNYhp1GpSh7s2stNF6LrtZ0nNdH89BQSOeu1p0uiYeiIpvYkBTpAsR2dptPb9It1Xy8MUoO7DCEs6ATTPx0eHAplrAsmUlxQ0g+bjKPrHW56DsDlTGIjD4XQwnhDKBI+GLL+K4CdX27G6X9bIE2rAq3iYlHhsDMTpnInbdX1rFVPXc7g1J4jyj4VSgJRLmBIvPzPN2HlXBcvCkrh1pr8kzPIquWiPi57RcjVckGck7Y2q6tQkbv0gZrVQYWjQ7itxelVEKbvctX2/LUd/retdS9l1kk0tG9tKV1XEN2mK4zXJgdW5gL6ianxf9nk/VGCxxjs/04Jwqbh5Scnpohgf4eBm+z0CzDzzddn2LzQUZ96oapWwwwsZ95Yd/bbX8u3c8ckZCHsKuYkRwaaLxOaRyfr7ThfpTMmy0Mkbow47wvT5YFiSCIJcBY5DCQRH7g6HFBXJmVF2NEQ1t2xyueaYJH8eBXHhIZSR7APlosF1fVJa1LPy8PClg3Qoiuei6PK3DtpE//c8yuRl+e6RAOn9W/eg3/mWCodhrHaSbbs7fLiUQIxtOOKolG6RBG0kKC5REcGgz1WBLFMQk+W+9fTex0xYlV277JahkBK0ndOSaQR0+cvEbbdm4hHol1tMfOEsgo0wCnoWSlpvvslYCBdEOx8yFROtVsfDNeWIBMqfF4DZ9Hk2GnPmXQ6l8gr2zm+EaLUpUysBwxaX5CRGF+NMblhg61IqAvLnIR2lMIRiRi2mA1JUFHfrYgCXcb4KM7R/loQ3bEIxQiPvFjOYNLM75+C9gx6Zni8BnaYXpBwfZ6cBn4rdsGopY8VIabUfZn+1U4Ry2wqx1vPperK+Iif3RgOoOx3su4Xb6riZDSF/tvDnUXL0oNDBwmxrb2hv0zySI5X5bDiiLn0GK1m8CzgYyWgBnLuB1cSkslJM2WiAE6/lmh2f+zxfioGpVXaBWcPEZ0BYVGPIwie4MQbMmXbhIVxvzwNQeOCUvogiTWZzzYa17BvldqylOBc01TXC5Yj5VNqEcGijeSwcrA58EPHYeZcx3nIN9i1D1DMJaW35KtHH91uvJEBz41ZclGkKptaLeeIJQ6toJhwKVBhlXio3/+T+8ZFm0+191HmSVTyoOtWKvVnCkA/8ZyqrResFMvKFCMZEgnfRnhW83v1cW2WqBLYggrDPSLMy9pawqjw0BhAoW697a6SbG18q3JbOtft469quQJAxxS0zDrLcHBmUFk1+iat9YJ5ZpDu6l9R3p4qDWcrvqnakdE00BkYUmyqYODHRiwQVZu+tHTbznysdmpz1IBJ1NmzVHkwUCc1rakUEmZ8ndeC+urWoCasJfGlLSExWK+e9fhTke0gZgDyi8XAZk5hW7ygvjCY4xv6tx1p+IVR3YS8L8Omd9aQpPb2Fv2RSt1xxIdj+coK81Z4xKgBq9+VykMEKRS5m+fDtXgeT16vfy11OGtq40Xef1DwpitKj8kVhWVT6OLYoG+w7UWaJTuRl4eKDBMo9S34K2sGL1Aj4ZAjSCTmLH/wmyReLWApSi9kmeMfcQ2UGfrqvEVbuXUAOJ0l3EZIeTdOoJiG2bmFpllsaFwOE3Gjq5KU/qg2HFvwx+GSWooPekVe4PrDaPikMzZ7CW+FHPiOKt6u+jdErn6ryhom1d0T3jyB8PrijUpTmUH+RZutee8iSEkzdf/BpyFkg+nKjL5Q9k7rPYlW5WbJsrYCyswrCKXF2xYFJzWeUaKy5dclSBlMR76R9ebW/cu3E5adT//N846R7tjYRaZth0p8WX7Ef3Fn2sqZ1OgV3VQ1+4gowJvzZjw5fEp/J0sItPzvg4tYCAOX42MUdmOqDMz6tHRfiYyr21Ct6sd4kd1CHaSg+7wS2w29eXj6KIm8U+Oz28kL5JGsG0B/4VXV7y06CSFrsGAS4pHUqQAAZq4UmSE0qFaXb29F2Liu5HoUfthJNxzeG/ND5z4QsALg1I6UJ8HCJGyf3sQGhLRXoI2oY0r1KIN5XFs4+OZEvxDX8HHta6YS15SQg15r8ca2MelN2O4RfJEQSENN+NmuzrTRMkW6s3JMkvzeorlPvfSXo5cOdO32b0WBPNMKqS9vwMuyZ7UsU8HhDuncpJW+eHpsAjIyGyhsE892DUWZg0KxJQ0d8+LssN5zS18esUsWkq7Z1fh1OiGJ/bKJr0FG9XhsjJ/CO63/cY3ztR57rnSgemlqWbnWJRWSnC8CFVCQPhxeLT2BiXL2F95OUktRv3QUPZQzTz9cZxjwOFUuHIOtY3HK/NQfbQrtAo3ttaUeHiFlLGqoXMVbtBgnPI00CmFTGG+8IGgGCljtxcIBjB1t593a76n5elLV8S1hwHY7x4LKPan5+5bzDVFP57VSXlLBweFuQMTAU2Xw8cct0iISfJNuf+lwQjAo+V8OWjMcHrjX2GlTLhV9hNXdJ+L24bDjr2c+oms2NgHCC/gYF3un17LQkr4wwtWWKsCnr2VVLhlRrkhCMfgAV+z50pxy1d/umm7lXweRM0Wie5Zoy9JyK/1nbWxOIVl7pxIjtgzy8mSdp4i9IHhCMh5tfFXsRP58dsWjuE/Qco4wy5XxZLBvnCinGd+ac5Q8mP7auKam80c6Wsh7wrCzAhg5UwD3zffQaA/i+NHNk4O6d/cAw+AOIGMb2JHum70hOXQPSwimpO0RmDyOx1X+5Hd49UaJUUgagbLI6popbflcVBUM4nK0zmdIh5ADc11lo3n1j+1osxx69DE0wptpRtGajEkY1PlL7s6HXVaSFZmwAa9sez5QxfKUJb+7a4w5GZqRCHx9HdRLmzc2tSmojZ88QeaGJgg24+g/30+ErcbkVHr3/ADdOXe4tQfewqcNnZw+9ean2uTAtZmTPghY2/rlfUtKxE8fAP2wMr84O225TZLMjtWc/vmpZu2oxul3pdk9vmD3ZI9+f4JY3XiWTw7KejO1fmBCpTEealISTcnAG6ukcTuyZwAu73B/kvQakIugsYr33gOKMUU1GMJly2iIR5reOdC68W3FKfvf7gRGhSwXqSUsaG8b3b4dAePs+dJ62VMWHEKMD9DL+EaPayKjE9t3drxVEUusQCuR85epQCgEnXZTaqQUVWwig/JWPr82y0ajXT4Ynm3miJpHY2pLC2/wJ6p+sz9msrUjDUvH19yPkMfIRd5ImQreUVXuf12bdx0cmDy+d4Yh07uW+iZWG6NLi8Q1+l2xEgsey/Du5vI5EaPdYSKORzcwvk8z/BmlkLDd7OhZ5hjots0AgDWselnZKnCA/3FUaxWlgTxg68TUc2k69ZT6A7m8HULx9S7ZyNQTlIhf+seQIgRKyrVTGrCxWFuW3+bLREa3H5FnzDZh7vnCCLWaZNLi6v20Ps98prZgmO30FDKorSb4DHItIg1KG0iLfbO/F8k2HukfyGBFGHBdkdIHzAwXOAs2mFyA6vx8qWikydT7/OByH0g2RC3dH5NywRVuhP54Evf25vOGXn0G0gGQQ0+OBQ7iDKNzMqbW6hpFEs3hJ6eOKiDYxGO12iCdDcGqbOwSp5bB8H5k/CWp9ju7PmSDCZHVuu0z/nEnL/Qz02pVXGLUBxtJIGY6Zz6WZuDG59md2o+1ARbQttTX3/9VG0CMoxRr7Iqnfhyvqb+8E5uXNU51rTMRqO58aJYFSDtKhmSPsT5yv5yVi9uVEc9d1/NFXfahwrsmmDUndlVLAI7DclgFCB9Ow3sH3shL+i3mNhOZR9SueSV3g+Pc8X0jEAHtwGoSuGU/XuTRLiV+ObsujUo8ThNAe1sQLTNwbDrLygCh1wDN2SZWfnMV/nZIuI5Dq4EnNos3eVTv3yNRnxp+7tIJuElfVkapGnSWeOeaqVr7KL8b8aMhbT/epZ5+gFE7Dvj+MBvyfxTqxPSd3kJfANiV88ZaVfMa5tCe2izMN9w880K15ao95Tt0w2ARynsMYW3M5DiYkGSAHmA6s3oaHh5JVeOd2jjMfA01/dJsPopkMqgjpBIkM1C8eD1VghdCeFI9Edk+ey8lPO3X7kKa8eoMtZrBvqtrRDklXceEXTm7Vf+XL7hWbQbX/v2hM3V1VpSjw4iP1Af8s5UAp/BFjxCVQFn25fkVTpaJSNTweo8JDhE2yoVuBhdfJdqt/pmXhCOBcqfKZkKGFq5dUs4ZMluhUgiLDbIDduZZ7Kqvrzw3e+QSagO3Tu52zQg4cADpYjAnRL7MhhEg2ioNEolm06lg6nvUCKsql6ayPfmjn2+sujBGym90Q1uweG1PImV29r8bxtAX4BYGvTghm+2C8aq4JYlGx+8X4fLBIqwOPwdSyPTm5MrpdA+qPi6AeoN5anD9c4cf+niiGJAijvmLxrVt5Ug+k4tCcis5HfsR/TvLjcnW+ZyvauocFFzobZz2Y2GJdLvSnCjmtkWGrOvHn1hBU1CiO47/SRZ90xV3PayTVpStnVIeI/VnY0tdxNrBWrSOA+EOk9JyQrB0RaF5TpLz9MmJekvLShCsiurO+HNZQm7YiIcrXailVzn5sCkYHU9F9xOSOg/V3J1j7QKXUa/pcboMkU5yn1lYVVC8bbhE+NFRCVq2ky8uHXNEF7bT6PqBejRmlRBqpNSQa9rMBW4oZ5mhQNxlD3BA6h4gfPdW2tlMSVHCNZ1J3WSMYSJ6EBBj6CIggB0q/ZKb4G9pT7ju96ZuhQ27IyrnXMuvI+R3k9kls0eUYTjBv8EaTW3vLzOV8RjVuqKEYoqx31jraBmxyuNjgs2IP2WzfOxWMw3BB/6nim4dTzoupz0tvrHGlu+J2h2/f6WRcyegRDTLOsreSAv/qg/BBIKtqC7I2NVfwDei7JY6bmjHB9TpumOkWTfela3VuOn5PXE2x+GVqBvbtm4U6Bkh1AJNydF9mKMw1BTxSwp0B91vNbRlV4pIEPHn6NpzxkBX6BU/XGi9IwrWadvgnj2mtLdeSbu+iIAs/x7k3q6KBf9YE4k3nNnb/6RJiXDyWtT25Y8eCdIaTZnJxR39jutMa9Q5g2hwJIa/CtwlahJz/xu8VXfShA0YaD3lQ8NfOpWu61rCDqv/hJ70Rfx5g/ZB+9T+Eq8lqJ4DUkVSDNJKZPz4EwminfkCG/gDiOUCN/LvkhM9F7Y5j9/xAiXpgHct2uuEUUxcEHYi5mjh61yAztxgQDVmJJ/svrHmhj7JmQxHA5VVysBEBCSs/e7zMXTR/fnn5EthkfIKHeQQmmVDJokySl8cVcy5tJ+3eVAe4V1ydw8pKy2UY91sk4/M4qJBWL1wzn6b+F55xWmgEeZ/IQYaFpHPiOcIJ7HLTrZKtIfOKkstn2LQvMD9oBUB4jVLINsPpRdez3GY90qKR6MWgb+hFhoY8wmgJpnboHiWVgZeUS7bNlyG7iX4feSMrlU7mXI2YkYMgPB7IwUO1j4TPIHC/8jvzoLiEAJe6LCu5nKtsMqoa6GVnhQ2rvxx6WlAS+T+qjxn4oiXh6Z7cnvHK1ju8rUryOKIQW6mZlomDSpvdcrC3CPxES4eO4rmbOGkFZd+vlpEEhdzDsXDd9tW+1VDtYA7zCYMzLh1+7SzrQbWX5d0L1TBkqsBZsT0fuNYTOcClYIooaS6uU/DrdcZyuUFrsqwC8Q16tEs+OCfJVk00nSmepROrvWoaF6o3sffv/twS+Bj82hHMOQacjct6083v8wR8xfHHtwdf7VHm/Sk0UahQ6kxOmV8SrOMO+jTUM8rMxZ9dZCx6q/vA1gzn4K3/JrLUHw7WZTfE40BI5BJATjq8PVIJuclG/toymZ/k9lU7Bm4RW95cM4389VVDMocCxzAWfoD8PLPC0HuRpgYCrB6RcvzsnbWdaOucIqGExsRo337bh4w6Wd/ex15+ikE3vjEaDXR+NivB1IpVK2cMZjK7HJ0T82Q+uiQ5I8xIFuYBcddy/jnBubDFa/227N/vtI+i8Id0D4/+xxPz/1VtKdm89beJepQE26/+WozaR1xD8PZr5XNSjeWJ7Tg51y6RevLXnU6XoiCJ3q1fO1E17qx2N6O2LZtwNqnSxMt+IQygmeWj5IK3Xo9mfBR6LWaRsvmYedogyZu8o7mLWDTvpnzXqRH+4k1Z34FzVf7jQ7RZy4yA+zsvV5SEQtrr8VmbdhA22kNyUxptGb0F4CP4pj7PQ0R7LYS94BDGRaSlHgpbMo5gYaJ79W/wD0dsgpqSMLOP6Q0+hdGj1nzN1/hCBHLIMbixRPgu48Si56evH61rYvm99q956X0R8qIS5o2Ll0XFjFmmWPE7zBlkblN0c2nuXjgo/bGeIlPJimo8rciqmZtHchsiwQm2HFrHNONbUH8OMy3yau4jhGexsAM+bzjjLvsOrfKmmuVcMtwAG9eSfnKWlLNwEz5x5d5b9XM11No0LMwCSH+8e6PIgJ6l+6JHoOvhDdaUB/ytCngsK4l4wGStviijKEbsajHlg3o4xyc8mqEgaBOySLQvXDQtt21dRvC8wuyVX0VR9J841tItPXLHNBDVJWOwVf3z9O1LPkkY4SyNmAm/7TgZubyrUDTXdrcverpDXn+Hp79saVrfshmnNMlNU/t85+yiNIiBuX6++x++CCTcFbalCQH00J6DyoH5vWaeJ7w7jWUL/tb3cK5cYFnFBg1k/tAvUXj/7KM/I3Ft0z+T1fqtBKN+Nq9vdeA5FEpFLaEnM//iqiRXKAVXZRpL/dw4IgN91WnxjuagZU3LKTdsaggZWE5/VCJ2R+OYRD+ys4GgizkUW8AWTiqrJMsScX4aKxuS3QE/9P89j1xxPD4v5+K4sdmAO944elFXa6/5OhEhLBAtL41iZdA4HJMMbmp4zGKmiVrcYLeCPDmmTf5cgcy+vVFZOqzG+eI06YZFU95cwyAbMBBxezkK+BptbUtrbmgsRm/XugqQjBiGjH0daw32KkmknfYNH7OZxzDYAnqEm5+3H+1Wa5DbR9UYq+f2ZWdzLjKLB8r+9vifGPhohRNfycLxxIi/yafbquLTynWz4nwXlFLvmbX4oI90ts8nLug8MGwuEynm/q4dENX9hiOd02K08bEibbO0GgMaB0Ju4MFssN+0yzbFhbJUs/9UklTX98p5hanDa0YFhCu/Is/Ia57TDtM6GN/jtKHNuIB8dxHl1beQAkJo2HgbfIpIB0ZJeo8RYPsz7kkW3KBIHqoDT1lO9wZYggCKsQRQAHM5c5IezUljV1EgQcz4fcwLV8xyg5RJ7O2/SAFNwQsjMw1nqFAElWFCYFfINnzR5YnwaJJdNJs+3JIHqodVmIfwAT/WCJYZge1Kp1lGxM+46YxH6xcE9Kz+Mn56gNtjG08YiY7bFaYN39GZP4exuJ8e5BdFg9fchdOHIjl3sQaWXF/CiZcqVh5V+QRX7FT137IlKfOLX2LLylwTUjtBnU0n3XKAvPWdCqTr8P2JpXIbd7OoDTwOOV8wv1rRkjKf7txcTnFrUKr8LcCx82j5Nn7yuwCVVkGgoD74Qi9uBxzCHwn3WATlxW9EZPKHbgkgEtLFC1B5I0W4WwFg2jCflXdEQxXz1GcXOctq5rVX5veXoUYrtH+mrM1Xv3TbrrDXzm/Kh91ilq9v01Uj9dt1ZcDYsiZbkdWpjsGP+FSghFtjIA9baoc9wJfAYk/6e5Ywfz8ooMYY3Jf3o/x4xd08xGrtmBoMUNy1BV+cRfJotkZ5ZXKkIkFfVsT8cImZMZ+53v721UUSnNqT4+pNFxJiQGuc7Pu+7E1sJZmL0E5Fv/wcnIV2VPluf8qOjca8NgkZRL3t2s5WbW+FQDjHn1fp27J1tBMefRMHmphftzYcjFmyFuwYdPULOVabP65Qd+9bIIUBcAY2QT4UoNoVcvVcwz/cYTnA3RcS2nn3vG8k7BuWb192Z1Ji5p54/ehVEDzPC/GYPRFLh5n+fW97FpXWTpF+dCsSqJbQgKQzeYyhYGQAMYubttU/1/5WwrI5eDJXpxZoTi1RpEGb/XK6bHsKEQAaR27EcKcxB/vDaEnx0HRDgq7mpAkpdRlHvfGF25RUNjWR8xrpNWhhF7/jCoS+W/oD3MpyvG9eQNSwZq0pQDm6uR1f7gIVduj/0Z6eRIOR8Cu4PNuUah+EpWyfYW+Ux/Oal1+JWO7iqRNwMvKwGE3TF+jhfcSx/NN7xQXKz7jKJM0yJhCLQzdPmXh8+/uLiTEE2fENvZTZk/f839BlOeVKy6O8EMRN2QS/R9/NGXzMjVhnpAnFoxvJV8VweSN3E1+RKqgqauGjtYB9QRKWdPDSqA5L1JCUfSuXyekpDigDP+lOU9/0sQCBIBUf7Oto7IyImjiwELVXrr4Z69TSlQENRThXQ6NVI7ZzIwbv2jaqqwHMAEju0k+NWoiBRJS8BdFbncg8TYj4xfZvHB37Z9XJNXRpQ9nLHIdWbpt/rHEpc3hQ1ULQV8nrbQwcoIsWHC0ynFgxA2Kdfl54nZHcM3ND/xKZz2FTmIFiaM4rnTI6LebYfXrSi+qDu3K2pQuQBcvzdFhe6epUEbl+uEgSaP6uc4o4kIWIFwzosGHILz9GdNpaQQELWg4NHn7RoX/MQMz+bWWRn0F09QA91QiH9y9fMbPlu7+xzL0MdsvV0A7b7lv/9GVE7/RHAjeksCmi7bYyDMD6NCVUNRiP5+rS0cYGl9iGFQrAUmZsPqFm+UNyq2H7As3EiWwuI8dPjMfZTJg+XrEGZnI2WiftiTp9IknHxonuF4n9dZtHrGhKvw1K+Vs6E72jvXIrUn0SGdsZEtmSyLgE6/aUJ6lbMhX7qir3esB3TTgaD6bFwP4ockqlB3kE4TglVUjk1U7X8UD0FcxT8s/4HuIOnLOeUSz54vwmVCOQoACx7un6ytxred5kfKtmjFtpCrmMBqhDRJigBlwJOjST9ExI6Al847GDo3bvGbcbE5vo8xVlpJkOgmgjlKqwKlNoFVPpjJWfxu4M7XTTgMjb3eYLlFsIjOA6T/c73x+sPKeMKzG/aajxCM8Witm4If02di3t9BZYXSrwhPoM8YQKJ20xxmlz9GD9qtmF4iLehoJIO5TcKPSFSM5rrVeRc06Nw+pUFGQtL/Jf4205GaFF/djlQoG5esgNRgcHfLSGopEgikg+reOadHgNto0+dp8kxwugT+lpcAnv4d1TwmrpXK8uBL9PPqOJH4qd48GuzW0FyofUQYPRaPKEXch8E/f71r6FPNKtrp0gS/yIntspQ/fG6vUGRIAFU2HlKrsQpKjIdc0AyG6IcEnk4Ssjzup/oTOYUzt+GzXdfiDq7sp90JVQINpZLQMg7tupA+TGkynocrzFXnFxKOGZFsTn7Sj2rvcOsAB2YjeDjoTS8ezja5c+OyAbrmV2XbC6L/shmNGE3ElAneR671kn8JwWED9z5pBD1Goy/ou03L/g6ziX9ZyO+vJhTXbb6TedCSmnxM0xBbY7C1t8ne9bB80iJZnNhktB4Wl0TTpIWVDPhyduG604cz35FjyPUiO06bxuMwGFvTbO7fA5bguM1pZUGJb23F1Yp7muDU+q4Smyw6l9s3Pzja+b4oiXezpD/zSTKXRyQBJ6ShKT8RyMbHxsqOS9Tx3Ju9o8qAsgZr2+nhyUY1A1m5RniOnMs4Q4mz1qXHvre+2ARQWhRMaN66zfsYpaz+7AgiztZ+P1u+u+JTy5ZMRkvdCiboqITWJbaQP9U53hiR4srJICZAmhun8XsuClr/Ka0uvZid1XVEc5nGeb4gUx7800zFoFm5PzcwamB/wJjp6HNuctpRXG1/V61PqTW6Ct9jrKztNsU2+GxGlq3WsRamosbvpFcwOre9LooF2YUB4pfy6EnziLiZuZjKHWuewafI5CutC3Il1lbumxq/th88k1Q3l/7oK1Ky0rxUGM5tDUceV2K34g4jsrb1b2dfim7gj4cz5JUW75tLDJNnOBca0UxnpS1MFHedP0tmzYbch4pdp9+bTTFZIpMF4Pkg6c8FTC6PEjh6emNRFenOskfeOxTIsMjeuVuDq+jFtgIsiY++ptdAiAkt6SvhH6lR+Bv7T3hGBRFyJA/Z0280YViick4vzTEfd04qRnnxZdU3Kq5YDgfAlmTmVmOVAu4/Y5pMOTMkuIbFBw/zepgNiQlE0EeJ7uGEmuoWx2kE4kBhof0x/l1bLGHH1nlpteEFQp1HpAROs2HdV7muZgrPQRV0n3cxB8dj3Lb4JhoL61JMqgz5XquiNTxC4qv6sQRm2I5LmJtQRbuhycpyGoRvHIEolLZ3638Lmr6Zo/9rNaQ4Gg2Mup55cxhj7PmAeDT7kVsIBLXy0N0n5YS7Mz+gQxvvLA2qpbu7Kv78YziLrAPG9wAq9QGqvCRmL1e0ARuF+J5kYM2jyxiGpWUSVWVncDk9S7MOrrZNaMaL63Gh34emwpJwXvb0sC2633U4TgLiEysXwi38Pp/POuftEPuD5ThBrIL/r9Sl+aP3e5f8jRbBk7lri40tZjXw4q/mZ3Vqd2q2zII2fvD3MZxEgS0pZcg2j0lnNiLoi8EUer8IRfcdn7V2PkUa4PALk3Bl/Tt3uoB8A/c+UObKUItR9avMUKT4v9asIpTitM0+mVXFHhnNJpgACRn8wXW3lsf3mMKRW538cPCQfrEyXYLRSV9SoQCBxShtGkEYqYUfWZQXfZnGZ/cID9OD3IxzJVah8lIMsq+kKo/5DftfsQdDTcsdV1QV896SanKacrDcuPOP0BP0fcqBUfSm8BhDWSj0ojsueQB2puiBFjh6Z7X+n8oDC+dMpGltDezJJI8iISYMEuI5yUYkaNg8rprGinjuF6qVGSA5QFCEUyB/n0DEkF2q0jiDmVQtW0RO8kemuwY2Fzles+TJyfrEWcny8Agr/9gmi9OzgZa8KOURUhVHPtkUfoyN1CBk+LtbqZ9CWmL5IdBIDAP/WssLNcJ+A5DowlPK9XQzAyV4UnzVLVM6RFqvByv+7z6w9r1ZVaWUGg+x/Cqj0LgJFf4OMQho+PtJ706llip0WNdbRpKbPYqfdB+H6sClFYwfXPH/H0ulD1L+UGLMnSI+HbHBtRtO5O0ezjQGCpKpyy/6VicNAk1IiQoFI8lKrtNG0z07ZH5gzt8aaZuhgsB+yjTvsPKjQE9qGtiL5K/apzRubd90qgJoKsKRhF0JNuOUqvhS7X4Hk19kQY2mrVkTw0hjpxRCTuCh5DYTYtIcFlA3tfHRi5pUFcQBYOKjXXn3iYJaxsd77a0/nIatFUpgFL6/okEqiifYEzNkE7rZ4bfiG0GOrCyeH60V/F7fjTBDG0Kzzu8nsThxzdpiOKFI60rw68SYN7r7y4Nrmh41oxasUT9HQtCa3YJvuyzmaq57Ej4KTQ94DCDryoT1IGTW6lcoMvZReL4IsEXfU+m2Lx0BWriC+LVzoufGL/3/kXFHmlLPyd4yMBC0k/S881PyPbz4wCDaGX68NpfFP4SynNFUdQ0h930Ofv+TCDM07JA+nF8WLixtnCkiUJlZZwLCI6KllYtsV2hH2K9NvVnpfqNV5N/8s/K/7CWOqMGdBvfsmVDjageOT5CFc1IS07OiSHmdWk/4EQgoUOLKZjwqVUDHNfSJB73O9Zwxh1Bs/3TT12TxKEydMr8YWMbEBixQa9OMTjG4Qwd0fEUR43VpPzTiCT0t5d4H7xIbPwn76iNOzIdlaygJYmRIF4RnUOR4uvSKBAOHgEBYUQTSiFzoABXjxdTsROubFIZ5kpWzFo5WCfyo9Qd6+C9yziXlbBZx8pAKAPJ5XxitAvlPocHfhiHgXJxi3S2dfjUg/aVV+LiedEHLnsZKPc1woIb07cswoHujD/LhGD+ITfYesCLr4ho/EQmI7IuPdGG7HlgQ8n126SYAFfumKT6Jn89pGaWtO/IULLRfRK46oJEaFpIhaq85HE5qOkGP7re4uuyldh/kVrOatB7V7M1TO+FYukepouz7PvAyB3VtO6H/czVC4q/UF42fw5rF4qfOkw9pYh3rll8KWLAPBL+/lVl1qYdq6cOWPwcs5gu/jaVzTtcnfnLDYHnOVSNa4/y71Xl1EfZ8FuZfVz4IP6CA3eTL8j0sAjkN9M/6VTleulIXY4FN3U9fpAguePIGkvizzvMt5KOrdlat6ZG7XazOdPEr5I6bxCj7VnvihxTfrYyEv+7OhT/FHZ0Bz7+rQ1g8DOT/PzUd7TnMMSuL1bm0QdsGl80QdIdvIYOkgUhf3MCOh7OKtauXgLSW9hlH5FcYJ9kmqQ+RlBnsS9wZmjqv5wI0cuRNXEOHflECBDCYCBObDpuUvCkuTgY5axXaQJlXj55Tg9VgTdeE9cl1Dny0VsQwF9ihXSKVxGcUaXsqop1bWfEx/F/N1ERRHnfbAZfYw0GwdhBl27Vi0CTO5bmML0tl5mvWVk542nB3lObC+bgrpFk+mZTd9clClnEug32eLBzE5N9TUwdsdZ29f4u8pxiB0IOpS7hOUMA+jraXIeP5MrRdmEc7D7W8m8lnQ1QHiUMXSKbqxI+GCyy6XQH/Vjp9oe2SayT2bcw1RfXl81LC4stB41u4YZ7SuiCo4XZg7DggQ3ioE9XTf6p6qlXmdWHgkTsa6e00Bjhs64MhcI0bFiCIaG34HWURApPN3GFWs9Z22HJqiDb6Bt6Ja9SIuPbWvQgRF0dCz8xztxpN7rmqxzcsUccSweU03/WjzwZqsIAGFG9W4hoxFK8EfVSsxbXU3h3thLXfockmbFSh498m+2ZGuDyQ4CX0MU/lIVK9ljb4qBPdRfSaoFpyU0y2EKIAYkcUYqKmA5fiid0wv1NFpP9GVZ+IQL50dyjMiyOQmgwR67Mxhl+21MfEXGHlvRl7AZD6bLrE8cA8YWyCXC8hChvBmQzFJkigVvDU1WtNiRQxcQ2JtEOymAk03YIF80aeob/60ByIUNoTEMujXjAn+4O8yj739v0wJvtlbcqoIcucHmQVZXVs3P3t29obViVhwbrYREuq/cdFAbRkabojh7yXwIJsMyVV8A+TSgXx2bNi3DysNhvoI9D8xslU4YOAuxgH9JmsGWQpLpJIWzs9wceJLCnlOnmBo0M76bZ84/slOfU4P98IvCSPnQfklgl9oczndNHyXMyLz5dFr7sqnBQBAiWq6aRnFwLkQAB8ZDWDKsifmqHlWrJnkvJ84tT/DN/LPJcL95zhrQ+xRxIAV1ZStHI3zYJAOOK687mx+NTU8R+Tm51Uk6Lh3ccq+6cSoQKeAi/P5o00n2TgWijbqVAjB0bUTVH4tqopENrNWWIv97yB5w/7aa1Tah/T2mSdw58sFaguFPomhz70XJyWDFV7x67UI8riFo23HgXHgCc8hkKFd65HpkUMGDwfNIlrf6+qk/9413akw4GEkkyhT/FhD6oBagPc4bCY2Cf983ZlmmJyNv503GFCuKR7mapLrjpdRJgl3C4JDUuvryE6dskQJYLgUQScUiYJQYlspBTKknIbPfIeU2YYAsTgCT/Ko9oX+U6f2h3CDI/mL9C5d6sA4hM2lB2sFYiGm4di9CyIhLLF0UgUW5uxuaB0KZHA0+KlcB3lzO1BsDP107nw0KbsQ2RmUSIokcb1d7XzKEZ4vTueQu6JoPrP8QvnHlnNxDxaVUzyRzUxuuYWWGhq3ZR0fyYkOQ7l0NgJSErfJwdgDuynuQ0gvFrTAg0XUNoc5ib/eMkSg+abNPcUtqP1JknY9CsxqSaiwlcD5I1svVqyWOpNtvHTKqEOpv6h8/X7Xg2R/lviDGAlV8P7OfeJ79F/K8kLAe8vHzAREdjIsM5cY1dLm9/a2lQ4uQP62/7n02S8Gge9z+frb9YqgKLvr4GcQZCptN2kMw+ltzl0CwUJEPid7dUc0bm1ET39IMsBUuvLx512M2oB7zFAePxeWh1HBbmgAuJ8KmSTyNYDDlkClKF/Kd4MjT8iYM1ppj3miY/ZpBLXQIyv6az9NfNhAsrNJNE9buOv3Yms+Xh8e/3uh3+9wFb+nuQgHOTehVApTik3Ef3laJZ4LeCaZjBqj5jCSFYsz7txBP9HjzoXbK7HDNLyJBCN74pKX0VbTG2P2o962SbT2GA5q583xHuVHr7puJu0Zt5/afB/YWq0BA2VqvAPvdHyKYUh2O7gIXLCHi9v1PgYb0pgNKhIG0nYv4sfKTKOOkOD8XhpZYQqMejvoUy4rOYZaUele8eu4l6H4ohi/PV1p4BYfmbuC6oLEhCjVpA43oqu3puQr7usMBkgQtXPV5m2i0zYx1ROZ8/hO0de+sEVbDRNA43CEd6Q6JfzeVMA/KMEP3TSBd3lXZxplgvm6B5sIIPjY4X2FeGG99wqLt88M0h5u6Dgbl6C5hz0JsesodlRnKZMMJAgjOf0c/GKABGIwDulQ6mt+NjMoXfmD7iM2+U7CSCNLigyqIkcv8hBOqWPgvkdpflOgb6/VnIhM6TeJsECjmPen1iHYNa1M1GAaqkR3rQzbfJsMsPDanUO/k81vUGOkr+pjZ/ew4tVD6jndDVAG8Lesa9LZnf1zMgN/iN0i9Fj4QAWs5oqC1Xy90+WqF9tfzile80aXSUi+psggcUNk64bzqxVYRN6JAEeWpxC/nHZDbJZslvJAp4xk+cmjzBD2s8bc5Y5UI24+Jf5VoO3mHDr6RPvAiaMA74t1yXnT59hx4S10/sr6ewZA8dhIOGcXmeHlkZmKnB+rsjyyNGPlGVyalkm5uJmvbffGZDUQ/GCuGYehftZ1j1zatwFWaxmXR9Ysi5WbiWDoN0qXQVWD0ENrhZK0TTtUDWy6LCJGXYWUC6aWGkFkQPQcQZzaYGtndd3ZRz+8NVDtGHGNMx4wiEi2cUROWbMMvEvai8GlCI26gC0VKc9/lKy1kErqr7iiOh5UPei1bBaZ9BQYU7JL1yB9sA9Qfij/MmQ7dWKVP5pm1BPhfLeQCEP/hR/WgsO8RJtjv7txJ2GdmHbxzTysHbvE8w1guMqAQuyp6N3zeWi6JnWtVhwDM/hZDpevVwYPE7+TYiq5YDJkEPY+W70aCBcmo1CkbLEdBY/ybq6zJo85LpLS8A9lBbQCTPBHa2pHeSWoX+Tmb4ewePWl6fqBkSrNMaEKLM/f4CnXxNk8ZHH4Giiwl5hom0aaUcD09SnVmX5H75k4mf3wqsIiNARly/NAgwMmRlkFpwzW4wgzz9qpVrtQUJk0bcwDPT1LWsZLQpbkdR965zrBjVnK9caHvx9OLUxzc+igZww2AT1NrDJrzgF60SbwOFDbBNEng7SDx5RvkNyOVMaRIRlBHdnB0iyrDeL0qrKoDSWqjUhMi/UQnTroybEwa387uCT0biD0lzi6tj/JabYVAwYWDDyZECb/LGIl4BD8IPo2byyJivqTQ1wRckR3RSM6cZhVtG910T+kss5LvyAcsHuHKMAEq4A7e+A1Tga3bHq4Nv3R3oSYwZuzJyHZpUfOMgzBL86/DFKnNL7UOfgHG8Cdt9dxIm1ozaAoPQN1MS0625h+xGSyjokHDqUAoRHgHsCnk9exzHuaP+aqT/TB3jwTgfo4I8zg+PhdxmPmy8L7qtqALNkCqyYmdFQVJ0/ROFI3EBKMuvGscladEDG7/1XLsAVJK8Xk2hCSDO+UbR3Gl6/j4b0EE/cYzPSP4KBOolSkgd1BWs2YJbxzxjTLLQSA6sKdeopX+6enBoIZFANWR44DqVAvu6i8JFKkG+oEvwrJAXKXqtIREyTPWfT7arRbJ/27yS6a/M+jyqLXzzVtO0iWVM/dGMd8l9YG9xMA2lZRSSm3w+GlXtzcJ+3sypV4aCn1+eJ2SezNRJqFhtJpiyVmIFCd12O1DFKiv7qRatmETSd2GP906TaWJRMElykb/YiJk0kZ/G6dXVlZCynl+y1AlN+lrX9ouVoq/hgJnUXhF/U3EIlaaSFLqXHvhAMA5fAQNOCpq0pXPGpPkn6PJWdPo8LK/ErMOX0eikgQ+ff720gSeIEsyehXqVs0LtW9cMV2+ODghsLh7vQzdKnnUA1NCJRJPKI3sHIeZK/7bAg5HzlCER1V2qEH9h4CSQydqWQij35qOW7MNI5bdNW3qD1ZHQJliOf4VVpMiQMsyX6nv5ULKWy5Eb+YVCxOohJuNRt+slUm/7VDi2X8i36YrUmig20FPmllWYhYnITd5zYOejVmob6ztFv2NZsRskCbpBt/5gvofPCIBUaq0GvNWU8K/JYKr9mB8AnqKvmUdVOFdbt+PQgXjtE5CNK9oPlb878k9wgHhtisSHzJMiVpe1MkI++u3KzWEIuHMLiyEbsScDMtTnHRmXtsC+iQOvS7fzwXcXIGTxvA/awTSgwI5hiWwmuOdbDtWFFytDAAAEchCGW9iEXkvXWw/HEiCFM4hU66oqyaDSseT+nseEwU9luVmMJq3+GWr4igq3LSPu57qrVBkj9pd6d3qqIZ6cMCNacKULpZOeKpBPqa7a0iUFnvdHT/I8/EeURgZgJXeOIfVdQ5ObXhalDfIW6beAJjkEm5gUkeFFoRQMQhxPfhl96il2NNZJPCisBV0GUFBwapcF4ndIsOLrR7utOblxmLGRPTW6O0SOqUK+IdFfIHUvvnjLliP9CpCxlp4cC0MQMVLoiIhEHFIjTUeX6XAioTZJAsHj6Ptz3xX/RIW4THs8zsyabSy206Os9+NaAMwYVZPTHyjyMmSRc8oik1UoiTisemA8xM/2ELSpkQiM4SUb3iB66MXQJzuTzPK46qnBTz43FudK0TH+vEgRzOXWIkN/HnQ3srXzQqRh+b/m4cVG7qONRu/zb1BwO0Yplnvv5ZwkHy9piUGkHqYFCovarV7jIFBFXNxbKX915yLWXKHUK09EFw3QDBxicg0ly9gKgW7fCdzayAuP0/b0sEc+XeTacgFR7YXzW9W4ghH/WMtWrbQLAXxisBs2/3w021wnLNNhUrNdSBf7YNd7evhrNc9zMy3W2mYZ3/LApC1hgRnKHSU41nmRw2WK5kdg7X8dGhVr/UrU/+MIlwzR3rZNK2sg0BabCGs8YMBxfgnt+6+StzGcSNvQhz7yOlH9DKgF3RXcg8PZgQVyH8xCV5BPbf7jIsL/eggQnoYSbYXsPhty7Bu8hoQxxdW/sJXQiULVTYiltSlpM0h1E1mXVE4eOuHIWcryWTbBp6zrTOGZZugkhTQ93n9SpmgdqnL8msvIoYTenMiDqVnyC/JYYVCcPMEzWWw0VIjhwFqalJp78YGZers3vAOZSVGTCCoD9dOd080Ur5lOwRDyFu0qaJ/3/dA3CifNZtE5akqfJQQ0TKCBiZ7nUHi2dTRy71HaVjX9dYW5hodBNnwnKjj4sF47qDZUcn0fMwCI9qFLEjx/UgUl+EsDzXbpMupfmTXB12Eh/8PoKiLF/7KgTwTqQP4MfrlhrtUPftMj/kahrkbBXX3hcd+vSjitJpnNmANP8IZFdtpmLeCdXMKvep0TcdFGGzaML1Dl2u1Yb3mi3UO2iLIH01Bqb1sG/Xcuy+adUhlNvm+u6lIO+rGLDKZlbgKaM/rnvgXn1tt3K6Z+Pz5EVA5tOnAHCTi8YnHA52kavrE6Ie8odngDJO4zZHtSM2HrjZq1Y7JbKOFnpAJ+3h47I8X6zz09/Txr3onmKtz5jf4wtc0Ma5h6Z6BKENvqFW9HvH+KXWJ0TWEVw6mtYjDFH4GD4lIvWfKKVcs8jzH9xFJNe0zHN62ldLFf3osERGDO7QRpatst9TqiveFRkmeVQggh2LCyC1igb5Hfe2zxBwYZXgHAI4CE8agUk4GyR7Ip9evh9WRXDMAQ6WHB5KlZTS/T0tm8ANuJuM3iIn+59mLSSqq5tuU+B9qAQOLO4XPyVa6H/bktSojQJBGaKSYe8Ow7zXZrk9z/G/+h0LvHiCXQrvh+b/4DkK8kp6DtxvaCWEDqU6juRXHlq0F3OatvssP9uKcC87ahi8L+oOflTWG+GY7VR2DXEshVU7Th34WjsCa5tXsyMv/wJ9E09yG9AJBQ8ChBLNWlbXUbWs5/MsNl5id8epIYAAAPS8fvX4p3vh4mcDKl9zdMGcUFmW0PJRLHrDsaUKDAnkyF+Neh34JjnNj+20vNvLqvsW7GtYhHabpX497Yt38c6ZU19pq3Kuy2WUj8Hx/0Vu1GJq5NufUHowa7+lJN/zTnIw1fV+qzumAkHBMyysp/ur18W/rhRy/0fa1thN6i37u5gnCraG3KMZVIU+C5vmZ5IWZ3yfP6WCuC+7FP6ahOdiHlDNlfYAbS6wsfFkl2yGL1SIB6MElzOnOkBijgAv6nh6Je4jPt9mIzuoHAOypvsbjw+gmbcHRtaArjockuApOKgfvDWTzUNcL5EH+Mf46vR+U4UDn/Jh96MjoJYukZLDXo9wUxiTs3nqXheqtYqhtxIfm79IIHN66XVi2+AFH1Surcyki2Y/2LfVoHVsiWBbotPKnAdrifrLSTS2ApoeQkexQvpp7ntj92IM5ZbYgMs2mHOcUSF7BfYH8vDUsLxV1KM6W2xZG1oBslUBEaTlDrJ307MMIHPF7ILz3nHGtfcDYehLt8kqQmGvZqN1eqHXNVD0CAaGy6xqdePY8XwQvwQyYkFJl+N1TEvsDpCN20OFwRY7x6STUaY8trA8GxzZluHZu5E2M1cAJCwpoyzoFDHytJ/TU/xf/dhSPJmvxPfptNAsx/cOaPPXmHbD8r2mfr+6x57Rply767BSg9VP2DDLRrZJTmjDV6sc6acD+Pu9WrVs+mrQxlX7vnMLCY+cihXC3gPiYGdsLWoyG3yM2LXjxu1+nXOqE1WikwD37EduadlTA0fwMttgeFF4SBfujcoWwMj5EDxL2QklIk3FA46Pdu6gjQItdrZKF+cvhnxKlWQH3o3hAUPoeINda1+rjAk7kDy37FMNAqL3RsqJXLWgqxnFW+KN4DZDVKhIqkq6O/eBe6yPTvpjk9+Jsom0E4gcP+BA0MFPNZfzdGcSTFokjApjGL5cXFYkNvdKtF5nJ4MGeGUvdXAs7S4A29Y1ga1r07KiRNJRGoFpJyXgXDAGF5GOogluDU7vU0JtXNlyJmMGGaZyKBXCbnKdaD2d4xTO8kF2jjG8yI7XzX9GbM+bn+O4387Ox/eKulQ9DijF3sa1FO7wW0OjiSWGny1kS3LwoRY/LVSoSMLt2PuTCXjZpLgZysb3K9azUw0RVStN/CDYoVpeBG7bdpKeSNXlko+I3ZsbjEkJ7/R/odoqS8CIDZeP9aOOu+/FTw0iyAvC8bLlzf1Fn7ANUUyRxRlk8xVo+/4z46cQUYqEMagL9nWaNHetBhvR4P7qUyLqJTrtL8p1rPB/+9/+3WVbQX/plDLwEl7D49gtq3irL3VZmz5wASSeEEO0mUA38YB3IAGLT7jzcC4pN2F9fjhmZGyIqd1pJAnTwNvuonAUNBXQgCo+koi9/xcjfJJ9etQ2d7UzpzvVNEsZHtXxJxpfLH/6XTGTKGtYs20elhvVBDh1JCFQ3jklMBLRoJsHxwJ9GnQgyjVPcxWjYwNMYjyd/ORcRHoWfTRVCebjZ0ZWy8jeXb6GovQUwaQqhvige6HE3mzOA4iYBZUCAxbeuK+MhegAlx935Ow/gh3K+g9HxYWEC7xlXwwy0YY8G1bTfeoL9DSbe6YrnBclQuWhK/A14CIG7Nk9mh4ceybs3K4uQEFTVZxgpPowu4CFNPqHieu3jiYBd75LxodNrZ9yQ7e5194xbKBPUabise6a6yazbPomaR/OpfhtDtOwZpU16ginu5i4cb2aXcnXSiOJzMdZbeDoGAMWUyTcE/mirCx8Ou/f0WkwVu0ukJalgFBpUYkEODDVsHOH0jtBRzi+Ujv2TxSYvIV7gtKTpctgRMMDDRjb3EJL8js2rK9f7erJU0VnTcM0nw2jqeL+ucPoOTiUxd9mMAA5dZMtitzguI2e0HlLqPzyuB65pu1ITAesgbVXAOlmyXfLZgPHOsNjZsLXH9+uug1UYV2Zpb+4pnhrI0O0Etp0y+Ki6sgDc5DR7k2TxEe69qI9Awcyuv258LLwZ5KE/sJ7npIBQshFXt6ssok66If79Ofib923x0gGLjvVTC4CL832HEUsTGzx1tI07kJV0rcDLZn4LE6MLMeHlrRJ3DY81Q4VAXj3Q+Oj0lI9a0ZoPts5IxHBccKc9hm2JavKQX0lLAoS+I9deCkT1kB9y7uLITPJLWZxZYn74xwCQBqJAfQYeuXN5dkDxP8XBVedX2/dy+nmY8wDQLq3vHNHtYDxkMeCN+p2jdq11FTnh6c/HNqwD4P+zlPfDLtuXpvPD1Td+PGim1ESUDBgsft2TGg70q6+SVeGVwuKoHVLfd7GFVFGipzTGjCsxFiwVvYEXOYKgjyG3+CcLhn5WlKq1hk5UELqOtRfNIPCXVW0VhAU1t8KHCoQmSF3ZXGaX0VJ5uW7Tu7uWNDvjVptSKEUcVK+Ngq5BEaX+wVbWkuRkD7flMrZJDUrlt4nkX/BvYnOKXdDtmhOdH5v8jsdvbXg8JFbrCXCuxd0AaN9svNQdoKxj73NStsKuU0Cg2bxSivy+yxwNtJy8paAB5iadTmAO8s8HMuyrmMU5oJK1fL+DXzYS316NSdyfuqwTuJDwcdBUyeA52H0Os9Zpwp7MylvHZstaYrnweRSK4/+0DRGYcSKqFz4/8ELYr0SWrfXBR3/B0mtpE8nLPbdzaW3sUiavN/AVCKrWEe9XvW1zziPL8vVeuwQ7b3+yDzSJi/aq32K8IkHXd+02LQ1iKJXBp/Dx2rCBxmRdOzYPJGxu25HizQZDM33mVcvVJ8Wd0kRMnotmxMvoVwxa3oFML8e6TAvRC4Px5D+hM8CoGO03CmRE5933ovE7AY4dye6VKMr7gNvIioU12Nri1yiXnZJp8xtwlb8sI3ZTXMvtYe0LhAW1x3kAuUwsm4Wroh7FfJn+kSeXDM4ZRnc94i5JlvhS1y5Hgi5RDxkgMT0ixNSXkzGUaIg3xUVSxoTDk2BcxpCe+XrNYXVxyJFHTuepnZPJ8+e3dRInccfSopxyf3t7XonYvjEidAdHrhWNgH3C/9Y83xAUxkvL4CX1Aj2iE49Pu0lDFmhIJaal98EZYzYuNKx4wPaIvarLwpck290FIcuWPpvWBYNk1rvGSe18dOLe9yg2IuFXXDlxddo04sQ7x5ToGlJf2R4sLvs+txFn1ngjtoxYZGKwcjCwlNO4wTh516UE6Zjj/jCE/ld6EOQkwwFFrXIdLhsBGDy+7KQ9r3lxQ8zfL3ze6PM9fJ4ngkHQam9foPf/TDs+eugCsRmmlvn1eBPxiBEkEjmSqSAjMFL60I3MTA5XPDt56h4kPrCtNBoZhV0vPpUokmvsjisf70abmm7leUj5ilRAod9HnQHtAT9IW1VtnwQbq9QKkxEo15Huwp2t1yTaq992nZ1BkYK1QGkS76xUSeYAD3nRrjuvlSuG7KLzPlz6IjB7TVtlh6nC864j1X36f82o0uijBASuJOTL5yCGB2e0tR7YeLfOeeXNk/3d5GbVltheRxHtDfN6wWzpFiwXP7evcoBbL+oDwFXD4Piwt22ek9kG/O3Pw5F3X1CTVJEV9SyV1L3llltwWQcbmtO9LsVdMumHtg623NO+gSuogKUeZW5CtOJOanrCTgHcyO4zyvqH2c9SZZprPy/syD8tXkSI48CYRsu+7DaQ+8Gv5MfrC9qImGzWIVxKCTiSfIF/s/+VpfTwl+4YZmAnFAVlq4qEIF+KwXsJOKktjha6VkFPhd6kDu00yD5JCgPHSjVSikacgnVVE3Jp6DwGhR00w35oiIzPYWu091oIA7y1cHXT/awvoEtUTgy9/A7rchYVD7ejULEGRcFYCgLOf48gAQQwAsOke0AXDJQlPFz0tgD61YfftowNcxmFsyBxUOew41NIHwPY2HEnYmwY31lh8W9En8eBLXdDtKbuhmenw9mSIWYAAjP6GE/9uC/sW5Nj1uhGIqexDC4E1soDmZp52j3QLTsPCjdhlDGDEGDryABRBrhvHAspIJYMPmFlpbrLqclz6svgzA9thsOcV8CFgAAAAAAAAAAAA',
  },
});
// <<< fruit art
if (customElements.get('fruit-matrix')) return;
// >>> element (src/elements/matrix.js)
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
// <<< element
})();
