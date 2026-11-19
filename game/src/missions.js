// Solmar Heat — the story: six jobs from Marlow and Vex, in order, each
// with its own win condition. The runner owns the current job, its stages
// and its timers; the world owns the player, the marker and the money.
import { MISSIONS } from './config.js';

const PLAZA = { x: 28, z: 28 };
const PARK = { x: -84, z: 140 };
const TRUST = { x: -140, z: -140 };
const LIGHTHOUSE = { x: 196, z: 278 };
const BEACH = { x: 0, z: 270 };
const DOCKS = { x: -224, z: 224 };

function dist(ax, az, bx, bz) {
  return Math.hypot(ax - bx, az - bz);
}

// One mission definition: a briefing, a start hook and a per-frame check.
// update returns 'active', 'done' or 'failed'.
const DEFS = {
  borrowed: {
    brief: 'Marlow needs wheels. Steal any car — press E next to one.',
    start(run) {
      run.objective = 'Steal a car (press E near one)';
      run.marker = null;
    },
    update(run, ctx) {
      if (ctx.inCar) return 'done';
      return 'active';
    },
  },
  courier: {
    brief: 'Vex has three drops before sunset. Hit every checkpoint in time.',
    start(run) {
      run.stage = 0;
      run.timer = 75;
      run.points = [PLAZA, PARK, LIGHTHOUSE];
      run.objective = 'Reach checkpoint 1 of 3 (75s)';
      run.marker = run.points[0];
    },
    update(run, ctx, dt) {
      run.timer -= dt;
      if (run.timer <= 0) return 'failed';
      const target = run.points[run.stage];
      run.objective = `Reach checkpoint ${run.stage + 1} of 3 (${Math.ceil(run.timer)}s)`;
      run.marker = target;
      if (dist(ctx.x, ctx.z, target.x, target.z) < 9) {
        run.stage += 1;
        run.onBlip();
        if (run.stage >= run.points.length) return 'done';
        run.objective = `Reach checkpoint ${run.stage + 1} of 3 (${Math.ceil(run.timer)}s)`;
        run.marker = run.points[run.stage];
      }
      return 'active';
    },
  },
  hotwheels: {
    brief: 'Make some noise: get the heat to 3 stars, then lose it all.',
    start(run) {
      run.stage = 0;
      run.timer = 150;
      run.objective = 'Raise your wanted level to 3 stars';
      run.marker = null;
    },
    update(run, ctx, dt) {
      run.timer -= dt;
      if (run.timer <= 0) return 'failed';
      if (run.stage === 0) {
        run.objective = `Raise your wanted level to 3 stars (${ctx.wanted}/3)`;
        if (ctx.wanted >= 3) {
          run.stage = 1;
          run.onBlip();
          run.objective = 'Now lose the heat — get back to 0 stars';
        }
      } else if (ctx.wanted === 0) {
        return 'done';
      }
      return 'active';
    },
  },
  getaway: {
    brief: 'The crew is watching. Reach the Trust tower with the cops on you.',
    start(run) {
      run.timer = 90;
      run.objective = 'Reach the Solmar Trust tower with 2+ stars (90s)';
      run.marker = TRUST;
    },
    update(run, ctx, dt) {
      run.timer -= dt;
      if (run.timer <= 0) return 'failed';
      run.objective = `Reach the Trust tower with 2+ stars (${Math.ceil(run.timer)}s)`;
      if (dist(ctx.x, ctx.z, TRUST.x, TRUST.z) < 12) {
        if (ctx.wanted >= 2) return 'done';
        run.objective = 'Not hot enough — raise your wanted level first!';
      }
      return 'active';
    },
  },
  beach: {
    brief: 'A package is waiting on the sand. Grab it, bring it to the plaza.',
    start(run) {
      run.stage = 0;
      run.objective = 'Pick up the package on the beach';
      run.marker = BEACH;
    },
    update(run, ctx) {
      if (run.stage === 0) {
        if (dist(ctx.x, ctx.z, BEACH.x, BEACH.z) < 9) {
          run.stage = 1;
          run.onBlip();
          run.objective = 'Package grabbed — bring it to the plaza';
          run.marker = PLAZA;
        }
      } else if (dist(ctx.x, ctx.z, PLAZA.x, PLAZA.z) < 10) {
        return 'done';
      }
      return 'active';
    },
  },
  score: {
    brief: 'The Big Score. Hold the Trust tower for 12 seconds, then vanish.',
    start(run) {
      run.stage = 0;
      run.holdT = 0;
      run.objective = 'Get to the Solmar Trust tower';
      run.marker = TRUST;
    },
    update(run, ctx, dt) {
      if (run.stage === 0) {
        if (dist(ctx.x, ctx.z, TRUST.x, TRUST.z) < 12) {
          run.stage = 1;
          run.holdT = 12;
          run.onBlip();
        }
        return 'active';
      }
      if (run.stage === 1) {
        if (dist(ctx.x, ctx.z, TRUST.x, TRUST.z) > 14) {
          run.holdT = 12;
          run.objective = 'Hold the tower — stay inside the ring!';
        } else {
          run.holdT -= dt;
          run.objective = `Cracking the vault… ${Math.ceil(run.holdT)}s — stay close!`;
          if (run.holdT <= 0) {
            run.stage = 2;
            run.onBlip();
            run.objective = 'Vault open — escape to the lighthouse!';
            run.marker = LIGHTHOUSE;
          }
        }
        return 'active';
      }
      if (dist(ctx.x, ctx.z, LIGHTHOUSE.x, LIGHTHOUSE.z) < 12) return 'done';
      return 'active';
    },
  },
};

