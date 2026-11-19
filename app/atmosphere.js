import * as THREE from 'three';
import { moonlightVolume } from './moonlight.js';
import { addSpaceLayers } from './space.js';

const treatments = {
  moonlight: { key: '#dbd9f7', rim: '#a091d5', core: '#d99c70', glow: 0.8, haze: 0.9 },
  ember: { key: '#ffe3bc', rim: '#cd693d', core: '#e5a453', glow: 0.95, haze: 1.05 },
  aurora: { key: '#c5daf9', rim: '#8c73d8', core: '#56a8a0', glow: 0.9, haze: 1.1 },
};

// Radial illumination gives the photo cloud volume without a solid sphere surface.
export const particleLighting = `
  uniform vec3 keyLight;
  uniform vec3 rimLight;
  uniform vec3 coreLight;
  uniform float lightTime;
  uniform float lightAmount;
  vec3 particleLight(vec3 anchor) {
    vec3 normal = normalize(mat3(viewMatrix) * normalize(anchor));
    vec3 eye = normalize(-(viewMatrix * vec4(anchor, 1.0)).xyz);
    float key = pow(max(0.0, dot(normal, normalize(vec3(-0.65, 0.8, 0.6)))), 1.5);
    float rim = pow(1.0 - abs(dot(normal, eye)), 2.0);
    float edge = smoothstep(0.65, 1.9, length(anchor));
    float core = exp(-dot(anchor, anchor) * 0.75);
    float breathe = 0.98 + 0.02 * sin(lightTime * 0.28 + anchor.y);
    return (keyLight * key * 0.23 + rimLight * rim * edge * 0.5 + coreLight * core * 0.2) * breathe * lightAmount;
  }
`;

