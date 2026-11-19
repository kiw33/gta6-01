// Solmar Heat — the city itself: a 9x9 grid of towers, plazas and palms,
// a beach and a sea to the south, a lighthouse and the Solmar Trust tower.
// Everything is built once, from the seeded RNG, and never moves again.
//
// Speed note: headless SwiftShader pays per draw call, so every static
// piece is bucketed by colour and merged into one mesh per colour with
// BufferGeometryUtils — the whole city is a few dozen draws, not hundreds.
import { GRID, CITY, PALETTE } from './config.js';
import { range, int, pick, chance } from './random.js';

// The nine road centrelines in each direction: -224, -168, ..., +224.
export function roadLines() {
  const lines = [];
  for (let i = 0; i < GRID.blocks; i += 1) lines.push((i - 4) * GRID.pitch);
  return lines;
}

// The eight block centres in each direction, midway between the roads:
// -196, -140, ..., +196. Buildings live here, never on a road.
export function blockCenters() {
  const centres = [];
  for (let i = 0; i < GRID.blocks - 1; i += 1) centres.push((i - 3.5) * GRID.pitch);
  return centres;
}

// True when a point is on a road (within half the road width of a line).
export function isRoad(x, z) {
  const half = GRID.road / 2 + 1;
  const lines = roadLines();
  const onX = lines.some((c) => Math.abs(x - c) <= half);
  const onZ = lines.some((c) => Math.abs(z - c) <= half);
  return onX || onZ;
}

// Nearest road centreline coordinate to a value.
function nearestLine(v) {
  const lines = roadLines();
  let best = lines[0];
  for (const c of lines) if (Math.abs(v - c) < Math.abs(v - best)) best = c;
  return best;
}

// Push a circle out of every building box it overlaps. Returns true on hit.
export function collideBuildings(colliders, x, z, radius) {
  let hit = false;
  for (const b of colliders) {
    const cx = Math.max(b.minX, Math.min(x, b.maxX));
    const cz = Math.max(b.minZ, Math.min(z, b.maxZ));
    const dx = x - cx;
    const dz = z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      hit = true;
      const d = Math.sqrt(d2) || 0.001;
      const push = (radius - d) / d;
      x += dx * push;
      z += dz * push;
    }
  }
  return { x, z, hit };
}

// One merged mesh per colour: push transformed geometries into a bucket,
// then flush each bucket into a single Mesh at the end.
class BucketBuilder {
  constructor() {
    this.buckets = new Map();
  }

  add(geo, color, x, y, z, ry = 0, sx = 1, sy = 1, sz = 1) {
    const g = geo.clone();
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry);
    m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sx, sy, sz));
    g.applyMatrix4(m);
    if (!this.buckets.has(color)) this.buckets.set(color, []);
    this.buckets.get(color).push(g);
  }

  flush(parent, { shadow = true } = {}) {
    for (const [color, geos] of this.buckets) {
      if (geos.length === 0) continue;
      const merged = THREE.BufferGeometryUtils.mergeGeometries(geos, false);
      const mesh = new THREE.Mesh(merged, new THREE.MeshLambertMaterial({ color }));
      mesh.castShadow = shadow;
      mesh.receiveShadow = true;
      parent.add(mesh);
      for (const g of geos) g.dispose();
    }
    this.buckets.clear();
  }
}

