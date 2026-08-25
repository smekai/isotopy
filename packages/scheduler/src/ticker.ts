export class Ticker {
  private handle?: NodeJS.Timeout;

  constructor(
    private readonly intervalMs: number,
    private readonly onTick: () => Promise<unknown>,
    private readonly onError: (error: unknown) => void,
  ) {}

  start(): void {
    if (this.handle) {
      return;
    }
    this.handle = setInterval(() => {
      this.onTick().catch(this.onError);
    }, this.intervalMs);
    this.handle.unref();
  }

  stop(): void {
    if (this.handle) {
      clearInterval(this.handle);
      this.handle = undefined;
    }
  }
}
