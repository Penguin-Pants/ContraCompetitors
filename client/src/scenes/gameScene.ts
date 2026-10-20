import type { Difficulty } from '@lr/shared/difficulty';
import { PIXEL_SCALE } from '@lr/shared/render';
import { animationFrame } from '../assets/manifest.ts';
import type { AudioOut } from '../audio/audio.ts';
import { LaserLoop, playSfx, type SfxName } from '../audio/sfx.ts';
import { assignFaces } from '../faces/assign.ts';
import type { FaceEntry, FaceStore } from '../faces/faceStore.ts';
import { PIXEL_HEAD, pixelateFace, sampleColors } from '../faces/pixelate.ts';
import {
  chooseFaceStyle,
  headWidthDevicePx,
  type FaceStyle,
  type FaceStyleSetting,
} from '../faces/quality.ts';
import { WEAPON_NAMES } from '../game/weapons.ts';
import { World, type WorldEvent } from '../game/world.ts';
import { buildLevel } from '../level/levelData.ts';
import { drawFar, drawLevel } from '../level/tilesDraw.ts';
import { drawBackground } from '../render/background.ts';
import { FaceLayer } from '../render/faceLayer.ts';
import type { Theme } from '../theme/palette.ts';
import { Hud } from '../ui/hud.ts';
import { PauseMenu } from '../ui/pause.ts';
import { FacePops, type PopSource } from '../vfx/facePop.ts';
import { EntityRenderer, type GameSheets } from './gameRender.ts';
import type { Scene, SceneContext } from './scene.ts';

export interface RunSetup {
  difficulty: Difficulty;
  theme: Theme;
  faces: FaceStore;
  faceStyle: FaceStyleSetting;
}

export interface GameCallbacks {
  onFinish(timeMs: number): void;
  onMainMenu(): void;
}

interface PreparedFace {
  entry: FaceEntry;
  pixelated: HTMLCanvasElement;
  colors: string[];
}

const SFX: Partial<Record<WorldEvent['type'], SfxName>> = {
  shoot: 'shoot',
  spread: 'spread',
  jump: 'jump',
  hit: 'hit',
  defeat: 'pop',
  pickup: 'pickup',
  'life-lost': 'lifeLost',
  exit: 'exit',
};

