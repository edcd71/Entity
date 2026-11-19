import * as THREE from 'three';

const starVertex = `
  attribute float magnitude;
  attribute float span;
  attribute vec3 tint;
  uniform float pixelRatio, viewportHeight, lightAmount;
  varying vec3 starColor;
  varying float rank, fade, sizeInPixels;
  void main() {
    vec4 point = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * point;
    sizeInPixels = clamp(span * viewportHeight * 0.5 * projectionMatrix[1][1] / max(0.1, -point.z), 1.5, 24.0);
    gl_PointSize = sizeInPixels * pixelRatio;
    rank = magnitude;
    starColor = tint;
    #ifdef NEAR_FIELD
      float inFront = smoothstep(-0.6, 0.6, point.z - viewMatrix[3].z);
      #ifdef FOREGROUND
        fade = inFront;
      #else
        fade = 1.0 - inFront;
      #endif
      fade *= lightAmount * smoothstep(0.55, 2.0, -point.z);
    #else
      fade = 0.48 + 0.52 * lightAmount;
    #endif
    if (fade < 0.001) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  }
`;
const starFragment = `
  varying vec3 starColor;
  varying float rank, fade, sizeInPixels;
  void main() {
    vec2 p = abs(gl_PointCoord - 0.5) * sizeInPixels;
    float radius = length(p);
    float width = 0.42 + 0.57 * rank * rank;
    float core = exp(-dot(p, p) / (width * width));
    float bright = smoothstep(0.93, 1.0, rank);
    float halo = 0.075 * exp(-radius / (2.2 * width));
    vec2 spikes = exp(-p / 0.40 - p.yx / (3.6 * width));
    float light = (core + bright * (halo + 0.27 * max(spikes.x, spikes.y)))
                * (0.032 + 0.28 * pow(rank, 3.0) + 0.9 * pow(rank, 18.0));
    light *= fade * (1.0 - smoothstep(0.36, 0.5, radius / sizeInPixels));
    gl_FragColor = vec4(light * mix(starColor, vec3(1.0), 0.64 * core), 1.0);
    #include <colorspace_fragment>
  }
`;

function starCatalog(count, near) {
  const positions = [], spans = [], ranks = [], colors = [];
  const direction = new THREE.Vector3();
  const bandAxis = new THREE.Vector3(0.84, 0, -0.54);
  const icy = new THREE.Color('#b5c9ec'), warm = new THREE.Color('#e1b798');
  const color = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const rank = Math.random();
    direction.randomDirection();
    if (!near && i % 3 === 0) {
      // Vary the stellar density along a narrow, tilted band across the sky.
      direction.y *= 0.11 + 0.25 * Math.random();
      direction.normalize().applyAxisAngle(bandAxis, 0.53);
    }
    direction.multiplyScalar(near ? 3.65 + Math.random()*4.2 : 42 + Math.random()*23);
    positions.push(direction.x, direction.y, direction.z);
    ranks.push(rank);
    spans.push((near ? 0.012 : 0.085) * (1 + 5*rank**4 + 10*rank**24));
    color.copy(icy).lerp(warm, Math.random()**1.6);
    colors.push(color.r, color.g, color.b);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('magnitude', new THREE.Float32BufferAttribute(ranks, 1));
  geometry.setAttribute('span', new THREE.Float32BufferAttribute(spans, 1));
  geometry.setAttribute('tint', new THREE.Float32BufferAttribute(colors, 3));
  return geometry;
}

