import * as THREE from './vendor/three.module.js';
import {buildTitleGlyphs} from './title-glyphs.js';
import {HOVER_FALLOFF, HOVER_TILT, followPointer} from './hover-motion.js';

export function mountThreeTitle(title, {word, ink, fallback}) {
  const renderer = new THREE.WebGLRenderer({alpha: true, antialias: true, powerPreference: 'low-power'});
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const canvas = renderer.domElement;
  canvas.className = 'title-tiles title-webgl';
  canvas.setAttribute('aria-hidden', 'true');
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 1, 2000);
  scene.add(new THREE.AmbientLight(0xdce5ff, 1.7));
  const key = new THREE.DirectionalLight(0xffffff, 2.8);
  key.position.set(-300, 400, 500);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x99baff, .7);
  fill.position.set(400, -100, 250);
  scene.add(fill);
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  // An explicit title setting takes precedence over the system preference.
  const reducedMotion = () => title.dataset.motion !== 'full' && motion.matches;
  const pointer = new THREE.Vector3(), target = new THREE.Vector3();
  const uniforms = {
    titleTime: {value: 0}, titleSize: {value: 200},
    titlePointer: {value: pointer}, titleReduced: {value: reducedMotion() ? 1 : 0},
  };
  const material = new THREE.MeshStandardMaterial({color: ink, roughness: .68, metalness: .06});
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = `
      uniform float titleTime;
      uniform float titleSize;
      uniform float titleReduced;
      uniform vec3 titlePointer;
      attribute vec3 tileCenter;
      attribute float tileDelay;
      varying float tileVisible;
      mat3 titleRotate(float x, float y) {
        float cx = cos(x), sx = sin(x), cy = cos(y), sy = sin(y);
        return mat3(cy, 0., -sy, sy*sx, cx, cy*sx, sy*cx, -sx, cy*cx);
      }
    ` + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <beginnormal_vertex>', `
      float progress = clamp((titleTime - tileDelay) / 460., 0., 1.);
      float eased = 1. - pow(1. - progress, 3.);
      if (titleReduced > .5) eased = step(tileDelay + 50., titleTime);
      tileVisible = eased;
      vec2 offset = (titlePointer.xy - tileCenter.xy) / titleSize;
      float influence = exp(-dot(offset, offset) * ${HOVER_FALLOFF.toFixed(1)}) * titlePointer.z;
      float tiltX = clamp(-offset.y, -.65, .65) * influence * ${HOVER_TILT.toFixed(2)};
      float tiltY = clamp(offset.x, -.65, .65) * influence * ${HOVER_TILT.toFixed(2)};
      mat3 tileRotation = titleRotate(tiltX + (1.-eased)*.14, tiltY + (1.-eased)*1.48);
      #include <beginnormal_vertex>
      objectNormal = tileRotation * objectNormal;
    `).replace('#include <begin_vertex>', `
      vec3 transformed = tileRotation * position + tileCenter;
      transformed.z += (1.-eased)*titleSize*.12 + influence*titleSize*.025;
    `);
    shader.fragmentShader = 'varying float tileVisible;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('vec4 diffuseColor = vec4( diffuse, opacity );', `
      if (tileVisible < .001) discard;
      vec4 diffuseColor = vec4( diffuse, opacity );
    `);
  };
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
  mesh.frustumCulled = false;
  scene.add(mesh);
  let frame = 0, disposed = false, visible = true, previousSize;
  let elapsed = 0, lastFrame = 0, duration = 0, lastDelay = 0;

  function requestRender() {
    if (!frame && !disposed && visible && !document.hidden) frame = requestAnimationFrame(render);
  }
  function render(now) {
    frame = 0;
    const delta = lastFrame ? Math.min(50, now - lastFrame) : 16;
    lastFrame = now;
    elapsed = Math.min(duration, elapsed + delta);
    uniforms.titleTime.value = elapsed;
    pointer.lerp(target, followPointer(delta));
    const moving = pointer.distanceTo(target) > .001;
    if (!moving) pointer.copy(target);
    renderer.render(scene, camera);
    const phase = elapsed < duration ? 'assembling' : moving || pointer.z ? 'interactive' : 'settled';
    if (canvas.dataset.phase !== phase) canvas.dataset.phase = phase;
    if (elapsed < duration || moving) requestRender();
  }
  function build() {
    const rect = title.getBoundingClientRect();
    const ratio = Math.min(devicePixelRatio || 1, 2);
    const size = [rect.width, rect.height, ratio, getComputedStyle(title).fontSize].join(':');
    if (size === previousSize || !rect.width || !rect.height) return;
    const glyphs = buildTitleGlyphs(title, word);
    mesh.geometry.dispose();
    mesh.geometry = glyphs.geometry;
    uniforms.titleSize.value = glyphs.fontSize;
    lastDelay = glyphs.lastDelay;
    duration = lastDelay + (reducedMotion() ? 50 : 460);
    if (previousSize) elapsed = duration;
    previousSize = size;
    pointer.set(0, 0, 0);
    target.set(0, 0, 0);
    Object.assign(canvas.style, {left: -glyphs.padding + 'px', top: -glyphs.padding + 'px'});
    renderer.setPixelRatio(ratio);
    renderer.setSize(glyphs.width, glyphs.height);
    camera.aspect = glyphs.width / glyphs.height;
    camera.position.z = glyphs.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    camera.updateProjectionMatrix();
    requestRender();
  }
  function move(event) {
    if (reducedMotion() || event.pointerType === 'touch') return;
    const rect = canvas.getBoundingClientRect();
    target.set(event.clientX - rect.left - rect.width / 2, rect.height / 2 - event.clientY + rect.top, 1);
    requestRender();
  }
  function leave() { target.z = 0; requestRender(); }
  function changeTheme() {
    material.color.set(getComputedStyle(title.closest('.lead-card')).color);
    requestRender();
  }
  function changeMotion() {
    const settled = elapsed >= duration;
    duration = lastDelay + (reducedMotion() ? 50 : 460);
    if (settled) elapsed = duration;
    uniforms.titleReduced.value = reducedMotion() ? 1 : 0;
    pointer.z = target.z = 0;
    requestRender();
  }
  function visibility() {
    lastFrame = 0;
    if (document.hidden) { cancelAnimationFrame(frame); frame = 0; }
    else requestRender();
  }
  function pageHide(event) {
    if (!event.persisted) dispose();
    else { cancelAnimationFrame(frame); frame = 0; }
  }
  function loseContext(event) {
    event.preventDefault();
    dispose();
    fallback();
  }
  const resize = new ResizeObserver(() => {
    try { build(); } catch { dispose(); fallback(); }
  });
  const intersection = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    lastFrame = 0;
    if (visible) requestRender();
    else { cancelAnimationFrame(frame); frame = 0; target.z = 0; }
  });
  function dispose() {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(frame);
    resize.disconnect();
    intersection.disconnect();
    title.removeEventListener('pointermove', move);
    title.removeEventListener('pointerleave', leave);
    window.removeEventListener('blur', leave);
    window.removeEventListener('pagehide', pageHide);
    window.removeEventListener('pageshow', visibility);
    document.removeEventListener('visibilitychange', visibility);
    document.removeEventListener('entitythemechange', changeTheme);
    motion.removeEventListener('change', changeMotion);
    canvas.removeEventListener('webglcontextlost', loseContext);
    mesh.geometry.dispose();
    material.dispose();
    renderer.dispose();
    canvas.remove();
  }
  try {
    build();
    title.append(canvas);
    title.classList.add('tiled-title');
    title.classList.remove('title-pending');
    resize.observe(title);
    intersection.observe(title);
    title.addEventListener('pointermove', move);
    title.addEventListener('pointerleave', leave);
    window.addEventListener('blur', leave);
    window.addEventListener('pagehide', pageHide);
    window.addEventListener('pageshow', visibility);
    document.addEventListener('visibilitychange', visibility);
    document.addEventListener('entitythemechange', changeTheme);
    motion.addEventListener('change', changeMotion);
    canvas.addEventListener('webglcontextlost', loseContext);
    return dispose;
  } catch (error) {
    dispose();
    throw error;
  }
}
