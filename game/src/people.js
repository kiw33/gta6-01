// Solmar Heat — the people on the sidewalks: pedestrians who stroll, flee
// gunfire, and scatter from a speeding car, and the foot cops who chase
// Dante down when the heat is on.
import { GRID, PALETTE, PEDS, POLICE } from './config.js';
import { range, pick } from './random.js';
import { roadLines } from './city.js';

function makePersonMesh(color, kind = 'ped') {
  const person = new THREE.Group();
  person.name = `person-${kind}`;
  const shirt = new THREE.MeshLambertMaterial({ color });
  const skin = new THREE.MeshLambertMaterial({ color: 0xd9a986 });
  const pants = new THREE.MeshLambertMaterial({ color: 0x2c3e50 });

  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.75, 0.26), pants);
  legs.position.y = 0.38;
  person.add(legs);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.7, 0.32), shirt);
  torso.position.y = 1.1;
  torso.castShadow = true;
  person.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), skin);
  head.position.y = 1.68;
  head.castShadow = true;
  person.add(head);

  if (kind === 'cop') {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.1, 10),
      new THREE.MeshLambertMaterial({ color: 0x1a2a4a }));
    cap.position.y = 1.88;
    person.add(cap);
    const badge = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.02),
      new THREE.MeshLambertMaterial({ color: 0xffd700, emissive: 0x664400 }));
    badge.position.set(0.14, 1.25, 0.18);
    person.add(badge);
  }
  return person;
}

// Walk the sidewalk: pick a road line, walk along it, turn at the corners.
function sidewalkSpot(rng, lines) {
  const vertical = rng() < 0.5;
  const line = lines[Math.floor(rng() * lines.length)];
  const off = GRID.road / 2 + 2.5;
  const along = range(rng, -224, 224);
  if (vertical) return { x: line + (rng() < 0.5 ? off : -off), z: along };
  return { x: along, z: line + (rng() < 0.5 ? off : -off) };
}

export class PedestrianSystem {
  constructor(scene, rng) {
    this.scene = scene;
    this.rng = rng;
    this.lines = roadLines();
    this.peds = [];
    for (let i = 0; i < PEDS.count; i += 1) {
      const spot = sidewalkSpot(rng, this.lines);
      const mesh = makePersonMesh(pick(rng, PALETTE.peds));
      mesh.position.set(spot.x, 0, spot.z);
      scene.add(mesh);
      this.peds.push({
        mesh,
        x: spot.x,
        z: spot.z,
        heading: rng() * Math.PI * 2,
        speed: range(rng, PEDS.walkMin, PEDS.walkMax),
        state: 'walk',
        fleeX: 0,
        fleeZ: 0,
        fleeT: 0,
        bob: rng() * Math.PI * 2,
      });
    }
  }

  // A gunshot or a near-miss sends everyone nearby running.
  scare(x, z, radius = 26) {
    for (const p of this.peds) {
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < radius) {
        p.state = 'flee';
        p.fleeX = x;
        p.fleeZ = z;
        p.fleeT = 3 + this.rng() * 2;
      }
    }
  }

  update(dt, playerX, playerZ, playerSpeed) {
    for (const p of this.peds) {
      if (p.state === 'flee') {
        p.fleeT -= dt;
        const dx = p.x - p.fleeX;
        const dz = p.z - p.fleeZ;
        const d = Math.hypot(dx, dz) || 0.001;
        p.heading = Math.atan2(dx / d, dz / d);
        p.speed = PEDS.fleeSpeed;
        if (p.fleeT <= 0) {
          p.state = 'walk';
          p.speed = range(this.rng, PEDS.walkMin, PEDS.walkMax);
        }
      } else {
        // A fast car bearing down scatters the sidewalk too.
        const pd = Math.hypot(p.x - playerX, p.z - playerZ);
        if (pd < 7 && Math.abs(playerSpeed) > 14) {
          p.state = 'flee';
          p.fleeX = playerX;
          p.fleeZ = playerZ;
          p.fleeT = 2;
          continue;
        }
        // Amble: drift the heading, turn around at the city edge.
        p.heading += (this.rng() - 0.5) * 0.6 * dt;
        if (Math.abs(p.x) > 240 || Math.abs(p.z) > 240) p.heading += Math.PI;
      }
      p.x += Math.sin(p.heading) * p.speed * dt;
      p.z += Math.cos(p.heading) * p.speed * dt;
      p.x = Math.max(-246, Math.min(246, p.x));
      p.z = Math.max(-246, Math.min(246, p.z));
      p.bob += dt * p.speed * 4;
      p.mesh.position.set(p.x, Math.abs(Math.sin(p.bob)) * 0.06, p.z);
      p.mesh.rotation.y = p.heading;
    }
  }

  // The pedestrian nearest a point, for the pistol to hit.
  nearest(x, z, maxDist = 3) {
    let best = null;
    let bestD = maxDist;
    for (const p of this.peds) {
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }

  removePed(ped) {
    this.scene.remove(ped.mesh);
    this.peds = this.peds.filter((p) => p !== ped);
  }
}

