import * as THREE from './vendor/three.module.js';
import {followPointer, hoverPose} from './hover-motion.js';

export function createGridHover(grid, getPhotos, unavailable) {
  const renderer = new THREE.WebGLRenderer({alpha: true, antialias: true, powerPreference: 'low-power'});
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  const canvas = renderer.domElement;
  canvas.className = 'grid-hover';
  canvas.hidden = true;
  canvas.setAttribute('aria-hidden', 'true');
  document.body.append(canvas);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 1, 10000);
  const plane = new THREE.PlaneGeometry(1, 1);
  const slab = new THREE.BoxGeometry(1, 1, 1);
  // The photograph is the front face. Omit the slab's duplicate front surface
  // so the two cannot fight for the same depth-buffer pixels.
  const front = slab.groups.find(group => group.materialIndex === 4);
  const indices = [...slab.index.array];
  slab.setIndex([...indices.slice(0, front.start), ...indices.slice(front.start + front.count)]);
  slab.clearGroups();
  const edgeMaterial = new THREE.MeshStandardMaterial({roughness: .68, metalness: .06});
  scene.add(new THREE.AmbientLight(0xdce5ff, 1.7));
  const key = new THREE.DirectionalLight(0xffffff, 2.8);
  key.position.set(-300, 400, 500);
  const fill = new THREE.DirectionalLight(0x99baff, .7);
  fill.position.set(400, -100, 250);
  scene.add(key, fill);
  const entries = new Map();
  const pointer = new THREE.Vector3(), target = new THREE.Vector3();
  let viewport, sizeKey, frame = 0, lastFrame = 0, disposed = false;

  function requestRender() {
    if (!frame && !disposed && !document.hidden && entries.size) frame = requestAnimationFrame(render);
  }
  function measure() {
    viewport = grid.getBoundingClientRect();
    const ratio = Math.min(devicePixelRatio || 1, 2);
    const size = [viewport.width, viewport.height, ratio].join(':');
    if (size !== sizeKey) {
      sizeKey = size;
      renderer.setPixelRatio(ratio);
      renderer.setSize(viewport.width, viewport.height);
      camera.aspect = viewport.width / viewport.height;
      camera.position.z = viewport.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
      camera.near = Math.max(1, camera.position.z - 200);
      camera.far = camera.position.z + 200;
      camera.updateProjectionMatrix();
    }
    canvas.style.left = viewport.left + 'px';
    canvas.style.top = viewport.top + 'px';
    canvas.style.clipPath = 'inset(0)';
  }
  function add(button, bounds) {
    const image = button.firstElementChild;
    const pixelArt = image.dataset.pixelArt === 'true';
    const cropped = image.dataset.gridEffect === 'true';
    const texture = new THREE.Texture(image);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = pixelArt ? THREE.NearestFilter : THREE.LinearFilter;
    texture.magFilter = pixelArt ? THREE.NearestFilter : THREE.LinearFilter;
    texture.generateMipmaps = false;
    texture.anisotropy = pixelArt ? 1 : Math.min(4, renderer.capabilities.getMaxAnisotropy());
    // Match the existing centered object-fit: cover crop exactly.
    const sourceAspect = image.naturalWidth / image.naturalHeight;
    const tileAspect = bounds.width / bounds.height;
    if (!cropped && sourceAspect > tileAspect) {
      texture.repeat.x = tileAspect / sourceAspect;
      texture.offset.x = (1 - texture.repeat.x) / 2;
    } else if (!cropped) {
      texture.repeat.y = sourceAspect / tileAspect;
      texture.offset.y = (1 - texture.repeat.y) / 2;
    }
    texture.needsUpdate = true;
    const sheen = {value: 0};
    // Keep photo colors in sRGB, with only a very light highlight during hover.
    const material = new THREE.MeshBasicMaterial({map: texture, toneMapped: false});
    material.onBeforeCompile = shader => {
      shader.uniforms.hoverSheen = sheen;
      shader.fragmentShader = 'uniform float hoverSheen;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
        outgoingLight = mix(outgoingLight, vec3(1.), hoverSheen);
        #include <opaque_fragment>
      `);
    };
    const group = new THREE.Group();
    group.rotation.order = 'YXZ';
    const depth = Math.max(1.2, Math.min(bounds.width, bounds.height) * .018);
    const edge = new THREE.Mesh(slab, edgeMaterial);
    edge.scale.set(bounds.width, bounds.height, depth);
    edge.position.z = -depth / 2;
    const face = new THREE.Mesh(plane, material);
    face.scale.set(bounds.width, bounds.height, 1);
    group.add(edge, face);
    scene.add(group);
    const entry = {button, bounds, group, texture, material, sheen, wanted: true};
    entries.set(button, entry);
    return entry;
  }
  function remove(entry) {
    entry.button.classList.remove('three-hover');
    scene.remove(entry.group);
    entry.texture.dispose();
    entry.material.dispose();
    entries.delete(entry.button);
  }
  function move(point) {
    if (disposed) return;
    try {
      measure();
      const photos = getPhotos();
      const index = photos.findIndex(photo => photo.button === point.button);
      if (index < 0) { reset(); return; }
      const rows = Number(getComputedStyle(grid).getPropertyValue('--rows'));
      const column = Math.floor(index / rows), row = index % rows;
      for (const entry of entries.values()) entry.wanted = false;
      for (let c = Math.max(0, column - 1); c <= column + 1; c++) {
        for (let r = Math.max(0, row - 1); r <= Math.min(rows - 1, row + 1); r++) {
          const button = photos[c * rows + r]?.button;
          if (!button) continue;
          const image = button.firstElementChild;
          const bounds = button.getBoundingClientRect();
          if (bounds.right <= viewport.left || bounds.left >= viewport.right || !image.complete || !image.naturalWidth || image.getAnimations().length) continue;
          const entry = entries.get(button) || add(button, bounds);
          entry.bounds = bounds;
          entry.wanted = true;
        }
      }
      // Bound GPU resources even when the pointer rapidly crosses many columns.
      for (const entry of entries.values()) {
        if (entries.size <= 24) break;
        if (!entry.wanted) remove(entry);
      }
      if (!entries.size) return;
      if (!pointer.z) pointer.set(point.x, point.y, 0);
      target.set(point.x, point.y, 1);
      requestRender();
    } catch { fail(); }
  }
  function render(now) {
    frame = 0;
    try {
      const delta = lastFrame ? Math.min(50, now - lastFrame) : 16;
      lastFrame = now;
      pointer.lerp(target, followPointer(delta));
      const moving = pointer.distanceTo(target) > .001;
      if (!moving) pointer.copy(target);
      if (!target.z && pointer.z < .001) { reset(); return; }
      for (const entry of entries.values()) {
        if (!entry.button.isConnected) { remove(entry); continue; }
        const {bounds, group} = entry;
        const cx = bounds.left + bounds.width / 2, cy = bounds.top + bounds.height / 2;
        const size = Math.max(bounds.width, bounds.height) * 1.15;
        const pose = hoverPose(pointer.x - cx, cy - pointer.y, size, pointer.z);
        if (!entry.wanted && pose.influence < .002) { remove(entry); continue; }
        group.rotation.set(pose.x, pose.y, 0, 'YXZ');
        group.position.set(cx - viewport.left - viewport.width / 2, viewport.height / 2 - cy + viewport.top, pose.influence * size * .035);
        entry.sheen.value = pose.influence * .012;
      }
      // Only conceal source images after their textured replacements have drawn.
      renderer.render(scene, camera);
      for (const entry of entries.values()) entry.button.classList.add('three-hover');
      canvas.hidden = false;
      canvas.dataset.phase = moving ? 'moving' : 'settled';
      if (moving) requestRender();
    } catch { fail(); }
  }
  function leave() { target.z = 0; requestRender(); }
  function reset() {
    cancelAnimationFrame(frame);
    frame = 0;
    lastFrame = 0;
    pointer.set(0, 0, 0);
    target.set(0, 0, 0);
    for (const entry of entries.values()) remove(entry);
    canvas.hidden = true;
    canvas.dataset.phase = 'idle';
  }
  function theme() {
    edgeMaterial.color.set(document.documentElement.dataset.theme === 'light' ? '#d2d0c9' : '#26282f');
    requestRender();
  }
  function fail() { dispose(); unavailable(); }
  function contextLost(event) { event.preventDefault(); fail(); }
  function dispose() {
    if (disposed) return;
    disposed = true;
    reset();
    document.removeEventListener('entitythemechange', theme);
    canvas.removeEventListener('webglcontextlost', contextLost);
    plane.dispose();
    slab.dispose();
    edgeMaterial.dispose();
    renderer.dispose();
    canvas.remove();
  }
  document.addEventListener('entitythemechange', theme);
  canvas.addEventListener('webglcontextlost', contextLost);
  theme();
  return {move, leave, reset, dispose};
}
