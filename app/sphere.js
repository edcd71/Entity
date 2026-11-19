import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';
import { createAtmosphere, particleLighting } from './atmosphere.js';
import { photoDetail } from './photo-detail.js';

const $ = selector => document.querySelector(selector);
const mediaURL = path => '/' + path.split('/').map(encodeURIComponent).join('/');
// Match the year as recorded by the camera, without shifting its timezone.
const capturedIn2022 = item => /^2022[-:]/.test(item.capturedAt || '');
const stage = $('#stage');
const dialog = $('#viewer');
const detail = photoDetail(dialog);
let stageBounds = stage.getBoundingClientRect();
const stageCenter = () => ({ x: stageBounds.left + stageBounds.width / 2, y: stageBounds.top + stageBounds.height / 2 });
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let renderer, camera, controls, scene, index, allItems, atmosphere;
let selected = -1, interacted = false, ready = false;
let lastTime = 0, lastDetailUpdate = 0, pointers = new Map(), multiTouch = false;
const particles = [], batches = [], details = new Map();
const loader = new THREE.TextureLoader();
const viewport = new THREE.Vector3();
const maxDetails = innerWidth < 700 ? 12 : 24;
const quad = new THREE.PlaneGeometry(1, 1);
let pendingDetails = 0;

// Camera-facing media fragments: rounded, translucent at a distance,
// resolving into readable photographs as the viewer moves through the cloud.
const vertexShader = `
  #ifdef DETAIL
    uniform vec3 anchor;
    uniform float particleSize;
    uniform float opacity;
    uniform vec4 atlasRect;
  #else
    attribute vec3 anchor;
    attribute float particleSize;
    attribute float opacity;
    attribute vec4 atlasRect;
  #endif
  uniform float viewportHeight;
  ${particleLighting}
  varying vec3 vLight;
  varying vec2 vUv;
  varying vec2 vAtlasUv;
  varying float vOpacity;
  varying float vPixels;
  #ifdef MOONLIGHT
    varying float vMagnitude;
    varying float vSpread;
  #endif
  void main() {
    vLight = particleLight(anchor);
    vec4 center = modelViewMatrix * vec4(anchor, 1.0);
    float front = center.z - (viewMatrix * vec4(0.0, 0.0, 0.0, 1.0)).z;
    vOpacity = opacity * mix(0.32, 1.0, smoothstep(-1.8, 1.5, front));
    vPixels = particleSize * projectionMatrix[1][1] * viewportHeight * 0.5 / max(0.01, -center.z);
    vOpacity *= smoothstep(0.025, 0.16, -center.z);
    float width = particleSize;
    #ifdef MOONLIGHT
      vMagnitude = fract(sin(dot(anchor, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
      float distant = lightAmount * (1.0 - smoothstep(18.0, 58.0, vPixels));
      vSpread = 1.0 + 3.0 * distant * smoothstep(0.982, 1.0, vMagnitude);
      width *= vSpread;
    #endif
    center.xy += position.xy * width;
    gl_Position = projectionMatrix * center;
    vUv = uv;
    vAtlasUv = atlasRect.xy + uv * atlasRect.zw;
  }
`;
const fragmentShader = `
  uniform sampler2D map;
  #ifdef MOONLIGHT
    uniform float lightAmount;
    varying float vMagnitude;
    varying float vSpread;
  #endif
  varying vec3 vLight;
  varying vec2 vUv;
  varying vec2 vAtlasUv;
  varying float vOpacity;
  varying float vPixels;
  void main() {
    vec2 p = abs(vUv - 0.5);
    float roundMask = 1.0 - smoothstep(0.20, 0.5, length(p));
    float photoMask = 1.0 - smoothstep(0.43, 0.5, max(p.x, p.y));
    float mask = mix(roundMask, photoMask, smoothstep(18.0, 65.0, vPixels));
    float alpha = mask * vOpacity;
    vec3 original = texture2D(map, vAtlasUv).rgb;
    vec3 illuminated = original + vLight * (original * 2.0 + 0.12);
    vec3 color = mix(illuminated, original, smoothstep(24.0, 90.0, vPixels));
    #ifdef MOONLIGHT
      // Each media anchor is also a star. Only the brightest stars develop diffraction spikes.
      float distant = lightAmount * (1.0 - smoothstep(18.0, 58.0, vPixels));
      vec2 offset = p * vPixels * vSpread;
      float brightness = pow(vMagnitude, 5.0);
      float exceptional = smoothstep(0.982, 1.0, vMagnitude);
      float width = clamp(vPixels * 0.085, 0.55, 1.3) * (0.75 + 0.65*brightness);
      float core = exp(-dot(offset, offset) / (width*width));
      float halo = exp(-length(offset) / (2.5*width));
      vec2 spike = exp(-offset/0.45 - offset.yx/(5.0*width));
      float starAlpha = (0.13 + 0.85*brightness) * (0.28 + vOpacity) * (core + 0.12*brightness*halo);
      starAlpha += exceptional * (0.66*core + 0.38*max(spike.x, spike.y));
      starAlpha *= (1.0 - smoothstep(0.34, 0.5, max(p.x, p.y))) * step(0.001, vOpacity);
      vec3 stellarColor = mix(vec3(1.0, 0.69, 0.40), vec3(0.51, 0.77, 1.12), vMagnitude);
      color = mix(color, mix(stellarColor, vec3(1.1), core*0.8), distant);
      alpha = mix(alpha, min(1.0, starAlpha), distant);
    #endif
    if (alpha < 0.012) discard;
    gl_FragColor = vec4(color, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;
const dustVertex = `
  attribute vec2 atlasCenter;
  attribute float particleSize;
  attribute float opacity;
  uniform float viewportHeight;
  uniform float pixelRatio;
  ${particleLighting}
  varying vec3 vLight;
  varying vec2 vAtlasCenter;
  varying float vOpacity;
  void main() {
    vLight = particleLight(position);
    vec4 p = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * p;
    gl_PointSize = clamp(particleSize * 1.35 * projectionMatrix[1][1] * viewportHeight * pixelRatio * 0.5 / max(0.1, -p.z), 1.0, 9.0 * pixelRatio);
    vOpacity = opacity * smoothstep(0.1, 0.7, -p.z);
    vAtlasCenter = atlasCenter;
  }
