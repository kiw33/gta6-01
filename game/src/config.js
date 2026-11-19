// Solmar Heat — tuning constants for the whole game.
// One place for every number a designer would tweak: the city grid, the cars,
// the cops, the missions and the money.
export const GRID = {
  blocks: 9, // 9 x 9 blocks of city
  pitch: 56, // block centre to block centre, in metres
  road: 12, // road width
  block: 44, // building block width (pitch - road)
};

export const CITY = {
  // Southern edge: sand, then the sea. The grid runs z = -224 .. +224.
  beachZ: 252,
  seaZ: 292,
  extent: 252,
  sunColor: 0xffd9a0,
  skyTop: 0x87b5e0,
  skyBottom: 0xffd9a0,
  fogNear: 260,
  fogFar: 1100,
};

// Warm, sun-soaked Solmar palette. Every building, car and pedestrian picks
// from these lists, so the city stays coherent instead of random.
export const PALETTE = {
  buildings: [0xe8b48a, 0xd9a06b, 0xf2c89b, 0xc98d64, 0x9fb8c8, 0x7fa3b8, 0xe0d6c2, 0xb98a6e],
  towerGlass: [0x6fa8c8, 0x5b93b8, 0x8ab8d0],
  cars: [0xc0392b, 0x2e6fb0, 0xe0a030, 0x3aa655, 0xd8d8d8, 0x222222, 0x7a4a9e, 0xd06a2a],
  peds: [0xe05a5a, 0x4a90d9, 0x58b368, 0xe0c040, 0x9b59b6, 0xdddddd, 0x34495e, 0xe67e22],
  road: 0x3a3f46,
  sidewalk: 0xb8b0a0,
  sand: 0xe8d29a,
  sea: 0x2e7fa8,
  grass: 0x7fae5a,
};

export const PLAYER = {
  walkSpeed: 7,
  sprintSpeed: 11,
  accel: 26,
  brake: 42,
  reverseAccel: 14,
  maxSpeed: 38, // ~85 mph in a Comet
  maxReverse: 10,
  turnRate: 2.1,
  health: 100,
  radius: 0.9,
};

export const TRAFFIC = {
  count: 16,
  cruiseMin: 8,
  cruiseMax: 13,
  parked: 14,
};

export const PEDS = {
  count: 26,
  walkMin: 1.1,
  walkMax: 2.2,
  fleeSpeed: 5.2,
};

export const POLICE = {
  maxInterceptors: 4,
  chaseSpeed: 33,
  ramDamage: 6,
  footCops: 3,
  footSpeed: 6.4,
  bustRadius: 2.2,
  bustHold: 1.6, // seconds a cop must stay close to bust you
};

export const WANTED = {
  max: 5,
  decayDelay: 14, // seconds clean before the heat starts to fall
  decayStep: 8, // seconds per star lost
  steal: 1,
  shoot: 1,
  killCop: 2,
};

export const COMBAT = {
  range: 60,
  damage: 34,
  cooldown: 0.28,
  spread: 0.02,
};

export const MISSIONS = [
  { id: 'borrowed', name: 'Borrowed Wheels', giver: 'Marlow', payout: 250 },
  { id: 'courier', name: 'Sunset Courier', giver: 'Vex', payout: 400 },
  { id: 'hotwheels', name: 'Hot Wheels', giver: 'Marlow', payout: 500 },
  { id: 'getaway', name: 'The Getaway', giver: 'Vex', payout: 650 },
  { id: 'beach', name: 'Beach Pickup', giver: 'Marlow', payout: 800 },
  { id: 'score', name: 'The Big Score', giver: 'Vex', payout: 1500 },
];

export const FINES = {
  busted: 200,
  wasted: 200,
};

export const SAVE_KEY = 'solmar-heat-save-v1';