// Foot cops: they walk a beat until the wanted level rises, then they run
// Dante down on foot. Close enough for long enough and you are BUSTED.
export class FootCopSystem {
  constructor(scene, rng) {
    this.scene = scene;
    this.rng = rng;
    this.cops = [];
    const beats = [
      { x: 0, z: 0 },
      { x: 56, z: -56 },
      { x: -56, z: 112 },
    ];
    for (const b of beats.slice(0, POLICE.footCops)) {
      const mesh = makePersonMesh(0x1a2a4a, 'cop');
      mesh.position.set(b.x, 0, b.z);
      scene.add(mesh);
      this.cops.push({
        mesh,
        x: b.x,
        z: b.z,
        homeX: b.x,
        homeZ: b.z,
        heading: rng() * Math.PI * 2,
        bustT: 0,
        stun: 0, // seconds left flat on the pavement after a pistol hit
      });
    }
  }

  update(dt, player, wanted) {
    for (const cop of this.cops) {
      if (cop.stun > 0) {
        // Flat on the pavement: down, then back on the beat.
        cop.stun -= dt;
        cop.bustT = 0;
        cop.mesh.position.set(cop.x, 0, cop.z);
        cop.mesh.rotation.x = cop.stun > 0.5 ? -Math.PI / 2 : 0;
        continue;
      }
      cop.mesh.rotation.x = 0;
      const dx = player.x - cop.x;
      const dz = player.z - cop.z;
      const dist = Math.hypot(dx, dz) || 0.001;
      if (wanted > 0 && !player.inCar) {
        // Chase on foot.
        cop.heading = Math.atan2(dx / dist, dz / dist);
        cop.x += Math.sin(cop.heading) * POLICE.footSpeed * dt;
        cop.z += Math.cos(cop.heading) * POLICE.footSpeed * dt;
        if (dist < POLICE.bustRadius) {
          cop.bustT += dt;
        } else {
          cop.bustT = Math.max(0, cop.bustT - dt);
        }
      } else {
        // Walk the beat home.
        cop.bustT = 0;
        const hx = cop.homeX - cop.x;
        const hz = cop.homeZ - cop.z;
        const hd = Math.hypot(hx, hz);
        if (hd > 4) {
          cop.heading = Math.atan2(hx / hd, hz / hd);
          cop.x += Math.sin(cop.heading) * 1.6 * dt;
          cop.z += Math.cos(cop.heading) * 1.6 * dt;
        } else {
          cop.heading += dt * 0.5;
        }
      }
      cop.mesh.position.set(cop.x, 0, cop.z);
      cop.mesh.rotation.y = cop.heading;
    }
  }

  // True when any cop has held Dante long enough to cuff him.
  anyBust() {
    return this.cops.some((c) => c.bustT >= POLICE.bustHold);
  }

  nearest(x, z, maxDist = 3) {
    let best = null;
    let bestD = maxDist;
    for (const c of this.cops) {
      const d = Math.hypot(c.x - x, c.z - z);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return best;
  }
}
