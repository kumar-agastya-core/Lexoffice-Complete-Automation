export class RateLimiter {
  private readonly intervalMs: number;
  private lastRequestAt = 0;

  constructor(intervalMs = 1100) {
    this.intervalMs = intervalMs;
  }

  async wait(): Promise<void> {
    const now = Date.now();
    const gap = this.intervalMs - (now - this.lastRequestAt);
    if (gap > 0) await new Promise(resolve => setTimeout(resolve, gap));
    this.lastRequestAt = Date.now();
  }

  reset(): void {
    this.lastRequestAt = 0;
  }
}
