import { ingest } from './api/client.ts';
import { loadBaseSheets, tintSheets } from './assets/sheets.ts';
import type { AudioOut } from './audio/audio.ts';
import { FaceStore } from './faces/faceStore.ts';
import { createGameScene, type RunSetup } from './scenes/gameScene.ts';
import type { GameSheets } from './scenes/gameRender.ts';
import { createIdleScene } from './scenes/idleScene.ts';
import type { Scene, SceneContext } from './scenes/scene.ts';
import { ColorPicker } from './theme/colorPicker.ts';
import { NEUTRAL_THEME, type Theme } from './theme/palette.ts';
import { makeReadable } from './theme/readability.ts';
import { AboutView } from './ui/about.ts';
import { createFooter } from './ui/footer.ts';
import { MainMenu, type MenuChoice } from './ui/mainMenu.ts';
import { PostGame } from './ui/postGame.ts';

const DEFAULT_PICK: readonly [string, string] = ['#ffb300', '#4fc3f7'];

/** Screen flow: main menu, color picker, run, post-game. */
export class App {
  scene: Scene;
  private readonly ctx: SceneContext;
  private readonly audio: AudioOut;
  private readonly base: GameSheets;
  private readonly menu: MainMenu;
  private readonly picker: ColorPicker;
  private readonly post: PostGame;
  private readonly faces = new FaceStore();
  private setup: RunSetup | null = null;
  private tinted: { theme: Theme; sheets: GameSheets } | null = null;

  static async create(ctx: SceneContext, audio: AudioOut): Promise<App> {
    return new App(ctx, audio, await loadBaseSheets());
  }

  private constructor(ctx: SceneContext, audio: AudioOut, base: GameSheets) {
    this.ctx = ctx;
    this.audio = audio;
    this.base = base;
    const ui = ctx.layers.ui;
    const about = new AboutView(ui);
    this.menu = new MainMenu(
      ui,
      createFooter(() => about.show()),
      (c) => void this.start(c),
    );
    this.picker = new ColorPicker(ui);
    this.post = new PostGame(
      ui,
      () => this.playAgain(),
      () => this.showMenu(),
    );
    this.scene = createIdleScene(ctx);
    this.applyTheme(NEUTRAL_THEME);
    this.showMenu();
  }

  private applyTheme(theme: Theme) {
    const root = document.documentElement.style;
    root.setProperty('--primary', theme.primary);
    root.setProperty('--secondary', theme.secondary);
  }

  private setScene(scene: Scene) {
    this.scene.dispose?.();
    this.scene = scene;
  }

  showMenu() {
    this.ctx.input.enabled = false;
    this.ctx.input.clear();
    this.post.hide();
    this.setScene(createIdleScene(this.ctx));
    this.menu.show();
  }

  /** Ingests the site, resolves colors and starts a run. */
  async start(choice: MenuChoice) {
    this.audio.unlock();
    this.menu.hide();
    const data = await ingest(choice.url).catch(() => null);
    this.faces.clear();
    if (data) await this.faces.addDtos(data.faces, 'site');
    const colors = data?.colors ?? [];
    const theme =
      colors.length > 0
        ? makeReadable(colors)
        : makeReadable(
            await this.picker.open(DEFAULT_PICK, 'No brand colors found. Pick two colors.'),
          );
    this.setup = {
      difficulty: choice.difficulty,
      faceStyle: choice.faceStyle,
      theme,
      faces: this.faces,
    };
    this.startRun();
  }

  private sheetsFor(theme: Theme): GameSheets {
    if (!this.tinted || this.tinted.theme !== theme) {
      this.tinted = { theme, sheets: tintSheets(this.base, theme) };
    }
    return this.tinted.sheets;
  }

  /** Starts a run with the current setup. Play again reuses it with no network call (I-3). */
  startRun() {
    const setup = this.setup;
    if (!setup) return;
    this.post.hide();
    this.applyTheme(setup.theme);
    this.setScene(
      createGameScene(this.ctx, this.sheetsFor(setup.theme), setup, this.audio, {
        onFinish: (timeMs) => this.finish(timeMs),
        onMainMenu: () => this.showMenu(),
      }),
    );
    this.ctx.input.clear();
    this.ctx.input.enabled = true;
  }

  private finish(timeMs: number) {
    this.ctx.input.enabled = false;
    this.post.show(timeMs);
  }

  playAgain() {
    this.startRun();
  }
}