export class MissionRunner {
  constructor(hooks) {
    // hooks: { onMessage(text), onCash(amount), onBlip(), onStoryDone() }
    this.hooks = hooks;
    this.index = 0;
    this.done = false;
    this.def = null;
    this.objective = '';
    this.marker = null;
    this.stage = 0;
    this.timer = 0;
    this.failT = 0;
    this.failed = false;
    this.started = false;
  }

  get current() {
    return MISSIONS[this.index] || null;
  }

  get storyDone() {
    return this.index >= MISSIONS.length;
  }

  onBlip() {
    this.hooks.onBlip();
  }

  // Begin the current job (or re-begin it after a failure).
  startCurrent() {
    const mission = this.current;
    if (!mission) {
      this.done = true;
      this.objective = 'Story complete — Solmar is yours.';
      this.marker = null;
      return;
    }
    this.def = DEFS[mission.id];
    this.failed = false;
    this.failT = 0;
    this.started = true;
    this.def.start(this);
    this.hooks.onMessage(`${mission.giver}: ${mission.name} — ${this.def.brief}`);
  }

  // The world calls this every frame with the player's live state.
  update(dt, ctx) {
    if (!this.started || this.done || !this.def) return;
    if (this.failed) {
      this.failT -= dt;
      if (this.failT <= 0) this.startCurrent();
      return;
    }
    const result = this.def.update(this, ctx, dt);
    if (result === 'done') {
      const mission = this.current;
      this.hooks.onCash(mission.payout);
      this.hooks.onMessage(`Job done: ${mission.name} — +$${mission.payout}`);
      this.index += 1;
      if (this.storyDone) {
        this.done = true;
        this.objective = 'Story complete — Solmar is yours.';
        this.marker = null;
        this.hooks.onStoryDone();
      } else {
        this.startCurrent();
      }
    } else if (result === 'failed') {
      this.failed = true;
      this.failT = 2.5;
      this.objective = 'Mission failed — try again…';
      this.marker = null;
      this.hooks.onMessage(`Mission failed: ${this.current.name}. Run it back.`);
    }
  }

  // Jump straight to a job (the screenshot poses use this).
  jumpTo(index) {
    this.index = index;
    this.done = false;
    this.startCurrent();
  }

  reset() {
    this.index = 0;
    this.done = false;
    this.started = false;
    this.objective = '';
    this.marker = null;
  }
}

export { DOCKS, BEACH, TRUST, LIGHTHOUSE, PLAZA, PARK };
