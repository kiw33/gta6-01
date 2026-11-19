// Solmar Heat — the screenshot poses. ?shot=start|drive|chase|mission puts
// the game in a fixed, seeded state and drives it for a fixed number of
// frames, then raises window.__shotReady so the capture script knows the
// frame is final. shots.json names the four shots the entry hands in.
export function setupShot(world, name) {
  const parked = world.traffic.parked[0];

  function enterFirstCar() {
    world.player.x = parked.x;
    world.player.z = parked.z;
    world.player.heading = parked.mesh.rotation.y;
    world.camYaw = parked.mesh.rotation.y;
    world.tryEnterExitCar();
    // Face +z, down 20th Ave into the city, whatever way the car was parked.
    const car = world.player.car;
    car.heading = 0;
    car.mesh.rotation.y = 0;
    world.player.heading = 0;
    world.camYaw = 0;
    world.camPitch = 0.35;
  }

  if (name === 'start') {
    // The title screen over 20th Ave: the orbit camera does the work.
    return { frames: 90, keys: [] };
  }

  if (name === 'drive') {
    world.startGame(false);
    enterFirstCar();
    return { frames: 150, keys: ['KeyW'] };
  }

  if (name === 'chase') {
    world.startGame(false);
    enterFirstCar();
    world.addWanted(4, '');
    world.syncPolice();
    // Park the Interceptors on Dante's tail so the chase reads at a glance.
    // Dante faces +z down 20th Ave; the tail is behind him, at -z.
    const px = world.player.x;
    const pz = world.player.z;
    world.policeCars.forEach((pc, i) => {
      pc.x = px + (i % 2 === 0 ? 7 : -7);
      pc.z = pz - 16 - i * 6;
      pc.heading = 0;
      pc.speed = 20;
    });
    // Reverse chase camera: ahead of Dante, looking back at him with the
    // Interceptors closing in behind — the whole chase in one frame.
    world.camYaw = Math.PI;
    world.camPitch = 0.35;
    return { frames: 120, keys: ['KeyW'] };
  }

  if (name === 'mission') {
    world.startGame(false);
    world.missions.jumpTo(4); // Beach Pickup, the fifth job.
    enterFirstCar();
    // Put Dante on the beach road, nose toward the pickup marker.
    const car = world.player.car;
    car.x = 0;
    car.z = 196;
    car.heading = 0;
    car.mesh.position.set(0, 0, 196);
    car.mesh.rotation.y = 0;
    world.player.x = 0;
    world.player.z = 196;
    world.player.heading = 0;
    world.camYaw = 0;
    world.camPitch = 0.5;
    return { frames: 110, keys: ['KeyW'] };
  }

  // Unknown ?shot=: just play the title.
  return { frames: 60, keys: [] };
}