`;
const dustFragment = `
  uniform sampler2D map;
  varying vec3 vLight;
  varying vec2 vAtlasCenter;
  varying float vOpacity;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float glow = exp(-d * d * 18.0) * (1.0 - smoothstep(0.32, 0.5, d));
    vec3 color = texture2D(map, vAtlasCenter).rgb;
    color = mix(color, vec3(0.52, 0.50, 0.47), 0.25);
    color += vLight * 1.6;
    gl_FragColor = vec4(color, glow * vOpacity * 1.4);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;
const nodeVertex = `
  attribute float particleSize;
  uniform float viewportHeight;
  uniform float pixelRatio;
  varying float vOpacity;
  void main() {
    vec4 p = modelViewMatrix * vec4(position, 1.0);
    float worldPerPixel = 2.0 * max(0.01, -p.z) / (projectionMatrix[1][1] * viewportHeight);
    // Keep the node just outside the photograph's upper-right corner.
    p.xy += vec2(particleSize * 0.5 + 3.0 * worldPerPixel);
    gl_Position = projectionMatrix * p;
    gl_PointSize = 14.0 * pixelRatio;
    vOpacity = smoothstep(0.025, 0.16, -p.z);
  }
`;
const nodeFragment = `
  uniform vec3 nodeColor;
  varying float vOpacity;
  void main() {
    float distance = length(gl_PointCoord - 0.5);
    float core = 1.0 - smoothstep(0.16, 0.23, distance);
    float halo = (1.0 - smoothstep(0.20, 0.5, distance)) * 0.22;
    float alpha = max(core, halo) * vOpacity;
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(nodeColor, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;
function material(texture, detail = null) {
  const uniforms = { ...atmosphere.uniforms, map: { value: texture }, viewportHeight: { value: stageBounds.height } };
  if (detail) Object.assign(uniforms, {
    anchor: { value: detail.position }, particleSize: { value: detail.size },
    opacity: { value: detail.opacity }, atlasRect: { value: detail.rect },
  });
  return new THREE.ShaderMaterial({
    defines: { ...(detail ? { DETAIL: 1 } : {}), ...(atmosphere.name === 'moonlight' ? { MOONLIGHT: 1 } : {}) }, uniforms, vertexShader, fragmentShader,
    transparent: true, depthWrite: false, depthTest: false,
  });
}
function randomGenerator(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function buildCloud(textures) {
  const random = randomGenerator(1147);
  const dustStrength = atmosphere.name === 'moonlight' ? 0.34 : 1;
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  let ordinal = 0;
  index.faces.forEach((face, batchIndex) => {
    const anchors = [], sizes = [], opacities = [], rects = [];
    const dustPositions = [], dustSizes = [], dustOpacities = [], dustUVs = [];
    face.items.forEach((item, localIndex) => {
      const y = 1 - 2 * (ordinal + 0.5) / index.total;
      const angle = ordinal * goldenAngle;
      const radial = Math.sqrt(1 - y * y);
      const radius = 0.25 + 1.85 * Math.cbrt(random());
      const position = new THREE.Vector3(Math.cos(angle) * radial, y, Math.sin(angle) * radial).multiplyScalar(radius);
      const size = 0.045 + random() * 0.055;
      const edge = 1 - THREE.MathUtils.smoothstep(radius, 1.55, 2.15);
      const opacity = (0.62 + random() * 0.32) * (0.25 + edge * 0.75);
      const column = localIndex % index.columns, row = Math.floor(localIndex / index.columns);
      const inset = (index.gapPixels + 0.5) / index.cellPixels;
      const rect = new THREE.Vector4((column + inset) / index.columns, 1 - (row + 1 - inset) / index.rows, (1 - 2 * inset) / index.columns, (1 - 2 * inset) / index.rows);
      const particle = { item, position, size, opacity, rect, batchIndex, localIndex, flagged: capturedIn2022(item) };
      particles.push(particle);
      anchors.push(...position); sizes.push(size); opacities.push(opacity); rects.push(...rect);
      // Faint satellite grains dissolve the outline without adding a solid surface.
      for (let n = 0; n < 4; n++) {
        const dust = position.clone().add(new THREE.Vector3(random() - 0.5, random() - 0.5, random() - 0.5).multiplyScalar(0.42));
        dustPositions.push(...dust); dustSizes.push(0.006 + random() * 0.017);
        dustOpacities.push(dustStrength * (0.10 + random() * 0.26) * (0.3 + 0.7 * edge));
        dustUVs.push(rect.x + rect.z * 0.5, rect.y + rect.w * 0.5);
      }
      ordinal++;
    });
    const texture = textures[batchIndex];
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.index = quad.index;
    geometry.attributes.position = quad.attributes.position;
    geometry.attributes.uv = quad.attributes.uv;
    geometry.setAttribute('anchor', new THREE.InstancedBufferAttribute(new Float32Array(anchors), 3));
    geometry.setAttribute('particleSize', new THREE.InstancedBufferAttribute(new Float32Array(sizes), 1));
    geometry.setAttribute('opacity', new THREE.InstancedBufferAttribute(new Float32Array(opacities), 1));
    geometry.setAttribute('atlasRect', new THREE.InstancedBufferAttribute(new Float32Array(rects), 4));
    geometry.instanceCount = face.items.length;
    const mesh = new THREE.Mesh(geometry, material(texture));
    mesh.frustumCulled = false;
    scene.add(mesh);
    batches.push(mesh);
    const dustGeometry = new THREE.BufferGeometry();
    dustGeometry.setAttribute('position', new THREE.Float32BufferAttribute(dustPositions, 3));
    dustGeometry.setAttribute('particleSize', new THREE.Float32BufferAttribute(dustSizes, 1));
    dustGeometry.setAttribute('opacity', new THREE.Float32BufferAttribute(dustOpacities, 1));
    dustGeometry.setAttribute('atlasCenter', new THREE.Float32BufferAttribute(dustUVs, 2));
    const dust = new THREE.Points(dustGeometry, new THREE.ShaderMaterial({
      uniforms: { ...atmosphere.uniforms, map: { value: texture }, viewportHeight: { value: stageBounds.height }, pixelRatio: { value: renderer.getPixelRatio() } },
      vertexShader: dustVertex, fragmentShader: dustFragment, transparent: true,
      depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
    }));
    dust.renderOrder = -1; scene.add(dust);
  });
  const flagged = particles.filter(particle => particle.flagged);
  if (flagged.length) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(flagged.flatMap(particle => particle.position.toArray()), 3));
    geometry.setAttribute('particleSize', new THREE.Float32BufferAttribute(flagged.map(particle => particle.size), 1));
    const nodes = new THREE.Points(geometry, new THREE.ShaderMaterial({
      uniforms: {
        nodeColor: { value: new THREE.Color('#388bff') },
        viewportHeight: { value: stageBounds.height }, pixelRatio: { value: renderer.getPixelRatio() },
      },
      vertexShader: nodeVertex, fragmentShader: nodeFragment,
      transparent: true, depthWrite: false, depthTest: false,
    }));
    nodes.renderOrder = 10;
    nodes.frustumCulled = false;
    scene.add(nodes);
  }
}
function announce(message) { $('#announcement').textContent = message; }
function stopRotation() {
  interacted = true;
  controls.autoRotate = false;
}
function resize() {
  stageBounds = stage.getBoundingClientRect();
  camera.aspect = stageBounds.width / stageBounds.height;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(stageBounds.width, stageBounds.height);
  atmosphere?.resize(stageBounds.width, stageBounds.height);
  scene.traverse(object => {
    const uniforms = object.material?.uniforms;
    if (uniforms?.viewportHeight) uniforms.viewportHeight.value = stageBounds.height;
    if (uniforms?.pixelRatio) uniforms.pixelRatio.value = renderer.getPixelRatio();
  });
  if (ready && !interacted) overview();
}
function overview() {
  controls.target.set(0, 0, 0);
  const distance = 8.8 / Math.min(1, camera.aspect);
  camera.position.set(0, 0.15, distance);
  camera.lookAt(controls.target);
  controls.update();
}
function projected(particle) {
  viewport.copy(particle.position).applyMatrix4(camera.matrixWorldInverse);
  const depth = -viewport.z;
  if (depth < 0.16) return null;
  const pixels = particle.size * stageBounds.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * depth);
  viewport.copy(particle.position).project(camera);
  if (Math.abs(viewport.x) > 1.2 || Math.abs(viewport.y) > 1.2 || viewport.z > 1) return null;
  return { particle, x: stageBounds.left + (viewport.x + 1) * stageBounds.width / 2, y: stageBounds.top + (1 - viewport.y) * stageBounds.height / 2, pixels, depth };
}
function tileAt(clientX, clientY, nearest = false) {
  stageBounds = stage.getBoundingClientRect();
  camera.updateMatrixWorld();
  let best = null, score = Infinity;
  // Blue nodes are also direct selection targets for their associated media.
  for (const particle of particles) {
    if (!particle.flagged) continue;
    const view = projected(particle);
    if (!view) continue;
    const node = nodeScreenPosition(view);
    const distance = Math.hypot(clientX - node.x, clientY - node.y);
    if (distance <= 7 && distance < score) { best = particle; score = distance; }
  }
  if (best) return best;
  for (const particle of particles) {
    const view = projected(particle);
    if (!view) continue;
    const distance = Math.hypot(clientX - view.x, clientY - view.y);
    const radius = Math.max(3, view.pixels * 0.45);
    if (distance > Math.max(radius, nearest ? 40 : 0)) continue;
    // Prefer the frontmost particle when fragments overlap.
    const candidate = nearest ? distance / radius + view.depth * 0.015 : view.depth + distance / radius * 0.01;
    if (candidate < score) { score = candidate; best = particle; }
  }
  return best;
}
function nodeScreenPosition(view) {
  const offset = view.pixels * 0.5 + 3;
  return { x: view.x + offset, y: view.y - offset };
}
function hover(x, y) {
  if (!ready || pointers.size || dialog.open) return;
  renderer.domElement.classList.toggle('over-media', Boolean(tileAt(x, y)));
}
function zoom(factor) {
  stopRotation();
  const offset = camera.position.clone().sub(controls.target).multiplyScalar(factor);
  offset.setLength(THREE.MathUtils.clamp(offset.length(), controls.minDistance, controls.maxDistance));
  camera.position.copy(controls.target).add(offset);
  controls.update();
}
function setOverviewOpacity(particle, opacity) {
  const attribute = batches[particle.batchIndex].geometry.attributes.opacity;
  attribute.setX(particle.localIndex, opacity); attribute.needsUpdate = true;
}
function updateDetails() {
  stageBounds = stage.getBoundingClientRect();
  const center = stageCenter();
  camera.updateMatrixWorld();
  const visible = particles.map(projected).filter(view => view && view.pixels > 50)
    .sort((a, b) => Math.hypot(a.x - center.x, a.y - center.y) - Math.hypot(b.x - center.x, b.y - center.y))
    .slice(0, maxDetails);
  const wanted = new Set(visible.map(view => view.particle.item.id));
  for (const [id, detail] of details) {
    if (wanted.has(id)) continue;
    detail.cancelled = true;
    if (detail.mesh) { scene.remove(detail.mesh); detail.mesh.material.uniforms.map.value.dispose(); detail.mesh.material.dispose(); }
    setOverviewOpacity(detail.particle, detail.particle.opacity);
    details.delete(id);
  }
  for (const { particle } of visible) {
    if (details.has(particle.item.id) || pendingDetails >= 4) continue;
    const detail = { cancelled: false, mesh: null, particle };
    details.set(particle.item.id, detail); pendingDetails++;
    loader.load(mediaURL(particle.item.preview), texture => {
      pendingDetails--;
      if (detail.cancelled) { texture.dispose(); return; }
      texture.colorSpace = THREE.SRGBColorSpace;
      const aspect = texture.image.width / texture.image.height;
      const width = Math.min(1, 1 / aspect), height = Math.min(1, aspect);
      const rect = new THREE.Vector4((1 - width) / 2, (1 - height) / 2, width, height);
      const mesh = new THREE.Mesh(quad, material(texture, { ...particle, rect }));
      mesh.frustumCulled = false;
      detail.mesh = mesh; scene.add(mesh);
      setOverviewOpacity(particle, 0);
    }, undefined, () => { pendingDetails--; if (details.get(particle.item.id) === detail) details.delete(particle.item.id); });
  }
}

function clearMedia() {
  detail.clear();
  const video = $('#media video');
  if (video) { video.pause(); video.removeAttribute('src'); video.load(); }
  $('#media').replaceChildren();
}
function openMedia(item) {
  stopRotation();
  selected = allItems.findIndex(entry => entry.id === item.id);
  clearMedia();
  const element = document.createElement(item.type === 'video' ? 'video' : 'img');
  if (item.type === 'video') {
    element.controls = false;
    element.playsInline = true;
    element.preload = 'metadata';
    element.poster = mediaURL(item.preview);
    element.src = mediaURL(item.path);
    element.addEventListener('error', () => {
      if (!element.isConnected) return;
      announce('This video cannot play in this browser.');
      closeMedia();
    }, { once: true });
  } else {
    element.src = mediaURL(item.preview);
    element.alt = item.name;
  }
  $('#media').append(element);
  if (!dialog.open) dialog.showModal();
  if (item.type === 'image') detail.show(item, element, item.metadataUrl || mediaURL('media/metadata/' + item.id + '.json'));
  dialog.focus({ preventScroll: true });
  announce(item.name + (capturedIn2022(item) ? '. Captured in 2022, marked with a blue node.' : ''));
  if (item.type === 'video') element.play().catch(() => {});
}
function stepMedia(delta) { const item = allItems[selected + delta]; if (item) openMedia(item); }
function closeMedia() { clearMedia(); dialog.close(); }
$('#media').addEventListener('click', closeMedia);
dialog.addEventListener('cancel', clearMedia);
dialog.addEventListener('close', () => {
  if (dialog.open) return;
  clearMedia();
  renderer.domElement.focus({ preventScroll: true });
});

function bindInteraction() {
  const canvas = renderer.domElement;
  canvas.addEventListener('pointerdown', event => {
    stopRotation();
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size > 1) multiTouch = true;
    canvas.classList.add('dragging');
  });
  canvas.addEventListener('pointermove', event => hover(event.clientX, event.clientY));
  canvas.addEventListener('pointerup', event => {
    const start = pointers.get(event.pointerId);
    pointers.delete(event.pointerId);
    const isTap = start && !multiTouch && event.button === 0 && Math.hypot(event.clientX - start.x, event.clientY - start.y) < 6;
    if (!pointers.size) { canvas.classList.remove('dragging'); multiTouch = false; }
    if (isTap) { const tile = tileAt(event.clientX, event.clientY); if (tile) openMedia(tile.item); }
  });
  const clearPointers = () => { pointers.clear(); multiTouch = false; canvas.classList.remove('dragging'); };
  canvas.addEventListener('pointercancel', clearPointers);
  window.addEventListener('blur', clearPointers);
  canvas.addEventListener('wheel', stopRotation, { passive: true });
  canvas.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-', 'Enter', ' ', 'Home'].includes(event.key)) return;
    event.preventDefault(); stopRotation();
    if (['+', '='].includes(event.key)) return zoom(.8);
    if (event.key === '-') return zoom(1.25);
    if (event.key === 'Home') return overview();
    if (event.key === 'Enter') { const tile = tileAt(stageCenter().x, stageCenter().y, true); if (tile) openMedia(tile.item); return; }
    if (event.key.startsWith('Arrow')) {
      const offset = camera.position.clone().sub(controls.target);
      const axis = event.key === 'ArrowLeft' || event.key === 'ArrowRight' ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
      offset.applyAxisAngle(axis, ['ArrowLeft', 'ArrowUp'].includes(event.key) ? .085 : -.085);
      camera.position.copy(controls.target).add(offset); controls.update(); 
      const tile = tileAt(stageCenter().x, stageCenter().y, true); if (tile) announce(tile.item.name);
    }
  });
  dialog.addEventListener('keydown', event => {
    if (event.key === ' ' && $('#media video')) {
      event.preventDefault();
      const video = $('#media video');
      if (video) { if (video.paused) video.play().catch(() => {}); else video.pause(); }
    }
    if (event.key === 'ArrowLeft') { event.preventDefault(); stepMedia(-1); }
    if (event.key === 'ArrowRight') { event.preventDefault(); stepMedia(1); }
  });
}

function animate(time) {
  requestAnimationFrame(animate);
  const delta = Math.min(.05, (time - lastTime) / 1000 || 0);
  lastTime = time;
  if (!ready || document.hidden || dialog.open) return;
  controls.update(delta);
  if (time - lastDetailUpdate > 180) { updateDetails(); lastDetailUpdate = time; }
  atmosphere.render(delta, !interacted && !reducedMotion);
}
async function init() {
  try {
    // Reuse the six existing image atlases; their rectangular packing is independent of the 3D layout.
    const response = await fetch('/media/cube/index.json');
    if (!response.ok) throw Error('The media index is unavailable.');
    index = await response.json(); allItems = index.faces.flatMap(face => face.items);
    scene = new THREE.Scene(); scene.background = new THREE.Color(0x000000);
    camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, .01, 100);
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    atmosphere = await createAtmosphere(renderer, scene, camera);
    renderer.domElement.id = 'sphere'; renderer.domElement.tabIndex = 0;
    renderer.domElement.setAttribute('role', 'application');
    renderer.domElement.setAttribute('aria-label', `${index.total} images and videos in a diffuse 3D sphere. Blue nodes mark media captured in 2022. Drag or use arrow keys to rotate. Scroll, pinch, or use plus and minus to zoom. Select a media particle or blue node, or press Enter for one near the center. Home resets the view.`);
    stage.append(renderer.domElement);
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = .09;
    controls.rotateSpeed = .55; controls.zoomSpeed = .7;
    controls.enablePan = true; controls.panSpeed = .5;
    controls.minDistance = .3; controls.maxDistance = 28;
    controls.maxTargetRadius = 1.6;
    controls.autoRotate = !reducedMotion; controls.autoRotateSpeed = .14;
    controls.addEventListener('start', stopRotation);
    resize(); overview();
    const textures = await Promise.all(index.faces.map(face => loader.loadAsync(mediaURL(face.atlas))));
    buildCloud(textures);
    bindInteraction();
    window.addEventListener('resize', resize);
    new ResizeObserver(resize).observe(stage);
    renderer.domElement.addEventListener('webglcontextlost', event => { event.preventDefault(); ready = false; $('#loading').hidden = false; $('#loading').textContent = 'Graphics paused. Reload to restore the sphere.'; });
    ready = true; $('#loading').hidden = true; announce(`${index.total} media files loaded.`);
    Object.defineProperty(window, 'entitySphere', { value: Object.freeze({
      get lighting() { return atmosphere.name; },
      get lightAmount() { return atmosphere.uniforms.lightAmount.value; },
      get total() { return particles.length; },
      get rotating() { return controls.autoRotate; },
      get camera() { return camera.position.toArray(); },
      get detailTiles() { return [...details.values()].filter(detail => detail.mesh).length; },
      get selected() { return selected >= 0 ? allItems[selected].id : null; },
      get flaggedMedia() { return particles.filter(particle => particle.flagged).map(particle => particle.item.id); },
      get visibleMedia() {
        stageBounds = stage.getBoundingClientRect();
        camera.updateMatrixWorld();
        return particles.map(projected).filter(view => view && view.x > stageBounds.left && view.x < stageBounds.right && view.y > stageBounds.top && view.y < stageBounds.bottom)
          .sort((a, b) => a.depth - b.depth)
          .map(view => ({ id: view.particle.item.id, type: view.particle.item.type, x: view.x, y: view.y, pixels: view.pixels, node: view.particle.flagged ? nodeScreenPosition(view) : null }));
      },
    }) });
    requestAnimationFrame(animate);
  } catch (error) {
    console.error(error);
    $('#loading').hidden = false;
    $('#loading').textContent = 'The sphere could not load. Reload to try again.';
  }
}
init();
