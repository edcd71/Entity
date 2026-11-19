import * as THREE from 'three';

// Bake the cloud once. Ray samples then cost a single trilinear texture lookup.
function makeDensityVolume(referenceImage) {
  const spread = 1.5;
  // Filter the reference down to its broad regions of color before shaping the gas.
  const canvas = document.createElement('canvas');
  const width = Math.round(72 / spread);
  const height = Math.round(width * referenceImage.height / referenceImage.width);
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.imageSmoothingQuality = 'high';
  context.drawImage(referenceImage, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height).data;
  const sampleColor = new THREE.Color();
  const linear = Float32Array.from({length: 256}, (_, i) => sampleColor.setRGB(i / 255, 0, 0, THREE.SRGBColorSpace).r);
  const colors = Float32Array.from(pixels, value => linear[value]);
  function sampleColorField(u, v, result) {
    const col = Math.max(0, Math.min(width - 1, u * width - 0.5));
    const row = Math.max(0, Math.min(height - 1, (1 - v) * height - 0.5));
    const ix = Math.floor(col), iy = Math.floor(row);
    const top = 4 * (ix + width * iy);
    const right = ix + 1 < width ? 4 : 0;
    const down = iy + 1 < height ? 4 * width : 0;
    for (let c = 0; c < 3; c++) {
      const a = top + c;
      result[c] = mix(mix(colors[a], colors[a + right], col - ix),
                      mix(colors[a + down], colors[a + down + right], col - ix), row - iy);
    }
  }

  // Draw a composition once per load. All density and color variation is baked in world space.
  let seed = crypto.getRandomValues(new Uint32Array(1))[0];
  function random() {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  const roll = random() * Math.PI * 2;
  const tilt = (random() - 0.5) * 1.1;
  const cr = Math.cos(roll), sr = Math.sin(roll), ct = Math.cos(tilt), st = Math.sin(tilt);
  const stretch = 0.83 + random() * 0.36;
  const ribbonPhase = random() * Math.PI * 2;
  const branchPhase = random() * Math.PI * 2;
  const centerU = 0.48 + (random() - 0.5) * 0.10;
  const centerV = 0.50 + (random() - 0.5) * 0.09;
  const face = new Float32Array(3), flank = new Float32Array(3);
  const side = 128;
  const voxels = new Uint8Array(side ** 3 * 4);
  const lattice = Float32Array.from({length: 32 ** 3}, () => 2 * random() - 1);
  const smooth = t => t * t * (3 - 2 * t);
  const mix = (a, b, t) => a + (b - a) * t;
  const at = (x, y, z) => lattice[(x & 31) + ((y & 31) << 5) + ((z & 31) << 10)];
  function noise(x, y, z) {
    const i = Math.floor(x), j = Math.floor(y), k = Math.floor(z);
    const u = smooth(x - i), v = smooth(y - j), w = smooth(z - k);
    const front = mix(mix(at(i,j,k), at(i+1,j,k), u), mix(at(i,j+1,k), at(i+1,j+1,k), u), v);
    const back = mix(mix(at(i,j,k+1), at(i+1,j,k+1), u), mix(at(i,j+1,k+1), at(i+1,j+1,k+1), u), v);
    return mix(front, back, w);
  }
  const byte = value => Math.round(255 * Math.min(1, Math.max(0, value)));
  const bell = distance => Math.exp(-((distance / spread) ** 2));
  for (let iz = 0; iz < side; iz++) for (let iy = 0; iy < side; iy++) for (let ix = 0; ix < side; ix++) {
    const x = 2 * (ix + 0.5) / side - 1, y = 2 * (iy + 0.5) / side - 1, z = 2 * (iz + 0.5) / side - 1;
    const radius = Math.sqrt(x*x + y*y + z*z);
    if (radius >= 1) continue;
    const edge = smooth(Math.min(1, (1 - radius) / (0.46 * spread)));
    const u = (cr*x + sr*y) * stretch;
    const vertical = cr*y - sr*x;
    const v = (ct*vertical + st*z) / stretch;
    const w = ct*z - st*vertical;
    const swell = noise(2.2*u + 2.1, 2.9*v + 5.7, 1.8*w + 6.4);
    const curl = noise(2.5*v + 7.1, 1.9*w - 2.7, 2.8*u + 4.3);
    const fold = noise(6*u + swell, 7*v + curl, 3*w + 7.3);
    const ribbon = v - 0.22*Math.sin(3.3*u + 1.5*w + ribbonPhase) - 0.20*curl;
    const branch = u + 0.29*Math.sin(3.7*w + 2.2*v + branchPhase) - 0.20*swell;
    const front = bell((w - 0.20 + 0.38*(u*u + v*v) - 0.28*swell - 0.07*fold) / 0.30);
    const back = bell((w + 0.26 + 0.22*Math.sin(3*v + branchPhase) + 0.18*curl) / 0.46);
    const body = edge * (0.18 + 0.82*bell(ribbon/0.55));
    const grain = Math.max(0.12, 0.69 + 0.54*swell + 0.21*fold);

    const perspective = 1 - 0.23*w;
    sampleColorField(centerU + 0.53*u/perspective + 0.12*swell + 0.04*fold,
                     centerV + 0.38*v/perspective + 0.10*curl, face);
    sampleColorField(0.54 + 0.48*w + 0.13*v + 0.10*curl,
                     0.48 + 0.35*v - 0.14*w + 0.09*u + 0.08*swell, flank);
    const faceLight = face[0] + face[2];
    const sideLight = flank[0] + flank[2];
    const foldEdge = ribbon + 0.18*swell + 0.075*fold;
    const strands = bell(foldEdge/0.10) + 0.59*bell((foldEdge - 0.19 - 0.075*curl)/0.07);
    const faceWeight = body * grain * (front*(0.54 + 1.06*strands) + 0.30*back) * (0.78 + 0.28*Math.min(1, sideLight));
    const sideWeight = edge * grain * (0.08*back + 0.68*bell(branch/0.25)) * (0.37 + 0.33*Math.min(1, faceLight));
    const offset = 4 * (ix + side * (iy + side * iz));
    for (let channel = 0; channel < 3; channel++) {
      const faceColor = Math.max(0, face[channel] - 0.007) / (1 + 0.5*faceLight);
      const sideColor = Math.max(0, flank[channel] - 0.007) / (1 + 0.5*sideLight);
      // Spread the highlights over the wider folds so they stay translucent.
      voxels[offset+channel] = byte(Math.sqrt((faceColor*faceWeight + sideColor*sideWeight) * 0.5 / spread));
    }
    const dust = bell((foldEdge + 0.12) / 0.115) * Math.max(0, 0.42 + curl);
    voxels[offset+3] = byte(edge * (0.035 + 0.11*front + dust*(0.33 + 0.49/(1 + 7*faceLight))));
  }
  const texture = new THREE.Data3DTexture(voxels, side, side, side);
  texture.format = THREE.RGBAFormat;
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

export async function moonlightVolume(camera, vertexShader, lightTime) {
  const reference = await new THREE.ImageLoader().loadAsync('/assets/nebula/moonlight-reference.png');
  return new THREE.ShaderMaterial({
    uniforms: {
      densityMap: { value: makeDensityVolume(reference) },
      cameraWorld: { value: camera.matrixWorld }, inverseProjection: { value: camera.projectionMatrixInverse }, lightTime,
    },
    vertexShader,
    fragmentShader: `
      uniform highp sampler3D densityMap;
      uniform mat4 cameraWorld, inverseProjection;
      uniform float lightTime;
      varying vec2 vUv;
      void main() {
        const float radius = 3.15;
        vec3 origin = cameraWorld[3].xyz;
        vec3 ray = normalize(mat3(cameraWorld) * (inverseProjection * vec4(2.0*vUv - 1.0, 1.0, 1.0)).xyz);
        float along = -dot(origin, ray);
        float discriminant = along*along - dot(origin,origin) + radius*radius;
        if (discriminant <= 0.0) { gl_FragColor = vec4(0.0); return; }
        float halfChord = sqrt(discriminant);
        float start = max(0.0, along - halfChord);
        float stepLength = max(0.0, along + halfChord - start) / 48.0;
        vec3 position = origin + ray * (start + 0.5*stepLength);
        vec3 radiance = vec3(0.0);
        float transmission = 1.0;
        for (int i = 0; i < 48; i++) {
          vec3 uvw = position / (2.0*radius) + 0.5;
          uvw += 0.004 * sin(uvw.yzx*6.0 + lightTime*0.07);
          vec4 gas = texture(densityMap, uvw);
          vec3 light = transmission * 2.0 * gas.rgb * gas.rgb * stepLength;
          radiance += light;
          transmission *= exp(-stepLength * gas.a * 1.45);
          position += ray * stepLength;
        }
        gl_FragColor = vec4(radiance, 1.0 - transmission);
      }
    `,
    depthTest: false, depthWrite: false,
  });
}
