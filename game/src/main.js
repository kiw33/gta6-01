// Solmar Heat — boot. One canvas, one World, one animation loop.
// ?seed=N re-seeds the city; ?shot=name poses a screenshot and freezes.
import { World } from './world.js';
import { setupShot } from './shots.js';

const params = new URLSearchParams(window.location.search);
const seed = Number.parseInt(params.get('seed') || '1', 10) || 1;
const shot = params.get('shot');
// ?manual=1: the rAF loop idles and the caller drives the world with
// window.__stepShot(frames) — headless SwiftShader only produces ~1 frame
// a second on its own clock, so screenshot captures step it directly.
// The frames are the same update() calls, same dt, same game.
const manual = params.get('manual') === '1';

const canvas = document.getElementById('game');
const world = new World(canvas, { seed, shot });
window.__solmar = world;

const shotState = shot ? setupShot(world, shot) : null;
window.__shotKeys = shotState ? shotState.keys : [];
window.__shotFrames = shotState ? shotState.frames : 0;
window.__stepShot = (frames) => {
  const keys = window.__shotKeys;
  for (const key of keys) world.keys.add(key);
  for (let i = 0; i < frames; i += 1) world.update(1 / 60);
  for (const key of keys) world.keys.delete(key);
  window.__shotReady = true;
};
let last = performance.now();
let frames = 0;
let frozen = false;

function loop(now) {
  if (frozen) return;
  if (manual) {
    // Idle: the capture script steps the world itself.
    window.requestAnimationFrame(loop);
    return;
  }
  const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
  last = now;
  if (shotState) {
    for (const key of shotState.keys) world.keys.add(key);
    world.update(dt);
    frames += 1;
    if (frames >= shotState.frames) {
      for (const key of shotState.keys) world.keys.delete(key);
      window.__shotReady = true;
      frozen = true;
      return;
    }
  } else {
    world.update(dt);
  }
  window.requestAnimationFrame(loop);
}

window.requestAnimationFrame(loop);
