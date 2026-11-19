// Solmar Heat — every car in Solmar: the traffic that cruises the grid,
// the parked cars waiting to be stolen, the police Interceptors, and the
// driving physics the player feels.
import { GRID, PALETTE, PLAYER, TRAFFIC, POLICE } from './config.js';
import { range, int, pick } from './random.js';
import { roadLines, isRoad } from './city.js';

// A car is a low body, a cabin, four wheels and headlights. One builder for
// traffic, parked cars, police and the player's ride — only the paint and
// the light bar change. Parts sharing a material are merged into one mesh
// each, so a car is five draws instead of a dozen (SwiftShader is slow).
function mergedMesh(parts, material) {
  const geos = parts.map(([geo, x, y, z, ry = 0]) => {
    const g = geo.clone();
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry);
    m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(1, 1, 1));
    g.applyMatrix4(m);
    return g;
  });
  const mesh = new THREE.Mesh(THREE.BufferGeometryUtils.mergeGeometries(geos, false), material);
  mesh.castShadow = true;
  for (const g of geos) g.dispose();
  return mesh;
}

export function makeCarMesh(color, kind = 'sedan') {
  const car = new THREE.Group();
  car.name = `car-${kind}`;
  const paint = new THREE.MeshLambertMaterial({ color });
  const glass = new THREE.MeshLambertMaterial({ color: 0x1a2836 });
  const tyre = new THREE.MeshLambertMaterial({ color: 0x141414 });

  car.add(mergedMesh([
    [new THREE.BoxGeometry(2.1, 0.62, 4.4), 0, 0.62, 0],
    [new THREE.BoxGeometry(2.0, 0.3, 0.5), 0, 0.55, 2.25],
  ], paint));
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.58, 2.1), glass);
  cabin.position.set(0, 1.2, -0.25);
  cabin.castShadow = true;
  car.add(cabin);

  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10);
  wheelGeo.rotateZ(Math.PI / 2);
  car.add(mergedMesh([
    [wheelGeo, -1.0, 0.38, 1.45],
    [wheelGeo, 1.0, 0.38, 1.45],
    [wheelGeo, -1.0, 0.38, -1.45],
    [wheelGeo, 1.0, 0.38, -1.45],
  ], tyre));

  const lightMat = new THREE.MeshLambertMaterial({ color: 0xfff2b0, emissive: 0xffe9a0 });
  car.add(mergedMesh([
    [new THREE.BoxGeometry(0.42, 0.18, 0.1), -0.7, 0.68, 2.48],
    [new THREE.BoxGeometry(0.42, 0.18, 0.1), 0.7, 0.68, 2.48],
  ], lightMat));
  const tailMat = new THREE.MeshLambertMaterial({ color: 0xc0392b, emissive: 0x701a10 });
  car.add(mergedMesh([
    [new THREE.BoxGeometry(0.42, 0.16, 0.1), -0.7, 0.68, -2.48],
    [new THREE.BoxGeometry(0.42, 0.16, 0.1), 0.7, 0.68, -2.48],
  ], tailMat));

  if (kind === 'police') {
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 0.22, 0.5),
      new THREE.MeshLambertMaterial({ color: 0x223344 }),
    );
    bar.position.set(0, 1.62, -0.25);
    car.add(bar);
    const red = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.18, 0.52),
      new THREE.MeshLambertMaterial({ color: 0xff2222, emissive: 0xaa0000 }),
    );
    red.position.set(-0.38, 1.74, -0.25);
    car.add(red);
    const blue = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.18, 0.52),
      new THREE.MeshLambertMaterial({ color: 0x2244ff, emissive: 0x0000aa }),
    );
    blue.position.set(0.38, 1.74, -0.25);
    car.add(blue);
    car.userData.flashRed = red;
    car.userData.flashBlue = blue;
  }
  return car;
}

// Directions: 0 = +x (east), 1 = +z (south), 2 = -x, 3 = -z.
export const DIRS = [
  { x: 1, z: 0 },
  { x: 0, z: 1 },
  { x: -1, z: 0 },
  { x: 0, z: -1 },
];

