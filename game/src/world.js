// Solmar Heat — the world: the player on foot and behind the wheel, the
// chase camera, the wanted level, the pistol, the bust/waste loop and the
// save. Everything else is a system; this file wires them together.
import { GRID, CITY, PALETTE, PLAYER, POLICE, WANTED, COMBAT, FINES, SAVE_KEY } from './config.js';
import { mulberry32, range, pick } from './random.js';
import { SoundBank } from './audio.js';
import { buildCity, collideBuildings } from './city.js';
import { TrafficSystem, PoliceCar, PlayerCar, makeCarMesh } from './vehicles.js';
import { PedestrianSystem, FootCopSystem } from './people.js';
import { MissionRunner } from './missions.js';
import { Hud } from './hud.js';

function makePlayerMesh() {
  const g = new THREE.Group();
  g.name = 'dante';
  const jacket = new THREE.MeshLambertMaterial({ color: 0x8a2f2f });
  const skin = new THREE.MeshLambertMaterial({ color: 0xd9a986 });
  const pants = new THREE.MeshLambertMaterial({ color: 0x2c3e50 });
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.8, 0.3), pants);
  legs.position.y = 0.4;
  g.add(legs);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.72, 0.34), jacket);
  torso.position.y = 1.16;
  torso.castShadow = true;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 10), skin);
  head.position.y = 1.74;
  head.castShadow = true;
  g.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x1a1a1a }));
  hair.position.y = 1.78;
  g.add(hair);
  return g;
}