const screenVertex = `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

export async function createAtmosphere(renderer, scene, camera) {
  const requested = new URLSearchParams(location.search).get('light');
  const name = Object.hasOwn(treatments, requested) ? requested : 'moonlight';
  const treatment = treatments[name];
  const nebula = name === 'moonlight';
  const uniforms = {
    keyLight: { value: new THREE.Color(treatment.key) },
    rimLight: { value: new THREE.Color(treatment.rim) },
    coreLight: { value: new THREE.Color(treatment.core) },
    lightTime: { value: 0 }, lightAmount: { value: 1 },
  };
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(6.8, 6.8), new THREE.ShaderMaterial({
    uniforms: { ...uniforms, haze: { value: treatment.haze } },
    vertexShader: `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: `
      uniform vec3 keyLight;
      uniform vec3 rimLight;
      uniform vec3 coreLight;
      uniform float lightAmount;
      uniform float lightTime;
      uniform float haze;
      varying vec2 vUv;
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        vec4 h = fract(sin(vec4(dot(i,vec2(127.1,311.7)),dot(i+vec2(1,0),vec2(127.1,311.7)),dot(i+vec2(0,1),vec2(127.1,311.7)),dot(i+vec2(1,1),vec2(127.1,311.7)))) * 43758.5453);
        return mix(mix(h.x,h.y,f.x), mix(h.z,h.w,f.x), f.y);
      }
      void main() {
        vec2 p = (vUv - 0.5) * 2.0;
        float radius = length(p);
        float cloud = noise(p * 4.0 + vec2(lightTime * 0.012, 0.0)) * 0.6 + noise(p * 9.0) * 0.3 + noise(p * 19.0) * 0.1;
        float scattering = exp(-pow((radius - 0.51) / 0.20, 2.0));
        float side = 0.35 + 0.65 * smoothstep(-0.5, 0.7, dot(p, normalize(vec2(-0.7, 0.8))));
        float core = exp(-dot(p - vec2(0.08, -0.05), p - vec2(0.08, -0.05)) * 13.0);
        float outer = 1.0 - smoothstep(0.65, 0.98, radius);
        vec3 light = rimLight * scattering * side * 0.12 + coreLight * core * 0.09;
        light += keyLight * exp(-dot(p - vec2(-0.25, 0.3), p - vec2(-0.25, 0.3)) * 18.0) * 0.025;
        light *= (0.3 + cloud * 0.9) * outer * haze * lightAmount;
        gl_FragColor = vec4(light, 1.0);
        #include <colorspace_fragment>
      }
    `,
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
  }));
  halo.renderOrder = -10;
  halo.frustumCulled = false;
  if (!nebula) scene.add(halo);

  // A small bloom buffer softens bright fragments. The main image stays at full resolution.
  const targetOptions = { depthBuffer: false };
  if (nebula) {
    // Preserve faint steps in linear light all the way to the display conversion.
    if (renderer.extensions.has('EXT_color_buffer_float')) targetOptions.type = THREE.HalfFloatType;
    else targetOptions.colorSpace = THREE.SRGBColorSpace;
  }
  const sceneTarget = new THREE.WebGLRenderTarget(1, 1, targetOptions);
  const bloomA = new THREE.WebGLRenderTarget(1, 1, targetOptions);
  const bloomB = new THREE.WebGLRenderTarget(1, 1, targetOptions);
  const gas = nebula ? await moonlightVolume(camera, screenVertex, uniforms.lightTime) : null;
  const gasTarget = nebula ? new THREE.WebGLRenderTarget(1, 1, targetOptions) : null;
  const lastCloudView = new THREE.Matrix4();
  let lastCloudTime = -Infinity;
  const postScene = new THREE.Scene();
  const postCamera = new THREE.Camera();
  const postQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  postQuad.frustumCulled = false; postScene.add(postQuad);
  const extract = new THREE.ShaderMaterial({
    uniforms: { source: { value: sceneTarget.texture }, sourceTexel: { value: new THREE.Vector2() } }, vertexShader: screenVertex,
    fragmentShader: `
      uniform sampler2D source;
      uniform vec2 sourceTexel;
      varying vec2 vUv;
      void main() {
        // Average the entire footprint of a bloom pixel, including subpixel stars.
        vec2 corner = sourceTexel;
        vec3 color = (texture2D(source, vUv + corner).rgb + texture2D(source, vUv - corner).rgb
                    + texture2D(source, vUv + vec2(corner.x, -corner.y)).rgb
                    + texture2D(source, vUv + vec2(-corner.x, corner.y)).rgb) * 0.25;
        float bright = max(max(color.r, color.g), color.b);
        gl_FragColor = vec4(color * smoothstep(0.08, 0.38, bright), 1.0);
      }
    `, depthTest: false, depthWrite: false,
  });
  const blur = new THREE.ShaderMaterial({
    uniforms: { source: { value: bloomA.texture }, stepSize: { value: new THREE.Vector2() } }, vertexShader: screenVertex,
    fragmentShader: `
      uniform sampler2D source;
      uniform vec2 stepSize;
      varying vec2 vUv;
      void main() {
        vec3 color = texture2D(source, vUv).rgb * 0.227027;
        color += texture2D(source, vUv + stepSize * 1.384615).rgb * 0.316216;
        color += texture2D(source, vUv - stepSize * 1.384615).rgb * 0.316216;
        color += texture2D(source, vUv + stepSize * 3.230769).rgb * 0.070270;
        color += texture2D(source, vUv - stepSize * 3.230769).rgb * 0.070270;
        gl_FragColor = vec4(color, 1.0);
      }
    `, depthTest: false, depthWrite: false,
  });
  const composite = new THREE.ShaderMaterial({
    defines: nebula ? { MOONLIGHT: 1 } : {},
    uniforms: { source: { value: sceneTarget.texture }, bloom: { value: bloomA.texture }, amount: { value: treatment.glow }, gasMap: { value: gasTarget?.texture }, lightAmount: uniforms.lightAmount },
    vertexShader: screenVertex,
    fragmentShader: `
      uniform sampler2D source;
      uniform sampler2D bloom;
      uniform float amount;
      varying vec2 vUv;
      #ifdef MOONLIGHT
        uniform sampler2D gasMap;
        uniform float lightAmount;
      #endif
      void main() {
        vec3 color = texture2D(source, vUv).rgb + texture2D(bloom, vUv).rgb * amount;
        #ifdef MOONLIGHT
          vec4 cloud = texture2D(gasMap, vUv) * lightAmount;
          color = color * (1.0 - cloud.a * 0.60) + cloud.rgb;
        #endif
        gl_FragColor = vec4(color, 1.0);
        #include <colorspace_fragment>
        #ifdef MOONLIGHT
          // Stable subpixel dither for the final 8-bit gradients, preserving pitch black.
          float dither = fract(52.9829 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) - 0.5;
          gl_FragColor.rgb += smoothstep(vec3(0.0), vec3(0.025), gl_FragColor.rgb) * dither / 255.0;
        #endif
      }
    `, depthTest: false, depthWrite: false,
  });
  let bloomWidth = 1, bloomHeight = 1, elapsed = 0;
  // Draw the near stars and wisps over the finished nebula. Far layers join
  // the main scene and receive its dust attenuation and bloom.
  const foreground = new THREE.Scene();
  const compositeQuad = new THREE.Mesh(postQuad.geometry, composite);
  compositeQuad.frustumCulled = false;
  foreground.add(compositeQuad);
  addSpaceLayers(scene, foreground, uniforms.lightAmount);
  function present() {
    renderer.setRenderTarget(null);
    renderer.render(foreground, camera);
  }
  function pass(material, target) {
    postQuad.material = material;
    renderer.setRenderTarget(target);
    renderer.render(postScene, postCamera);
  }
  return {
    name, uniforms,
    resize(width, height) {
      const ratio = renderer.getPixelRatio();
      sceneTarget.setSize(Math.round(width * ratio), Math.round(height * ratio));
      extract.uniforms.sourceTexel.value.set(1 / sceneTarget.width, 1 / sceneTarget.height);
      bloomWidth = Math.max(1, Math.ceil(width * ratio / 4));
      bloomHeight = Math.max(1, Math.ceil(height * ratio / 4));
      bloomA.setSize(bloomWidth, bloomHeight); bloomB.setSize(bloomWidth, bloomHeight);
      if (gasTarget) {
        const scale = Math.min(0.85, 1000 / Math.max(width, height));
        gasTarget.setSize(Math.max(1, Math.round(width*scale)), Math.max(1, Math.round(height*scale)));
        lastCloudTime = -Infinity;
      }
    },
    render(delta, moving) {
      if (moving) elapsed += delta;
      uniforms.lightTime.value = elapsed;
      // Atmosphere recedes as the camera approaches individual media.
      uniforms.lightAmount.value = THREE.MathUtils.smoothstep(camera.position.length(), 2.8, 6.0);
      halo.quaternion.copy(camera.quaternion);
      composite.uniforms.amount.value = treatment.glow * uniforms.lightAmount.value;
      if (!nebula && uniforms.lightAmount.value < 0.01) {
        renderer.setRenderTarget(null); renderer.render(scene, camera); return;
      }
      renderer.setRenderTarget(sceneTarget); renderer.render(scene, camera);
      if (gas && uniforms.lightAmount.value > 0 && (!lastCloudView.equals(camera.matrixWorld) || elapsed - lastCloudTime >= 0.08)) {
        pass(gas, gasTarget);
        lastCloudView.copy(camera.matrixWorld);
        lastCloudTime = elapsed;
      }
      if (nebula && uniforms.lightAmount.value === 0) {
        present(); return;
      }
      pass(extract, bloomA);
      blur.uniforms.source.value = bloomA.texture;
      blur.uniforms.stepSize.value.set(1 / bloomWidth, 0); pass(blur, bloomB);
      blur.uniforms.source.value = bloomB.texture;
      blur.uniforms.stepSize.value.set(0, 1 / bloomHeight); pass(blur, bloomA);
      present();
    },
  };
}