function dirHeading(dir) {
  return [Math.PI / 2, Math.PI, -Math.PI / 2, 0][dir];
}

export class TrafficSystem {
  constructor(scene, rng, colliders) {
    this.scene = scene;
    this.rng = rng;
    this.colliders = colliders;
    this.lines = roadLines();
    this.cars = [];
    this.parked = [];
    this.spawnTraffic();
    this.spawnParked();
  }

  _randomRoadSpot() {
    const lines = this.lines;
    const vertical = this.rng() < 0.5;
    const line = lines[int(this.rng, 0, lines.length - 1)];
    // Right-hand lane offset so cars do not drive head-on into each other.
    const lane = 3;
    if (vertical) {
      const dir = this.rng() < 0.5 ? 0 : 2;
      return { x: line + (dir === 0 ? lane : -lane), z: range(this.rng, -220, 220), dir };
    }
    const dir = this.rng() < 0.5 ? 1 : 3;
    return { x: range(this.rng, -220, 220), z: line + (dir === 1 ? lane : -lane), dir };
  }

  spawnTraffic() {
    for (let i = 0; i < TRAFFIC.count; i += 1) {
      const spot = this._randomRoadSpot();
      const mesh = makeCarMesh(pick(this.rng, PALETTE.cars));
      mesh.position.set(spot.x, 0, spot.z);
      mesh.rotation.y = dirHeading(spot.dir);
      this.scene.add(mesh);
      this.cars.push({
        mesh,
        x: spot.x,
        z: spot.z,
        dir: spot.dir,
        speed: range(this.rng, TRAFFIC.cruiseMin, TRAFFIC.cruiseMax),
        turnAt: null,
      });
    }
  }

  spawnParked() {
    // Parked in the kerb lane of the main avenues, nose along the road.
    const spots = [];
    for (const line of [0, 56, -56, 112, -112]) {
      for (const d of [-180, -120, -60, 60, 120, 180]) {
        spots.push({ x: line + 3, z: d, rot: 0 });
        spots.push({ x: d, z: line + 3, rot: Math.PI / 2 });
      }
    }
    const chosen = spots.slice(0, TRAFFIC.parked);
    for (const s of chosen) {
      const mesh = makeCarMesh(pick(this.rng, PALETTE.cars));
      mesh.position.set(s.x, 0, s.z);
      mesh.rotation.y = s.rot + (this.rng() < 0.5 ? 0 : Math.PI);
      this.scene.add(mesh);
      this.parked.push({ mesh, x: s.x, z: s.z, taken: false, name: pick(this.rng, ['Comet', 'Vortex', 'Sunrunner', 'Marlin', 'Dune']) });
    }
  }

  // Traffic drives its lane; at an intersection it sometimes turns.
  update(dt) {
    for (const car of this.cars) {
      const d = DIRS[car.dir];
      car.x += d.x * car.speed * dt;
      car.z += d.z * car.speed * dt;
      // Wrap around the city edge so the streets never empty out.
      if (car.x > 248) car.x = -248;
      if (car.x < -248) car.x = 248;
      if (car.z > 248) car.z = -248;
      if (car.z < -248) car.z = 248;
      // Near an intersection centreline: maybe turn left or right.
      const nearX = this.lines.some((c) => Math.abs(car.x - c) < 1.2);
      const nearZ = this.lines.some((c) => Math.abs(car.z - c) < 1.2);
      if (nearX && nearZ && this.rng() < 0.02) {
        car.dir = (car.dir + (this.rng() < 0.5 ? 1 : 3)) % 4;
      }
      car.mesh.position.set(car.x, 0, car.z);
      car.mesh.rotation.y = dirHeading(car.dir);
    }
  }