export function createGameScene(
  ctx: SceneContext,
  sheets: GameSheets,
  setup: RunSetup,
  audio: AudioOut,
  callbacks: GameCallbacks,
): Scene {
  const world = new World(buildLevel(), setup.difficulty);
  const hud = new Hud(ctx.layers.ui);
  const pause = new PauseMenu(ctx.layers.ui);
  const entities = new EntityRenderer(sheets);
  const faceLayer = new FaceLayer(ctx.layers);
  const pops = new FacePops();
  const laserLoop = new LaserLoop();
  let animMs = 0;
  let steps = 0;
  let notified = false;
  let draws = { l1: 0, l2: 0 };

  // Face style is decided once at run start and stays fixed for the run (THM-6).
  const entries = setup.faces.faces;
  const faceStyle: FaceStyle = chooseFaceStyle(
    entries.map((f) => f.srcWidth),
    headWidthDevicePx(ctx.layers.scale.k, ctx.layers.dpr),
    setup.faceStyle,
  );
  const prepared = new Map<string, PreparedFace>();
  const prepare = (entry: FaceEntry): PreparedFace => {
    let p = prepared.get(entry.id);
    if (!p) {
      const pixelated = pixelateFace(entry.bitmap, entry.srcWidth, entry.srcHeight);
      p = { entry, pixelated, colors: sampleColors(pixelated) };
      prepared.set(entry.id, p);
    }
    return p;
  };
  const assigned = assignFaces(entries, world.slotCount).map((f) => (f ? prepare(f) : null));
  const placeholderPop = new Map<number, PopSource>();
  const popSource = (slot: number): PopSource => {
    const face = assigned[slot];
    if (face) return { img: face.pixelated, grid: 'fine', colors: face.colors };
    let p = placeholderPop.get(slot);
    if (!p) {
      const canvas = entities.placeholder(slot).canvas;
      p = { img: canvas, grid: 'art', colors: sampleColors(canvas) };
      placeholderPop.set(slot, p);
    }
    return p;
  };

  const soundLabel = () => `Sound: ${audio.enabled ? 'On' : 'Off'}`;
  const resume = () => {
    pause.hide();
    ctx.input.takePresses();
    audio.resume();
  };
  pause.setItems([
    { label: 'Resume', action: resume },
    {
      label: 'Restart level',
      action: () => {
        world.restart();
        animMs = 0;
        resume();
      },
    },
    { label: 'Main menu', action: () => callbacks.onMainMenu() },
    {
      label: soundLabel(),
      action: () => {
        audio.setEnabled(!audio.enabled);
        pause.setLabel(3, soundLabel());
      },
    },
  ]);
  const offPause = ctx.input.onPress((a) => {
    if (a !== 'pause' || world.finished) return;
    if (pause.open) {
      resume();
    } else {
      pause.show();
      audio.suspend();
    }
  });

  const handleEvents = () => {
    for (const ev of world.takeEvents()) {
      const sfx = SFX[ev.type];
      if (sfx) playSfx(audio, sfx);
      if (ev.type === 'laser') {
        if (ev.on) laserLoop.start(audio);
        else laserLoop.stop();
      } else if (ev.type === 'restart' || ev.type === 'exit') {
        laserLoop.stop();
        if (ev.type === 'restart') pops.clear();
      } else if (ev.type === 'defeat') {
        pops.add(ev.enemy.centerX, ev.enemy.body.y + 16, popSource(ev.enemy.faceSlot));
      }
    }
  };

  const drawPlayer = () => {
    const pl = world.player;
    const b = pl.body;
    if (world.lives.invulnerable && Math.floor(world.lives.invulnSteps / 4) % 2 === 0) return;
    const sheet = sheets.player;
    const anims = sheet.spec.animations;
    const anim = !b.grounded ? anims.jump! : b.vx !== 0 ? anims.run! : anims.idle!;
    const frame = animationFrame(anim, animMs);
    const cam = world.camera;
    ctx.pixels.sprite(
      sheet.surfaces[frame]!,
      Math.round(b.x) - cam.x - 2,
      Math.round(b.y + b.h) - cam.y - sheet.feet[frame]!,
      pl.facing < 0,
    );
  };

  return {
    update(stepMs) {
      world.step((a) => ctx.input.isHeld(a), ctx.input.takePresses());
      handleEvents();
      pops.update(world.fx);
      if (world.timer.state !== 'waiting') {
        animMs += stepMs;
        steps++;
      }
      if (world.finished && !notified) {
        notified = true;
        callbacks.onFinish(world.timer.timeMs);
      }
    },
    frame(realMs) {
      world.frame(realMs);
    },
    render() {
      const cam = world.camera;
      drawBackground(ctx.layers, cam);
      const p = ctx.pixels;
      p.clear();
      faceLayer.clear();
      drawFar(p, cam);
      drawLevel(p, world.level, cam, setup.theme);
      entities.pickups(p, world, animMs);
      draws = { l1: 0, l2: 0 };
      for (const box of entities.enemies(p, world, animMs)) {
        const face = assigned[box.enemy.faceSlot];
        if (box.flashing) entities.flashHead(p, box);
        else if (!face) p.sprite(entities.placeholder(box.enemy.faceSlot), box.x, box.y);
        else if (faceStyle === 'smooth') {
          faceLayer.draw(face.entry.bitmap, box.x, box.y, box.size);
          draws.l2++;
        } else {
          p.fine(face.pixelated, box.x * PIXEL_SCALE, box.y * PIXEL_SCALE, PIXEL_HEAD, PIXEL_HEAD);
          draws.l1++;
        }
      }
      pops.draw(p, cam.x, cam.y);
      drawPlayer();
      entities.projectiles(p, world);
      entities.laser(p, world, steps);
      entities.particles(p, world);
      hud.setTime(world.timer.ms);
      hud.setLives(world.lives.count);
      hud.setWeapon(WEAPON_NAMES[world.weapon]);
    },
    paused: () => pause.open,
    world: () => world,
    state: () => {
      const b = world.player.body;
      return {
        scene: 'game',
        difficulty: world.difficulty,
        player: { x: b.x, y: b.y, grounded: b.grounded, blockedRight: b.blockedRight },
        timer: { state: world.timer.state, ms: world.timer.ms },
        lives: world.lives.count,
        weapon: world.weapon,
        laser: !!world.laser,
        enemies: world.enemies.filter((e) => e.alive).length,
        projectiles: world.projectiles.length,
        particles: world.fx.list.length,
        paused: pause.open,
        finished: world.finished,
        faceStyle,
        faceDraws: draws,
        faceIds: setup.faces.sortedIds(),
        theme: setup.theme,
        pops: pops.count,
        gain: audio.gain,
        audio: audio.ctx?.state ?? null,
      };
    },
    dispose() {
      offPause();
      laserLoop.stop();
      audio.resume();
      faceLayer.clear();
      hud.dispose();
      pause.dispose();
    },
  };
}
