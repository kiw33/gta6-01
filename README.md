# Solmar Heat — Make GTA 6

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/kiw33/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/kiw33/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**Solmar Heat** is a complete open-world crime game in the spirit of GTA 6,
built for the [make.fun gta6-01 bounty](https://make.fun/bounty/gta6-01).
It runs offline in a desktop browser from static files — no network,
no build step, no account.

You are **Dante Reyes**, fresh out of the Solmar docks. The Marlow crew runs
this sun-soaked city, and they have a job for you: steal cars, lose the cops,
run the missions, and take the Big Score.

## What is in the game

- **A city on foot and by car** — Solmar City: a 9×9 road grid of towers,
  a plaza with a fountain, a park, a beach and sea to the south, a striped
  lighthouse and the glass Solmar Trust tower.
- **Traffic and pedestrians** — 16 traffic cars cruising the grid and turning
  at intersections, 26 pedestrians strolling the sidewalks and fleeing
  gunfire, 14 parked cars, 3 foot cops walking a beat.
- **Stealing cars** — walk up to any car, press **E**, drive off. Stealing
  in front of the law raises your wanted level.
- **Wanted system and police** — 5 stars. Police Interceptors chase and ram
  you; foot cops run you down on the street. Stay clean and the heat decays;
  get caught and you are **BUSTED** (or **WASTED** at zero health) and lose
  $200 in fines.
- **Missions and a story** — six jobs from Marlow and Vex: *Borrowed Wheels*,
  *Sunset Courier* (timed checkpoints), *Hot Wheels* (earn heat, then lose
  it), *The Getaway*, *Beach Pickup*, and *The Big Score*. Each pays out;
  finishing all six completes the story.
- **Combat** — click to shoot the pistol. Shooting witnesses raises your
  wanted level; dropping a cop raises it faster.
- **HUD with a minimap** — cash, wanted stars, in-game clock, mission
  objective, health, speedometer, and a live circular minimap with roads,
  the sea, traffic, police and the mission blip.
- **Start and save** — title screen, pause, and automatic saving (cash and
  mission progress) in localStorage, with Continue on return.
- **Polish** — third-person chase camera, golden-hour sun with long shadows,
  procedural WebAudio sound (engine hum, sirens, gunshots, mission jingles)
  — no audio files.

## Play it

```sh
node serve.ts
# open http://localhost:8080
```

| Key | Action |
| --- | ------ |
| W A S D | Move / drive |
| Shift | Sprint |
| Mouse drag | Look around |
| E | Enter / exit car |
| Click | Shoot (on foot) |
| Space | Brake |
| P | Pause |
| M | Mute |

## Screenshots

Taken from the game itself with `?shot=` (`shots.json`, seed 7): the title
over the plaza, driving a stolen car down 20th Ave, a 4-star police chase,
and the Beach Pickup mission.

## Tech

- three.js 0.186.1, vendored as `game/vendor/three.min.js` (MIT)
- Plain ES modules under `game/src/`, one file per system: `config`,
  `random`, `audio`, `city`, `vehicles`, `people`, `missions`, `hud`,
  `world`, `shots`, `main`
- `main.ts` (Node 22) hands the game in with the kit's `vendor/makefun-game.ts`
- Everything original: city, characters, vehicles, names, story, art and
  sound. No Rockstar / GTA names, art or assets.

## License

MIT — see [LICENSE](LICENSE).