// Integrate wisps through an ellipsoid. Its orientation, folds, and color live in
// world space, so a close anomaly has thickness as the camera passes beside it.
const gasVertex = `
  uniform float lightAmount;
  varying vec3 exitPoint, eye, axisRatio;
  varying vec4 viewDepth;
  varying float visibility;
  void main() {
    exitPoint = position;
    eye = (inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    vec3 axes = vec3(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz), length(modelMatrix[2].xyz));
    axisRatio = axes / pow(axes.x * axes.y * axes.z, 1.0 / 3.0);
    viewDepth = vec4(modelViewMatrix[0].z, modelViewMatrix[1].z, modelViewMatrix[2].z,
                     modelViewMatrix[3].z - viewMatrix[3].z);
    visibility = lightAmount;
    #ifdef NEAR_FIELD
      // Cull the whole pass only when even the nearest/farthest part of the volume is outside it.
      float depthRadius = length(viewDepth.xyz);
      #ifdef FOREGROUND
        if (viewDepth.w + depthRadius < -1.0) visibility = 0.0;
      #else
        if (viewDepth.w - depthRadius > 1.0) visibility = 0.0;
      #endif
      visibility *= mix(0.20, 1.0, smoothstep(0.4, 2.1, length(eye)));
    #endif
    if (visibility < 0.001) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  }
`;
const gasFragment = `
  uniform highp sampler3D noiseMap;
  uniform vec3 offset, tint;
  uniform vec4 shape;
  uniform float strength;
  varying vec3 exitPoint, eye, axisRatio;
  varying vec4 viewDepth;
  varying float visibility;
  float bell(float x) { return exp(-x*x); }
  void main() {
    vec3 dir = normalize(exitPoint - eye);
    float along = -dot(eye, dir);
    float disc = along*along + 1.0 - dot(eye, eye);
    if (disc <= 0.0) discard;
    float halfChord = sqrt(disc);
    float start = max(0.0, along - halfChord);
    float stepLength = max(0.0, along + halfChord - start) / 16.0;
    float opticalStep = stepLength * clamp(length(dir * axisRatio), 0.65, 1.8);
    vec3 p = eye + dir * (start + 0.5*stepLength);
    float glow = 0.0, transmission = 1.0;
    for (int i = 0; i < 16; i++) {
      vec2 flow = texture(noiseMap, offset + p*vec3(0.066,0.087,0.048)).rg - 0.5;
      vec2 folds = texture(noiseMap, offset.yzx + p*vec3(0.16,0.20,0.09)
                         + vec3(flow, flow.x - flow.y)*0.09).rg - 0.5;
      float curl = shape.z*sin(shape.y*p.x + 1.2*p.z + offset.x*6.28) + flow.x + 0.25*folds.x;
      float fold = p.y - curl;
      float edge = smoothstep(0.0, 0.93, 1.0 - dot(p,p));
      float pockets = smoothstep(-0.12, 0.68, 0.25 + flow.y + 0.48*folds.y);
      float veil = bell(fold / shape.x);
      float branch = bell((fold - 0.34 - 0.45*flow.y) / (0.63*shape.x));
      float sheet = bell((p.z - shape.w*p.x - 0.49*flow.x) / 0.78);
      float gas = edge * pockets * (0.12 + sheet*(veil + 0.48*branch));
      float dust = edge * pockets * bell((fold + 0.32 + 0.18*folds.y) / 0.23);
      float layer = visibility;
      #ifdef NEAR_FIELD
        // Split along the actual ray so a single cloud can curl behind and in front of the archive.
        float inFront = smoothstep(-1.0, 1.0, dot(viewDepth, vec4(p, 1.0)));
        #ifdef FOREGROUND
          layer *= inFront;
        #else
          layer *= 1.0 - inFront;
        #endif
      #endif
      float path = layer * opticalStep;
      float light = 0.54 + 0.72*smoothstep(-0.47, 0.48, flow.x - 0.45*fold + 0.22*p.z);
      glow += transmission * gas * light * path;
      transmission *= exp(-path*(0.25*gas + 0.47*dust));
      p += dir*stepLength;
    }
    gl_FragColor = vec4(tint * glow * strength, 1.0 - transmission);
    #include <colorspace_fragment>
  }
`;

