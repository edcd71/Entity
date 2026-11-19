import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';

const $ = selector => document.querySelector(selector);
const mediaURL = path => '/' + path.split('/').map(encodeURIComponent).join('/');
const stage = $('#stage');
const dialog = $('#viewer');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const faceRotations = [
  [0, Math.PI / 2, 0], [0, -Math.PI / 2, 0],
  [-Math.PI / 2, 0, 0], [Math.PI / 2, 0, 0],
  [0, 0, 0], [0, Math.PI, 0],
];
let renderer, camera, controls, scene, index, allItems;
let selected = -1, interacted = false, ready = false;
let lastTime = 0, lastDetailUpdate = 0, pointers = new Map(), multiTouch = false;
const surfaces = [], details = new Map();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const loader = new THREE.TextureLoader();
const cursor = new THREE.Vector3();
const viewport = new THREE.Vector3();
let tileGeometry;
const maxDetails = innerWidth < 700 ? 12 : 24;

function announce(message) { $('#announcement').textContent = message; }
function stopRotation() {
  interacted = true;
  controls.autoRotate = false;
  document.body.classList.add('interacted');
}
function resize() {
  const priorView = camera.view?.enabled ? { x: camera.view.offsetX / camera.view.fullWidth, y: camera.view.offsetY / camera.view.fullHeight } : null;
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  if (ready && !interacted) overview();
  else if (ready && priorView) camera.setViewOffset(innerWidth, innerHeight, priorView.x * innerWidth, priorView.y * innerHeight, innerWidth, innerHeight);
}
function overview() {
  controls.target.set(0, 0, 0);
  // Fit the cube to the narrower viewport dimension.
  const distance = Math.max(7.3, 7.3 / Math.min(1, camera.aspect));
  camera.position.copy(new THREE.Vector3(1.2, .66, 1.8).normalize().multiplyScalar(distance));
  camera.lookAt(0, 0, 0);
  controls.update();
  centerOverview();
}
function centerOverview() {
  camera.clearViewOffset(); camera.updateMatrixWorld();
  const corners = [];
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) corners.push(new THREE.Vector3(x, y, z).project(camera));
  const midX = (Math.min(...corners.map(p => p.x)) + Math.max(...corners.map(p => p.x))) / 2;
  const midY = (Math.min(...corners.map(p => p.y)) + Math.max(...corners.map(p => p.y))) / 2;
  camera.setViewOffset(innerWidth, innerHeight, midX * innerWidth / 2, -midY * innerHeight / 2, innerWidth, innerHeight);
}
function constrainCamera() {
  // Prevent zoom/pan from moving the camera inside the cube.
  const p = camera.position;
  if (Math.abs(p.x) < 1.055 && Math.abs(p.y) < 1.055 && Math.abs(p.z) < 1.055) {
    const axis = ['x', 'y', 'z'].sort((a, b) => Math.abs(p[b]) - Math.abs(p[a]))[0];
    p[axis] = (Math.sign(p[axis]) || 1) * 1.055;
    camera.lookAt(controls.target);
  }
}
function tileAt(clientX, clientY) {
  pointer.set(clientX / innerWidth * 2 - 1, -(clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(surfaces, false)[0];
  if (!hit) return null;
  const face = hit.object.userData.face;
  const column = Math.min(index.columns - 1, Math.max(0, Math.floor(hit.uv.x * index.columns)));
  const row = Math.min(index.rows - 1, Math.max(0, Math.floor((1 - hit.uv.y) * index.rows)));
  const item = index.faces[face].items[row * index.columns + column];
  return item ? { item, face, column, row, point: hit.point } : null;
}
function positionTile(object, face, column, row, offset = 1.003) {
  object.quaternion.copy(surfaces[face].quaternion);
  object.position.set((column + .5) / index.columns * 2 - 1, 1 - (row + .5) / index.rows * 2, offset);
  object.position.applyQuaternion(object.quaternion);
}
function hover(x, y) {
  if (!ready || pointers.size || dialog.open) return;
  const tile = tileAt(x, y);
  renderer.domElement.classList.toggle('over-media', Boolean(tile));
}
function zoom(factor) {
  stopRotation();
  const offset = camera.position.clone().sub(controls.target).multiplyScalar(factor);
  offset.setLength(THREE.MathUtils.clamp(offset.length(), controls.minDistance, controls.maxDistance));
  camera.position.copy(controls.target).add(offset);
  constrainCamera();
  controls.update();
}

// Higher-resolution tiles replace overview pixels only when large enough on screen.
// Keep a small bounded cache and at most four in-flight requests.
let pendingDetails = 0;
function updateDetails() {
  if (!ready) return;
  camera.updateMatrixWorld();
  const candidates = [];
  const focal = innerHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
  for (let f = 0; f < surfaces.length; f++) {
    const surface = surfaces[f];
    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(surface.quaternion);
    if (normal.dot(camera.position.clone().sub(surface.position)) <= 0) continue;
    for (let n = 0; n < index.faces[f].items.length; n++) {
      const column = n % index.columns, row = Math.floor(n / index.columns);
      cursor.set((column + .5) / index.columns * 2 - 1, 1 - (row + .5) / index.rows * 2, 1.003).applyQuaternion(surface.quaternion);
      viewport.copy(cursor).applyMatrix4(camera.matrixWorldInverse);
      const pixels = (2 / index.columns) * focal / -viewport.z;
      if (pixels < 65) continue;
      viewport.copy(cursor).project(camera);
      if (Math.abs(viewport.x) > 1.25 || Math.abs(viewport.y) > 1.25 || viewport.z > 1 || viewport.z < -1) continue;
      candidates.push({ face: f, column, row, item: index.faces[f].items[n], priority: viewport.x ** 2 + viewport.y ** 2 });
    }
  }
  const visible = candidates.sort((a, b) => a.priority - b.priority).slice(0, maxDetails);
  const wanted = new Set(visible.map(tile => tile.item.id));
  for (const [id, detail] of details) {
    if (!wanted.has(id)) {
      detail.cancelled = true;
      if (detail.mesh) { scene.remove(detail.mesh); detail.mesh.material.map.dispose(); detail.mesh.material.dispose(); }
      details.delete(id);
    }
  }
  for (const tile of visible) {
    if (details.has(tile.item.id) || pendingDetails >= 4) continue;
    const detail = { cancelled: false, mesh: null };
    details.set(tile.item.id, detail);
    pendingDetails++;
    loader.load(mediaURL(tile.item.preview), texture => {
      pendingDetails--;
      if (detail.cancelled) { texture.dispose(); return; }
      texture.colorSpace = THREE.SRGBColorSpace;
      const aspect = texture.image.width / texture.image.height;
      if (aspect > 1) { texture.repeat.x = 1 / aspect; texture.offset.x = (1 - texture.repeat.x) / 2; }
      else { texture.repeat.y = aspect; texture.offset.y = (1 - aspect) / 2; }
      texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
      const mesh = new THREE.Mesh(tileGeometry, new THREE.MeshBasicMaterial({ map: texture }));
      positionTile(mesh, tile.face, tile.column, tile.row);
      detail.mesh = mesh;
      scene.add(mesh);
    }, undefined, () => { pendingDetails--; if (details.get(tile.item.id) === detail) details.delete(tile.item.id); });
  }
}

function clearMedia() {
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
  dialog.focus({ preventScroll: true });
  announce(item.name);
  if (item.type === 'video') element.play().catch(() => {});
}
function stepMedia(delta) { const item = allItems[selected + delta]; if (item) openMedia(item); }
function closeMedia() { clearMedia(); dialog.close(); }
dialog.addEventListener('click', closeMedia);
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
    if (event.key === 'Enter') { const tile = tileAt(innerWidth / 2, innerHeight / 2); if (tile) openMedia(tile.item); return; }
    if (event.key.startsWith('Arrow')) {
      const offset = camera.position.clone().sub(controls.target);
      const axis = event.key === 'ArrowLeft' || event.key === 'ArrowRight' ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
      offset.applyAxisAngle(axis, ['ArrowLeft', 'ArrowUp'].includes(event.key) ? .085 : -.085);
      camera.position.copy(controls.target).add(offset); controls.update(); constrainCamera();
      const tile = tileAt(innerWidth / 2, innerHeight / 2); if (tile) announce(tile.item.name);
    }
  });
  dialog.addEventListener('keydown', event => {
    if (event.key === ' ') {
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
  constrainCamera();
  if (time - lastDetailUpdate > 180) { updateDetails(); lastDetailUpdate = time; }
  renderer.render(scene, camera);
}
async function init() {
  try {
    const response = await fetch('/media/cube/index.json');
    if (!response.ok) throw Error('The cube index is unavailable.');
    index = await response.json(); allItems = index.faces.flatMap(face => face.items);
    scene = new THREE.Scene(); scene.background = new THREE.Color(0x000000);
    camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, .006, 100);
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.id = 'cube'; renderer.domElement.tabIndex = 0;
    renderer.domElement.setAttribute('role', 'application');
    renderer.domElement.setAttribute('aria-label', `${index.total} images and videos on a 3D cube. Drag or use arrow keys to rotate. Scroll, pinch, or use plus and minus to zoom. Select a tile, or press Enter for the center tile. Home resets the view.`);
    stage.append(renderer.domElement);
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = .09;
    controls.rotateSpeed = .55; controls.zoomSpeed = .7;
    controls.enablePan = true; controls.panSpeed = .5;
    controls.minDistance = .2; controls.maxDistance = 22;
    controls.maxTargetRadius = .85;
    controls.autoRotate = !reducedMotion; controls.autoRotateSpeed = .14;
    controls.addEventListener('start', stopRotation);
    resize(); overview();
    const textures = await Promise.all(index.faces.map(face => loader.loadAsync(mediaURL(face.atlas))));
    const geometry = new THREE.PlaneGeometry(2, 2);
    textures.forEach((texture, face) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: texture }));
      mesh.rotation.set(...faceRotations[face]);
      mesh.position.set(0, 0, 1).applyQuaternion(mesh.quaternion);
      mesh.userData.face = face; surfaces.push(mesh); scene.add(mesh);
    });
    const innerFraction = 1 - index.gapPixels * 2 / index.cellPixels;
    tileGeometry = new THREE.PlaneGeometry(2 / index.columns * innerFraction, 2 / index.rows * innerFraction);
    bindInteraction();
    window.addEventListener('resize', resize);
    renderer.domElement.addEventListener('webglcontextlost', event => { event.preventDefault(); ready = false; $('#loading').hidden = false; $('#loading').textContent = 'Graphics paused. Reload to restore the cube.'; });
    ready = true; $('#loading').hidden = true; announce(`${index.total} media files loaded.`);
    // Read-only runtime diagnostics for validation; no UI controls are exposed here.
    Object.defineProperty(window, 'entityCube', { value: Object.freeze({
      get total() { return allItems.length; },
      get rotating() { return controls.autoRotate; },
      get camera() { return camera.position.toArray(); },
      get detailTiles() { return [...details.values()].filter(detail => detail.mesh).length; },
      get selected() { return selected >= 0 ? allItems[selected].id : null; },
    }) });
    requestAnimationFrame(animate);
  } catch (error) {
    console.error(error);
    $('#loading').hidden = false;
    $('#loading').textContent = 'The cube could not load. Reload to try again.';
  }
}
init();