// Build the whole static city into the scene. Returns the collision boxes
// and the landmark positions the missions and shots stand on.
export function buildCity(scene, rng) {
  const colliders = [];
  const group = new THREE.Group();
  group.name = 'city';
  scene.add(group);

  const lines = roadLines();
  const centres = blockCenters();
  const extent = CITY.extent;
  const buckets = new BucketBuilder();

  // Ground: one big warm slab under everything.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(extent * 2 + 160, extent * 2 + 260),
    new THREE.MeshLambertMaterial({ color: 0x9aa578 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.05, 90);
  ground.receiveShadow = true;
  group.add(ground);

  // Roads: dark strips along every grid line, with pale dashes down the middle.
  const roadGeoV = new THREE.PlaneGeometry(GRID.road, extent * 2);
  roadGeoV.rotateX(-Math.PI / 2);
  const roadGeoH = new THREE.PlaneGeometry(extent * 2, GRID.road);
  roadGeoH.rotateX(-Math.PI / 2);
  for (const c of lines) {
    buckets.add(roadGeoV, PALETTE.road, c, 0, 0);
    buckets.add(roadGeoH, PALETTE.road, 0, 0, c);
  }
  const dashGeoV = new THREE.PlaneGeometry(0.7, 5);
  dashGeoV.rotateX(-Math.PI / 2);
  const dashGeoH = new THREE.PlaneGeometry(5, 0.7);
  dashGeoH.rotateX(-Math.PI / 2);
  for (const c of lines) {
    for (let d = -extent; d < extent; d += 16) {
      buckets.add(dashGeoV, 0xd8d2c0, c, 0.02, d + 4);
      buckets.add(dashGeoH, 0xd8d2c0, d + 4, 0.02, c);
    }
  }

  // Sidewalks: pale frames around every block.
  const walkGeo = new THREE.BoxGeometry(GRID.block + 4, 0.3, GRID.block + 4);
  for (let i = 0; i < GRID.blocks - 1; i += 1) {
    for (let j = 0; j < GRID.blocks - 1; j += 1) {
      buckets.add(walkGeo, PALETTE.sidewalk, centres[i], 0.1, centres[j]);
    }
  }

  // Buildings: one to three towers per block, heights rising toward the
  // centre. Two blocks stay open: a plaza and a park.
  const plaza = { i: 4, j: 4 };
  const park = { i: 2, j: 6 };
  for (let i = 0; i < GRID.blocks - 1; i += 1) {
    for (let j = 0; j < GRID.blocks - 1; j += 1) {
      if ((i === plaza.i && j === plaza.j) || (i === park.i && j === park.j)) continue;
      const cx = centres[i];
      const cz = centres[j];
      const distCentre = Math.abs(i - 3.5) + Math.abs(j - 3.5);
      const count = chance(rng, 0.35) ? 1 : 2;
      for (let k = 0; k < count; k += 1) {
        const w = range(rng, 16, 26);
        const d = range(rng, 16, 26);
        const h = range(rng, 12, 30) + Math.max(0, (8 - distCentre) * 7);
        const ox = k === 0 ? -8 : 9;
        const oz = k === 0 ? -6 : 8;
        const color = pick(rng, PALETTE.buildings);
        const bx = cx + ox;
        const bz = cz + oz;
        buckets.add(new THREE.BoxGeometry(w, h, d), color, bx, h / 2 + 0.2, bz);
        // A glass crown so towers read at a glance.
        if (h > 46) {
          buckets.add(new THREE.BoxGeometry(w * 0.55, 3, d * 0.55), pick(rng, PALETTE.towerGlass), bx, h + 1.6, bz);
        }
        // Rooftop box.
        if (chance(rng, 0.6)) buckets.add(new THREE.BoxGeometry(4, 2.5, 4), 0x666666, bx + w * 0.2, h + 1.4, bz);
        colliders.push({ minX: bx - w / 2, maxX: bx + w / 2, minZ: bz - d / 2, maxZ: bz + d / 2 });
      }
    }
  }

  // The plaza: a fountain ring where 20th Ave meets the centre.
  const plazaX = centres[plaza.i];
  const plazaZ = centres[plaza.j];
  buckets.add(new THREE.CylinderGeometry(7, 8, 1.6, 20), 0x7fa3b8, plazaX, 0.9, plazaZ);
  buckets.add(new THREE.CylinderGeometry(5, 5, 0.4, 20), 0x9fd0e8, plazaX, 1.8, plazaZ);

  // The park: grass and a ring of palms.
  const parkX = centres[park.i];
  const parkZ = centres[park.j];
  buckets.add(new THREE.BoxGeometry(GRID.block, 0.4, GRID.block), PALETTE.grass, parkX, 0.2, parkZ);

  // The Solmar Trust tower: the tallest thing in the city, glass and gold.
  const trustX = centres[1];
  const trustZ = centres[1];
  const trustH = 118;
  buckets.add(new THREE.BoxGeometry(30, trustH, 30), 0x5b93b8, trustX, trustH / 2 + 0.2, trustZ);
  buckets.add(new THREE.BoxGeometry(34, 3, 34), 0xe0a030, trustX, trustH + 1.6, trustZ);
  colliders.push({ minX: trustX - 15, maxX: trustX + 15, minZ: trustZ - 15, maxZ: trustZ + 15 });

  // Palms: a trunk, then a flattened green crown. Beach row + park ring.
  const trunkGeo = new THREE.CylinderGeometry(0.35, 0.55, 7, 6);
  const crownGeo = new THREE.IcosahedronGeometry(3.2, 0);
  function palm(x, z, scale = 1) {
    buckets.add(trunkGeo, 0x8a6b48, x, 3.5 * scale, z, 0, scale, scale, scale);
    buckets.add(crownGeo, 0x3f8f4f, x, 7.6 * scale, z, 0, scale, 0.45 * scale, scale);
  }
  for (let x = -220; x <= 220; x += 28) palm(x + range(rng, -4, 4), CITY.beachZ - 8, range(rng, 0.9, 1.3));
  for (let a = 0; a < 8; a += 1) {
    const ang = (a / 8) * Math.PI * 2;
    palm(parkX + Math.cos(ang) * 18, parkZ + Math.sin(ang) * 18, 1.1);
  }
  for (let k = 0; k < 10; k += 1) {
    palm(range(rng, -220, 220), range(rng, -220, 220), range(rng, 0.8, 1.2));
  }

  // Street lamps down the two main avenues.
  const poleGeo = new THREE.CylinderGeometry(0.18, 0.22, 6, 6);
  const bulbGeo = new THREE.SphereGeometry(0.55, 8, 6);
  for (const c of [-224, 0, 224]) {
    for (let d = -224; d <= 224; d += 56) {
      buckets.add(poleGeo, 0x444444, c + 7, 3, d);
      buckets.add(bulbGeo, 0xffe9a8, c + 7, 6.2, d);
    }
  }

  // The beach: sand, then the sea, then the lighthouse on the point.
  const sand = new THREE.Mesh(
    new THREE.BoxGeometry(extent * 2 + 160, 0.6, 60),
    new THREE.MeshLambertMaterial({ color: PALETTE.sand }),
  );
  sand.position.set(0, 0.2, CITY.beachZ + 8);
  sand.receiveShadow = true;
  group.add(sand);
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(extent * 2 + 400, 320),
    new THREE.MeshLambertMaterial({ color: PALETTE.sea }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, 0.05, CITY.seaZ + 140);
  group.add(sea);

  const lightX = 196;
  const lightZ = CITY.beachZ + 26;
  for (let s = 0; s < 5; s += 1) {
    buckets.add(
      new THREE.CylinderGeometry(3.4 - s * 0.25, 3.8 - s * 0.25, 6, 12),
      s % 2 === 0 ? 0xf2ede2 : 0xc0392b,
      lightX, 3 + s * 6, lightZ,
    );
  }
  buckets.add(new THREE.CylinderGeometry(2.6, 2.6, 3, 12), 0xffe9a8, lightX, 33, lightZ);
  colliders.push({ minX: lightX - 4, maxX: lightX + 4, minZ: lightZ - 4, maxZ: lightZ + 4 });

  buckets.flush(group);

  return {
    colliders,
    plaza: { x: plazaX, z: plazaZ },
    park: { x: parkX, z: parkZ },
    trust: { x: trustX, z: trustZ },
    lighthouse: { x: lightX, z: lightZ },
    beach: { x: 0, z: CITY.beachZ + 18 },
    nearestLine,
  };
}
