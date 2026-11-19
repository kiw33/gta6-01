// Solmar Heat — everything on top of the 3D view: cash, wanted stars, the
// clock, the mission objective, health, speed, the message feed, the live
// minimap, and the title / pause / busted screens.
import { GRID } from './config.js';

const MAP_SIZE = 190;
const WORLD_R = 280; // world units shown across the minimap

function $(id) {
  return document.getElementById(id);
}

export class Hud {
  constructor() {
    this.minimap = $('minimap');
    this.mapCtx = this.minimap ? this.minimap.getContext('2d') : null;
    this.feedItems = [];
    this.clockMinutes = 17 * 60 + 30; // Golden hour: the game opens at 17:30.
  }

  _setText(id, text) {
    const el = $(id);
    if (el) el.textContent = text;
  }

  setCash(cash) {
    this._setText('cash', `$${cash.toLocaleString('en-US')}`);
  }

  setStars(wanted) {
    const el = $('stars');
    if (!el) return;
    let out = '';
    for (let i = 0; i < 5; i += 1) out += i < wanted ? '★' : '☆';
    el.textContent = out;
    el.className = wanted >= 3 ? 'stars hot' : 'stars';
  }

  setClock() {
    const h = Math.floor(this.clockMinutes / 60) % 24;
    const m = Math.floor(this.clockMinutes % 60);
    this._setText('clock', `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  }

  tickClock(dt) {
    // One game hour per two real minutes: the sun barely moves in a job.
    this.clockMinutes += dt * 0.5;
    this.setClock();
  }

  setObjective(text) {
    this._setText('objective', text);
  }

  setHealth(hp) {
    const fill = $('health-fill');
    if (fill) fill.style.width = `${Math.max(0, Math.min(100, hp))}%`;
    const label = $('health-num');
    if (label) label.textContent = `${Math.ceil(Math.max(0, hp))}`;
  }

  setSpeed(mph, inCar) {
    this._setText('speed', inCar ? `${Math.round(Math.abs(mph))} mph` : '');
    const unit = $('speed-unit');
    if (unit) unit.style.display = inCar ? 'block' : 'none';
  }

  setMuted(muted) {
    this._setText('mute-state', muted ? 'MUTED (M)' : 'SOUND ON (M)');
  }

  setCarName(name) {
    this._setText('car-name', name || '');
  }

  // A short line in the feed, bottom-left. Keeps the last four.
  pushMessage(text) {
    const feed = $('feed');
    if (!feed) return;
    const line = document.createElement('div');
    line.className = 'feed-line';
    line.textContent = text;
    feed.prepend(line);
    this.feedItems.unshift(line);
    while (this.feedItems.length > 4) {
      const old = this.feedItems.pop();
      if (old && old.parentNode) old.parentNode.removeChild(old);
    }
    window.setTimeout(() => {
      if (line.parentNode) line.classList.add('fade');
    }, 6000);
  }

  showTitle(hasSave, saveText) {
    const title = $('title');
    if (!title) return;
    title.classList.remove('hidden');
    const cont = $('btn-continue');
    if (cont) cont.style.display = hasSave ? 'block' : 'none';
    this._setText('title-save', hasSave ? saveText : '');
  }

  hideTitle() {
    const title = $('title');
    if (title) title.classList.add('hidden');
  }

  showPause() {
    const pause = $('pause');
    if (pause) pause.classList.remove('hidden');
  }

  hidePause() {
    const pause = $('pause');
    if (pause) pause.classList.add('hidden');
  }

  showEnd(kind, text) {
    const end = $('end');
    if (!end) return;
    this._setText('end-title', kind === 'busted' ? 'BUSTED' : 'WASTED');
    this._setText('end-text', text);
    end.classList.remove('hidden');
  }

  hideEnd() {
    const end = $('end');
    if (end) end.classList.add('hidden');
  }

  showHud(show) {
    const hud = $('hud');
    if (hud) hud.classList.toggle('hidden', !show);
  }

  // The minimap: roads, the sea, the player arrow, traffic, police and the
  // mission blip — the whole city at a glance.
  drawMinimap(state) {
    const ctx = this.mapCtx;
    if (!ctx) return;
    const S = MAP_SIZE;
    const toMap = (x, z) => [S / 2 + (x / WORLD_R) * (S / 2), S / 2 + (z / WORLD_R) * (S / 2)];
    ctx.clearRect(0, 0, S, S);
    // Round frame.
    ctx.save();
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, S / 2 - 1, 0, Math.PI * 2);
    ctx.clip();
    // Land.
    ctx.fillStyle = '#5a6b4a';
    ctx.fillRect(0, 0, S, S);
    // Sea along the bottom edge.
    const [, seaY] = toMap(0, 252);
    ctx.fillStyle = '#2e7fa8';
    ctx.fillRect(0, seaY, S, S - seaY);
    ctx.fillStyle = '#e8d29a';
    ctx.fillRect(0, seaY - 4, S, 4);
    // Roads.
    ctx.strokeStyle = '#3a3f46';
    ctx.lineWidth = 4;
    for (let i = 0; i < GRID.blocks; i += 1) {
      const c = (i - 4) * GRID.pitch;
      const [x1] = toMap(c, 0);
      ctx.beginPath();
      ctx.moveTo(x1, 0);
      ctx.lineTo(x1, S);
      ctx.stroke();
      const [, z1] = toMap(0, c);
      ctx.beginPath();
      ctx.moveTo(0, z1);
      ctx.lineTo(S, z1);
      ctx.stroke();
    }
    // Mission blip: a pulsing yellow diamond.
    if (state.marker) {
      const [mx, my] = toMap(state.marker.x, state.marker.z);
      const pulse = 5 + Math.sin(performance.now() / 180) * 2;
      ctx.fillStyle = '#ffd700';
      ctx.beginPath();
      ctx.moveTo(mx, my - pulse);
      ctx.lineTo(mx + pulse, my);
      ctx.lineTo(mx, my + pulse);
      ctx.lineTo(mx - pulse, my);
      ctx.closePath();
      ctx.fill();
    }
    // Traffic: pale dots. Police: red dots.
    for (const t of state.traffic) {
      const [tx, ty] = toMap(t.x, t.z);
      ctx.fillStyle = '#e8e8e8';
      ctx.fillRect(tx - 1.5, ty - 1.5, 3, 3);
    }
    for (const p of state.police) {
      const [px, py] = toMap(p.x, p.z);
      ctx.fillStyle = '#ff3333';
      ctx.beginPath();
      ctx.arc(px, py, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // Player: a white arrow pointing where Dante faces.
    const [px, py] = toMap(state.player.x, state.player.z);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(state.player.heading);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4.5, 5);
    ctx.lineTo(0, 2.5);
    ctx.lineTo(-4.5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.restore();
    // Rim.
    ctx.strokeStyle = 'rgba(255,255,255,0.65)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, S / 2 - 1, 0, Math.PI * 2);
    ctx.stroke();
  }
}
