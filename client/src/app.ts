import type { IngestResponse } from '@lr/shared/api';
import { ApiError, ingest } from './api/client.ts';
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
import { ErrorView } from './ui/errors.ts';
import { LeaderboardView } from './ui/leaderboard.ts';
import { LoadingView } from './ui/loading.ts';
import { UploadView } from './ui/upload.ts';
import { MIN_FACES } from './faces/quality.ts';

const DEFAULT_PICK: readonly [string, string] = ['#ffb300', '#4fc3f7'];

/** Host for the loading label. The server validates the URL; a bad one gets its error screen. */
function hostLabel(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/** Screen flow: main menu, color picker, run, post-game. */
export class App {
  scene: Scene;
  private readonly ctx: SceneContext;
  private readonly audio: AudioOut;
  private readonly base: GameSheets;
  private readonly menu: MainMenu;
  private readonly picker: ColorPicker;
  private readonly post: PostGame;
  private readonly loading: LoadingView;
  private readonly errors: ErrorView;
  private readonly upload: UploadView;
  private readonly faces = new FaceStore();
  /** The Top 10 view of the shown post-game screen. */
  private leaderboard: LeaderboardView | null = null;
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
    this.loading = new LoadingView(ui);
    this.errors = new ErrorView(ui);
    this.upload = new UploadView(ui);
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
    this.leaderboard?.cancel();
    this.post.hide();
    this.setScene(createIdleScene(this.ctx));
    this.menu.show();
  }

  /** Ingests the site, resolves faces and colors, then starts a run. */
  async start(choice: MenuChoice) {
    this.audio.unlock();
    this.menu.hide();
    this.loading.show(hostLabel(choice.url));
    let data: IngestResponse;
    try {
      data = await ingest(choice.url);
    } catch (err) {
      this.loading.hide();
      const code = err instanceof ApiError ? err.code : 'unreachable';
      const back = () => this.showMenu();
      // E-4: rate limit shows a message only; no ingestion ran.
      if (code === 'rate_limited') return this.errors.show(code, { back });
      // E-1, E-2, D-3: retry or the manual path (upload and color picker).
      return this.errors.show(code, {
        retry: () => void this.start(choice),
        manual: () => void this.manual(choice),
        back,
      });
    }
    this.loading.hide();
    this.faces.clear();
    await this.faces.addDtos(data.faces, 'site');
    if (this.faces.size < MIN_FACES || data.partial) await this.askUpload(data.partial);
    const theme = await this.resolveColors(data.colors, data.partial);
    this.begin(choice, theme);
  }

  /** Manual path after a failed ingestion: upload faces, then pick colors (D-3). */
  private async manual(choice: MenuChoice) {
    this.faces.clear();
    await this.askUpload(false);
    this.begin(choice, await this.resolveColors([], false));
  }

  private askUpload(partial: boolean) {
    return this.upload.ask(this.faces.size, partial, (faces) =>
      this.faces.addDtos(faces, 'upload'),
    );
  }

  /**
   * THM-8, E-5, E-6, D-3: no colors opens the picker; 1 color or unreadable colors are adjusted.
   * After a partial ingestion the picker always opens, prefilled with the adjusted colors.
   */
  private async resolveColors(colors: readonly string[], partial: boolean): Promise<Theme> {
    if (colors.length > 0 && !partial) return makeReadable(colors);
    const found = colors.length > 0 ? makeReadable(colors) : null;
    const prefill: [string, string] = found ? [found.primary, found.secondary] : [...DEFAULT_PICK];
    const note = found
      ? 'The scan hit the time limit. Check the brand colors it found.'
      : 'No brand colors found. Pick two colors.';
    return makeReadable(await this.picker.open(prefill, note));
  }

  private begin(choice: MenuChoice, theme: Theme) {
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
    this.leaderboard?.cancel();
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
    this.leaderboard?.cancel();
    this.leaderboard = null;
    if (this.setup) {
      this.leaderboard = new LeaderboardView(
        this.post.slot,
        this.setup.difficulty,
        timeMs,
        crypto.randomUUID(),
      );
      void this.leaderboard.start();
    }
  }

  playAgain() {
    this.startRun();
  }
}
