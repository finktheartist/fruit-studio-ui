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
