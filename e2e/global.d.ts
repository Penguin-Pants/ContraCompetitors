export {};

declare global {
  interface Window {
    __lr?: { advance(frames: number): void; state(): unknown; world(): unknown };
  }
}