export function addSpaceLayers(scene, foreground, lightAmount) {
  const pixelRatio = {value: Math.min(devicePixelRatio, 2)};
  const viewportHeight = {value: innerHeight};
  function addStars(parent, geometry, defines) {
    const stars = new THREE.Points(geometry, new THREE.ShaderMaterial({
      defines, uniforms: {pixelRatio, viewportHeight, lightAmount}, vertexShader: starVertex, fragmentShader: starFragment,
      transparent: true, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false,
    }));
    stars.renderOrder = defines.FOREGROUND ? -10 : -30;
    parent.add(stars);
  }
  addStars(scene, starCatalog(7400, false), {});
  const nearby = starCatalog(530, true);
  addStars(scene, nearby, {NEAR_FIELD: 1});
  addStars(foreground, nearby, {NEAR_FIELD: 1, FOREGROUND: 1});

  const side = 32;
  const noise = new THREE.Data3DTexture(Uint8Array.from({length: 2 * side**3}, () => Math.floor(Math.random()*256)), side, side, side);
  noise.format = THREE.RGFormat;
  noise.minFilter = noise.magFilter = THREE.LinearFilter;
  noise.wrapS = noise.wrapT = noise.wrapR = THREE.RepeatWrapping;
  noise.needsUpdate = true;
  const box = new THREE.BoxGeometry(2, 2, 2);
  const between = (min, max) => min + (max - min) * Math.random();
  const palette = ['#758bb0', '#92799e', '#ae8167'];
  function addWisp(position, scale, rotation, tint, strength, near) {
    const uniforms = {
      noiseMap: {value: noise}, offset: {value: new THREE.Vector3().random()}, tint: {value: tint},
      shape: {value: new THREE.Vector4(between(0.23,0.46), between(1.8,4.8), between(0.17,0.52), between(-0.66,0.66))},
      strength: {value: strength}, lightAmount,
    };
    for (const parent of near ? [scene, foreground] : [scene]) {
      const defines = near ? {NEAR_FIELD: 1} : {};
      if (parent === foreground) defines.FOREGROUND = 1;
      const material = new THREE.ShaderMaterial({
        defines, uniforms, vertexShader: gasVertex, fragmentShader: gasFragment,
        side: THREE.BackSide, transparent: true, depthTest: false, depthWrite: false,
        blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      });
      const wisp = new THREE.Mesh(box, material);
      wisp.position.copy(position); wisp.scale.copy(scale); wisp.quaternion.copy(rotation);
      wisp.renderOrder = -20;
      parent.add(wisp);
    }
  }

  // Each bank has a diffuse body and smaller folds offset from it in all three dimensions.
  // Neighboring folds share a palette, while their tilt, thickness, and spacing vary.
  function addBank(center, size, level, turn) {
    const orientation = new THREE.Quaternion().setFromEuler(new THREE.Euler(between(-0.8,0.8), between(-0.9,0.9), turn, 'ZYX'));
    const hue = new THREE.Color(palette[Math.floor(Math.random() * palette.length)]);
    const depthTint = new THREE.Color(level === 2 ? '#657da2' : '#a38a97');
    hue.lerp(depthTint, level === 2 ? 0.46 : 0.14);
    const strength = [0.090, 0.13, 0.078][level] * between(0.78, 1.22);
    const count = Math.random() < 0.55 ? 2 : 3;
    for (let i = 0; i < count; i++) {
      const distance = i === 0 ? 0 : (i === 1 ? 1 : -1) * between(0.55, 1.12);
      const localOffset = new THREE.Vector3(distance, 0.32*Math.sin(2.6*distance), distance*between(-0.8,0.8));
      const position = localOffset.multiplyScalar(size).applyQuaternion(orientation).add(center);
      const radius = size * (i === 0 ? 1 : between(0.46, 0.81));
      const scale = new THREE.Vector3(radius, radius*between(0.37,0.78), radius*between(0.42,0.96));
      const tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(between(-0.4,0.4), between(-0.6,0.6), between(-0.65,0.65)));
      const tint = hue.clone().lerp(depthTint, between(0.03, 0.24));
      addWisp(position, scale, orientation.clone().multiply(tilt), tint, strength*(i === 0 ? 1 : 0.74), level < 2);
    }
  }

  const openingAngle = between(0, Math.PI*2);
  const ranges = [[4.1, 8.0], [10, 21], [26, 50]];
  for (const [level, [inner, outer]] of ranges.entries()) {
    // Distribute the opening banks around the view, then populate the rest of the sky for orbit.
    const angle = openingAngle + level * 2.39996 + between(-0.40, 0.40);
    const z = level === 0 ? between(2.8, 5.2) : -between(inner*0.76, outer*0.89);
    const openingDepth = 8.8 - z;
    const offset = openingDepth * between(0.24, 0.37);
    const position = new THREE.Vector3(1.25*offset*Math.cos(angle), offset*Math.sin(angle), z);
    addBank(position, openingDepth*between(0.17,0.27), level, angle + between(-1.2,1.2));
    for (let i = 0; i < 5; i++) {
      const radius = between(inner, outer);
      const anchor = new THREE.Vector3().randomDirection().multiplyScalar(radius);
      addBank(anchor, radius*between(0.13,0.25), level, between(0,Math.PI*2));
    }
  }
}
