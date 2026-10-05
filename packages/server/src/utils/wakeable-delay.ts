export class WakeableDelay {
  private wakeUp?: () => void;
  private wokenEarly = false;

  wait(ms: number): Promise<boolean> {
    if (this.wokenEarly) {
      this.wokenEarly = false;
      return Promise.resolve(true);
    }
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.wakeUp = undefined;
        resolve(false);
      }, ms);
      this.wakeUp = () => {
        clearTimeout(timer);
        this.wakeUp = undefined;
        resolve(true);
      };
    });
  }

  wake(): void {
    if (this.wakeUp) {
      this.wakeUp();
      return;
    }
    this.wokenEarly = true;
  }
}