  // The parked car nearest a point, within reach, that is still there.
  nearestParked(x, z, maxDist = 4.5) {
    let best = null;
    let bestD = maxDist;
    for (const p of this.parked) {
      if (p.taken) continue;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }

  // The traffic car nearest a point (for stealing a moving car).
  nearestTraffic(x, z, maxDist = 4.5) {
    let best = null;
    let bestD = maxDist;
    for (const c of this.cars) {
      const d = Math.hypot(c.x - x, c.z - z);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return best;
  }
}

// One police Interceptor: chases the player, rams, flashes its light bar.
export class PoliceCar {
  constructor(scene, x, z) {
    this.mesh = makeCarMesh(0x1a1a2e, 'police');
    this.mesh.position.set(x, 0, z);
    scene.add(this.mesh);
    this.x = x;
    this.z = z;
    this.heading = 0;
    this.speed = 0;
    this.flash = 0;
    this.active = true;
  }

  update(dt, target, colliders) {
    if (!this.active) return;
    const dx = target.x - this.x;
    const dz = target.z - this.z;
    const dist = Math.hypot(dx, dz) || 0.001;
    const want = Math.atan2(dx, dz);
    let diff = want - this.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.heading += Math.max(-2.4 * dt, Math.min(2.4 * dt, diff));
    // Ease up when close so it rams instead of orbiting.
    const targetSpeed = dist > 26 ? POLICE.chaseSpeed : POLICE.chaseSpeed * 0.55;
    this.speed += Math.max(-30 * dt, Math.min(30 * dt, targetSpeed - this.speed));
    this.x += Math.sin(this.heading) * this.speed * dt;
    this.z += Math.cos(this.heading) * this.speed * dt;
    this.x = Math.max(-248, Math.min(248, this.x));
    this.z = Math.max(-248, Math.min(248, this.z));
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
    // Flash the light bar red / blue.
    this.flash += dt;
    const on = Math.floor(this.flash / 0.3) % 2 === 0;
    if (this.mesh.userData.flashRed) {
      this.mesh.userData.flashRed.material.emissive.setHex(on ? 0xff0000 : 0x220000);
      this.mesh.userData.flashBlue.material.emissive.setHex(on ? 0x000022 : 0x0000ff);
    }
    return dist;
  }

  remove(scene) {
    this.active = false;
    scene.remove(this.mesh);
  }
}

// The car the player is driving: arcade physics, no drift model, but a
// brake, a reverse and a steering feel that answers at speed.
export class PlayerCar {
  constructor(mesh, name) {
    this.mesh = mesh;
    this.name = name;
    this.x = mesh.position.x;
    this.z = mesh.position.z;
    this.heading = mesh.rotation.y;
    this.speed = 0;
    this.steer = 0;
  }

  drive(dt, input, colliders) {
    const forward = input.forward ? 1 : 0;
    const back = input.back ? 1 : 0;
    if (forward) this.speed += PLAYER.accel * dt;
    if (back) {
      if (this.speed > 0.5) this.speed -= PLAYER.brake * dt;
      else this.speed -= PLAYER.reverseAccel * dt;
    }
    if (!forward && !back) this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 12 * dt);
    this.speed = Math.max(-PLAYER.maxReverse, Math.min(PLAYER.maxSpeed, this.speed));
    const steerTarget = (input.left ? 1 : 0) - (input.right ? 1 : 0);
    this.steer += (steerTarget - this.steer) * Math.min(1, dt * 8);
    const speedFactor = Math.min(1, Math.abs(this.speed) / 12);
    this.heading += this.steer * PLAYER.turnRate * speedFactor * dt * Math.sign(this.speed || 1);
    let nx = this.x + Math.sin(this.heading) * this.speed * dt;
    let nz = this.z + Math.cos(this.heading) * this.speed * dt;
    nx = Math.max(-248, Math.min(248, nx));
    nz = Math.max(-248, Math.min(248, nz));
    // Buildings stop the car dead with a thud, not a slide-through.
    let hit = false;
    for (const b of colliders) {
      const cx = Math.max(b.minX, Math.min(nx, b.maxX));
      const cz = Math.max(b.minZ, Math.min(nz, b.maxZ));
      if (Math.hypot(nx - cx, nz - cz) < 1.6) {
        hit = true;
        break;
      }
    }
    if (hit) {
      this.speed *= -0.25;
    } else {
      this.x = nx;
      this.z = nz;
    }
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
    return hit;
  }
}

export { isRoad };