export class World {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.seed = options.seed || 1;
    this.rng = mulberry32(this.seed);
    this.shotMode = options.shot || null;
    this.screen = 'title'; // title | play | pause | end
    this.time = 0;
    this.sound = new SoundBank();
    this.hud = new Hud();

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(CITY.skyBottom);
    this.scene.fog = new THREE.Fog(CITY.sunColor, CITY.fogNear, CITY.fogFar);
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 2000);

    // Golden-hour sun: low, warm, long shadows.
    const sun = new THREE.DirectionalLight(CITY.sunColor, 2.4);
    sun.position.set(-180, 190, -120);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -260;
    sun.shadow.camera.right = 260;
    sun.shadow.camera.top = 260;
    sun.shadow.camera.bottom = -260;
    sun.shadow.camera.far = 800;
    this.scene.add(sun);
    this.scene.add(new THREE.HemisphereLight(CITY.skyTop, 0x8a6b48, 0.9));

    const built = buildCity(this.scene, this.rng);
    this.city = built;
    this.colliders = built.colliders;

    this.traffic = new TrafficSystem(this.scene, this.rng, this.colliders);
    this.peds = new PedestrianSystem(this.scene, this.rng);
    this.footCops = new FootCopSystem(this.scene, this.rng);
    this.policeCars = [];

    // The mission marker: a beam of light and a bobbing arrow.
    this.beacon = new THREE.Group();
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(2.6, 2.6, 42, 14, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd700, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }),
    );
    beam.position.y = 21;
    this.beacon.add(beam);
    const arrow = new THREE.Mesh(
      new THREE.ConeGeometry(1.6, 3.4, 4),
      new THREE.MeshBasicMaterial({ color: 0xffd700 }),
    );
    arrow.rotation.x = Math.PI;
    arrow.position.y = 9;
    this.beacon.add(arrow);
    this.beacon.visible = false;
    this.scene.add(this.beacon);

    this.missions = new MissionRunner({
      onMessage: (t) => this.hud.pushMessage(t),
      onCash: (n) => this.addCash(n),
      onBlip: () => this.sound.blip(880),
      onStoryDone: () => {
        this.sound.jingle();
        this.hud.pushMessage('STORY COMPLETE — Solmar is yours, Dante. The crew bows to no one.');
      },
    });

    // Dante, fresh out of the Solmar docks — on 20th Ave by the plaza.
    this.playerMesh = makePlayerMesh();
    this.scene.add(this.playerMesh);
    this.player = {
      x: 28,
      z: 64,
      heading: Math.PI,
      speed: 0,
      health: PLAYER.health,
      cash: 150,
      inCar: false,
      car: null,
      carName: '',
      walkBob: 0,
    };
    this.camYaw = Math.PI;
    this.camPitch = 0.42;
    this.camDist = 8;
    this.wanted = 0;
    this.lastHeat = -999;
    this.decayT = 0;
    this.shootCooldown = 0;
    this.saveDirty = false;
    this.saveT = 0;
    this.endKind = null;
    this.raycaster = new THREE.Raycaster();

    this.keys = new Set();
    this.dragging = false;
    this.dragMoved = 0;
    this.dragStartT = 0;
    this._bindInput();
    this._bindButtons();

    const save = this.loadSave();
    this.hasSave = !!save;
    this.saveData = save;
    this.hud.showTitle(this.hasSave, save ? this.saveText(save) : '');
    this.hud.showHud(false);
    this.hud.setCash(this.player.cash);
    this.hud.setStars(0);
    this.hud.setHealth(this.player.health);
    this.hud.setClock();
    this.updatePlayerMesh();
    this.updateCamera(0);
  }

  saveText(save) {
    const done = save.missionIndex >= 6 ? 'Story complete' : `Mission ${save.missionIndex + 1} of 6`;
    return `Continue — $${save.cash} · ${done}`;
  }

  loadSave() {
    try {
      const raw = window.localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (typeof data.cash !== 'number' || typeof data.missionIndex !== 'number') return null;
      return data;
    } catch {
      return null;
    }
  }

  writeSave() {
    try {
      window.localStorage.setItem(SAVE_KEY, JSON.stringify({
        cash: this.player.cash,
        missionIndex: this.missions.index,
      }));
    } catch {
      // Private mode or no storage: the game plays on without saving.
    }
    this.saveDirty = false;
  }

  addCash(n) {
    this.player.cash = Math.max(0, this.player.cash + n);
    this.hud.setCash(this.player.cash);
    this.saveDirty = true;
  }

  addWanted(n, reason) {
    if (this.wanted >= WANTED.max) return;
    this.wanted = Math.min(WANTED.max, this.wanted + n);
    this.lastHeat = this.time;
    this.hud.setStars(this.wanted);
    if (this.wanted > 0) this.sound.startSiren();
    if (reason) this.hud.pushMessage(reason);
  }

  clearWanted() {
    this.wanted = 0;
    this.decayT = 0;
    this.hud.setStars(0);
    this.sound.stopSiren();
  }

  _bindButtons() {
    const start = document.getElementById('btn-start');
    if (start) start.addEventListener('click', () => this.startGame(false));
    const cont = document.getElementById('btn-continue');
    if (cont) cont.addEventListener('click', () => this.startGame(true));
    const resume = document.getElementById('btn-resume');
    if (resume) resume.addEventListener('click', () => this.togglePause(false));
    const restart = document.getElementById('btn-restart');
    if (restart) restart.addEventListener('click', () => this.restartMission());
    const quit = document.getElementById('btn-quit');
    if (quit) quit.addEventListener('click', () => this.toTitle());
    const endOk = document.getElementById('btn-end');
    if (endOk) endOk.addEventListener('click', () => this.respawn());
  }

  _bindInput() {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') e.preventDefault();
      this.sound.unlock();
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'KeyE' && this.screen === 'play') this.tryEnterExitCar();
      if (e.code === 'KeyM') {
        this.sound.setMuted(!this.sound.muted);
        this.hud.setMuted(this.sound.muted);
      }
      if (e.code === 'KeyP' && (this.screen === 'play' || this.screen === 'pause')) {
        this.togglePause(this.screen === 'play');
      }
      if (e.code === 'Enter' && this.screen === 'title') this.startGame(this.hasSave);
      if (e.code === 'Escape' && this.screen === 'play') this.togglePause(true);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    this.canvas.addEventListener('pointerdown', (e) => {
      this.sound.unlock();
      this.dragging = true;
      this.dragMoved = 0;
      this.dragStartT = performance.now();
    });
    window.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      this.dragMoved += Math.abs(e.movementX) + Math.abs(e.movementY);
      this.camYaw -= e.movementX * 0.0045;
      this.camPitch = Math.max(0.12, Math.min(1.15, this.camPitch + e.movementY * 0.003));
    });
    window.addEventListener('pointerup', () => {
      if (this.dragging && this.dragMoved < 6 && performance.now() - this.dragStartT < 350) {
        if (this.screen === 'play' && !this.player.inCar) this.shoot();
      }
      this.dragging = false;
    });
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  startGame(continueSave) {
    this.sound.unlock();
    if (continueSave && this.saveData) {
      this.player.cash = this.saveData.cash;
      this.missions.index = Math.min(5, this.saveData.missionIndex);
      this.hud.setCash(this.player.cash);
      this.hud.pushMessage(`Welcome back, Dante. ${this.saveText(this.saveData)}`);
    } else {
      this.missions.reset();
      this.player.cash = 150;
      this.hud.setCash(150);
    }
    this.screen = 'play';
    this.hud.hideTitle();
    this.hud.hideEnd();
    this.hud.showHud(true);
    this.missions.startCurrent();
    this.hud.setObjective(this.missions.objective);
  }

  toTitle() {
    this.screen = 'title';
    this.hud.hidePause();
    this.hud.showHud(false);
    this.hud.showTitle(this.hasSave, this.saveData ? this.saveText(this.saveData) : '');
  }

  togglePause(pause) {
    if (pause) {
      this.screen = 'pause';
      this.hud.showPause();
    } else {
      this.screen = 'play';
      this.hud.hidePause();
    }
  }

  restartMission() {
    this.missions.startCurrent();
    this.togglePause(false);
    this.hud.pushMessage('Mission restarted.');
  }

  respawn() {
    this.hud.hideEnd();
    this.player.health = PLAYER.health;
    this.hud.setHealth(this.player.health);
    this.player.x = 28;
    this.player.z = 64;
    this.player.heading = Math.PI;
    this.camYaw = Math.PI;
    this.clearWanted();
    if (this.player.car) this.exitCar();
    // The cops scatter; the job stays where it was.
    for (const pc of this.policeCars) pc.remove(this.scene);
    this.policeCars = [];
    this.screen = 'play';
    this.hud.showHud(true);
  }

  endGame(kind) {
    this.endKind = kind;
    this.screen = 'end';
    const fine = Math.min(this.player.cash, kind === 'busted' ? FINES.busted : FINES.wasted);
    this.addCash(-fine);
    this.writeSave();
    if (kind === 'busted') {
      this.hud.showEnd('busted', `The Solmar PD cuffed you on 20th Ave. Fine: $${fine}. The crew is waiting — get back out there.`);
    } else {
      this.hud.showEnd('wasted', `You flatlined on the streets of Solmar. Hospital bill: $${fine}. Dante does not stay down.`);
    }
    this.sound.stopEngine();
    this.sound.stopSiren();
  }

  tryEnterExitCar() {
    if (this.player.inCar) {
      this.exitCar();
      return;
    }
    const parked = this.traffic.nearestParked(this.player.x, this.player.z);
    const moving = this.traffic.nearestTraffic(this.player.x, this.player.z);
    const target = parked || moving;
    if (!target) {
      this.hud.pushMessage('No car in reach — get closer and press E.');
      return;
    }
    if (parked) parked.taken = true;
    else this.traffic.cars = this.traffic.cars.filter((c) => c !== moving);
    const mesh = target.mesh;
    const name = target.name || pick(this.rng, ['Comet', 'Vortex', 'Sunrunner']);
    this.player.car = new PlayerCar(mesh, name);
    this.player.car.x = target.x;
    this.player.car.z = target.z;
    this.player.car.heading = mesh.rotation.y;
    this.player.inCar = true;
    this.player.carName = name;
    this.hud.setCarName(`Driving: ${name}`);
    this.sound.startEngine();
    this.sound.blip(520);
    // Stealing in front of the law is a crime, not a commute.
    const copNear = this.footCops.cops.some((c) => Math.hypot(c.x - this.player.x, c.z - this.player.z) < 45);
    if (copNear || this.policeCars.length > 0) {
      this.addWanted(WANTED.steal, 'The law saw you steal that car! +1 star');
    } else {
      this.hud.pushMessage(`You took the ${name}. Marlow would be proud.`);
    }
  }

  exitCar() {
    if (!this.player.car) return;
    const car = this.player.car;
    this.player.x = car.x - Math.sin(car.heading) * 3.5;
    this.player.z = car.z - Math.cos(car.heading) * 3.5;
    this.player.heading = car.heading;
    this.player.inCar = false;
    this.player.car = null;
    this.player.carName = '';
    this.hud.setCarName('');
    this.sound.stopEngine();
    this.updatePlayerMesh();
  }

  shoot() {
    if (this.shootCooldown > 0 || this.screen !== 'play') return;
    this.shootCooldown = COMBAT.cooldown;
    this.sound.shoot();
    this.raycaster.setFromCamera({ x: 0, y: 0 }, this.camera);
    this.raycaster.far = COMBAT.range;
    const roots = [
      ...this.peds.peds.map((p) => p.mesh),
      ...this.footCops.cops.map((c) => c.mesh),
      ...this.traffic.cars.map((c) => c.mesh),
      ...this.traffic.parked.filter((p) => !p.taken).map((p) => p.mesh),
    ];
    const hits = this.raycaster.intersectObjects(roots, true);
    if (hits.length === 0) return;
    let target = hits[0].object;
    while (target && target.parent && !target.name.startsWith('person-') && !target.name.startsWith('car-')) {
      target = target.parent;
    }
    if (!target) return;
    if (target.name === 'person-ped') {
      const ped = this.peds.peds.find((p) => p.mesh === target);
      if (ped) {
        this.peds.removePed(ped);
        this.addWanted(WANTED.shoot, 'A witness saw the shooting! +1 star');
        this.hud.pushMessage('Pedestrian down. The city saw that.');
      }
    } else if (target.name === 'person-cop') {
      const cop = this.footCops.cops.find((c) => c.mesh === target);
      if (cop) {
        cop.stun = 4;
        cop.bustT = 0;
        this.addWanted(WANTED.killCop, 'You dropped a cop! +2 stars');
        this.hud.pushMessage('Cop down! The whole force is coming.');
      }
    } else if (target.name.startsWith('car-')) {
      this.hud.pushMessage('Your shot sparked off the paintwork.');
    }
    this.peds.scare(this.player.x, this.player.z, 30);
  }

  updatePlayerMesh() {
    this.playerMesh.position.set(this.player.x, 0, this.player.z);
    this.playerMesh.rotation.y = this.player.heading;
    this.playerMesh.visible = !this.player.inCar;
  }

  updateCamera(dt) {
    const targetDist = this.player.inCar ? 11 + Math.min(4, Math.abs(this.player.car ? this.player.car.speed : 0) * 0.08) : 7.5;
    this.camDist += (targetDist - this.camDist) * Math.min(1, dt * 4);
    const px = this.player.inCar && this.player.car ? this.player.car.x : this.player.x;
    const pz = this.player.inCar && this.player.car ? this.player.car.z : this.player.z;
    const cx = px - Math.sin(this.camYaw) * this.camDist;
    const cz = pz - Math.cos(this.camYaw) * this.camDist;
    const cy = 2.2 + Math.sin(this.camPitch) * this.camDist;
    this.camera.position.set(cx, cy, cz);
    this.camera.lookAt(px, 2.1, pz);
  }

  // Police numbers follow the heat: more stars, more Interceptors.
  syncPolice() {
    const want = this.wanted === 0 ? 0 : Math.min(POLICE.maxInterceptors, this.wanted >= 5 ? 4 : this.wanted >= 3 ? 3 : this.wanted >= 2 ? 2 : 1);
    while (this.policeCars.length < want) {
      const ang = this.rng() * Math.PI * 2;
      const px = this.player.x + Math.sin(ang) * 55;
      const pz = this.player.z + Math.cos(ang) * 55;
      this.policeCars.push(new PoliceCar(this.scene, px, pz));
    }
    while (this.policeCars.length > want) {
      const pc = this.policeCars.pop();
      if (pc) pc.remove(this.scene);
    }
  }

  update(dt) {
    this.time += dt;
    if (this.shootCooldown > 0) this.shootCooldown -= dt;

    if (this.screen === 'title') {
      // A slow orbit over the plaza while the title is up.
      const t = this.time * 0.05;
      this.camera.position.set(Math.sin(t) * 90, 42, Math.cos(t) * 90);
      this.camera.lookAt(0, 8, 0);
      this.traffic.update(dt * 0.3);
      this.peds.update(dt * 0.3, this.player.x, this.player.z, 0);
      this.renderer.render(this.scene, this.camera);
      return;
    }
    if (this.screen !== 'play') {
      this.renderer.render(this.scene, this.camera);
      return;
    }

    const p = this.player;
    const input = {
      forward: this.keys.has('KeyW') || this.keys.has('ArrowUp'),
      back: this.keys.has('KeyS') || this.keys.has('ArrowDown'),
      left: this.keys.has('KeyA') || this.keys.has('ArrowLeft'),
      right: this.keys.has('KeyD') || this.keys.has('ArrowRight'),
      sprint: this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'),
    };

    if (p.inCar && p.car) {
      const hit = p.car.drive(dt, input, this.colliders);
      if (hit) this.sound.thud(0.8);
      p.x = p.car.x;
      p.z = p.car.z;
      p.heading = p.car.heading;
      p.speed = p.car.speed;
      this.sound.setEngine(Math.abs(p.speed) / PLAYER.maxSpeed, true);
      this.sound.updateSiren(dt);
    } else {
      // On foot: WASD moves relative to the camera, Shift sprints.
      const fx = Math.sin(this.camYaw);
      const fz = Math.cos(this.camYaw);
      const rx = -Math.cos(this.camYaw);
      const rz = Math.sin(this.camYaw);
      let mx = fx * (input.forward ? 1 : 0) - fx * (input.back ? 1 : 0) + rx * (input.right ? 1 : 0) - rx * (input.left ? 1 : 0);
      let mz = fz * (input.forward ? 1 : 0) - fz * (input.back ? 1 : 0) + rz * (input.right ? 1 : 0) - rz * (input.left ? 1 : 0);
      const len = Math.hypot(mx, mz);
      if (len > 0) {
        mx /= len;
        mz /= len;
        const speed = input.sprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
        p.speed = speed;
        const nx = p.x + mx * speed * dt;
        const nz = p.z + mz * speed * dt;
        const fixed = collideBuildings(this.colliders, nx, nz, PLAYER.radius);
        p.x = Math.max(-248, Math.min(248, fixed.x));
        p.z = Math.max(-248, Math.min(248, fixed.z));
        p.heading = Math.atan2(mx, mz);
        p.walkBob += dt * speed * 1.6;
      } else {
        p.speed = 0;
      }
      this.sound.setEngine(0, false);
      this.sound.updateSiren(dt);
      this.updatePlayerMesh();
    }

    // The world keeps moving around Dante.
    this.traffic.update(dt);
    this.peds.update(dt, p.x, p.z, p.speed);
    this.footCops.update(dt, p, this.wanted);

    // Busted: a foot cop held Dante long enough.
    if (this.footCops.anyBust()) {
      this.endGame('busted');
      this.renderer.render(this.scene, this.camera);
      return;
    }

    // The heat: it decays after a clean stretch, and the sirens follow.
    if (this.wanted > 0) {
      if (this.time - this.lastHeat > WANTED.decayDelay) {
        this.decayT += dt;
        if (this.decayT >= WANTED.decayStep) {
          this.decayT = 0;
          this.wanted -= 1;
          this.hud.setStars(this.wanted);
          if (this.wanted === 0) this.sound.stopSiren();
          else this.hud.pushMessage('The heat is cooling off…');
        }
      }
    }
    this.syncPolice();
    for (const pc of this.policeCars) {
      const dist = pc.update(dt, p, this.colliders);
      // A ram at speed hurts — and shoves the car.
      if (dist !== undefined && dist < 4.6) {
        if (p.inCar && Math.abs(p.speed) < 20) {
          p.health -= POLICE.ramDamage * dt * 3;
          this.hud.setHealth(p.health);
          if (Math.random() < 0.1) this.sound.thud(0.5);
        } else if (!p.inCar) {
          p.health -= POLICE.ramDamage * dt * 2;
          this.hud.setHealth(p.health);
        }
      }
    }

    // Wasted: no health left.
    if (p.health <= 0) {
      this.endGame('wasted');
      this.renderer.render(this.scene, this.camera);
      return;
    }

    // Missions, the clock and the save.
    this.missions.update(dt, { x: p.x, z: p.z, inCar: p.inCar, wanted: this.wanted, speed: p.speed });
    this.hud.setObjective(this.missions.objective);
    this.hud.tickClock(dt);
    this.hud.setHealth(p.health);
    const mph = p.inCar && p.car ? p.car.speed * 2.24 : 0;
    this.hud.setSpeed(mph, p.inCar);
    if (this.saveDirty) {
      this.saveT += dt;
      if (this.saveT > 4) {
        this.writeSave();
        this.saveT = 0;
      }
    }

    // The mission beacon follows the current marker.
    if (this.missions.marker) {
      this.beacon.visible = true;
      this.beacon.position.set(this.missions.marker.x, 0, this.missions.marker.z);
      this.beacon.children[1].position.y = 9 + Math.sin(this.time * 3) * 1.2;
    } else {
      this.beacon.visible = false;
    }

    this.hud.drawMinimap({
      player: { x: p.x, z: p.z, heading: p.heading },
      traffic: this.traffic.cars,
      police: this.policeCars,
      marker: this.missions.marker,
    });

    this.updateCamera(dt);
    this.renderer.render(this.scene, this.camera);
  }
}
