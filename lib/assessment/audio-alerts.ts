/**
 * Web Audio API gentle sound alerts for mock test timing warnings.
 * Safe fallback if browser blocks autoplay or audio context is unavailable.
 */

class MockAudioAlerts {
  private audioCtx: AudioContext | null = null;
  private isMuted: boolean = false;

  private getAudioContext(): AudioContext | null {
    if (typeof window === "undefined") return null;

    try {
      if (!this.audioCtx) {
        const win = window as unknown as {
          AudioContext?: typeof AudioContext;
          webkitAudioContext?: typeof AudioContext;
        };
        const AudioCtxClass = win.AudioContext || win.webkitAudioContext;
        if (AudioCtxClass) {
          this.audioCtx = new AudioCtxClass();
        }
      }
      if (this.audioCtx && this.audioCtx.state === "suspended") {
        this.audioCtx.resume().catch(() => {});
      }
      return this.audioCtx;
    } catch {
      return null;
    }
  }

  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    return this.isMuted;
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  /**
   * Plays a subtle, gentle reminder beep at 520Hz.
   */
  public playReminderBeep(durationMs: number = 250, frequency: number = 520): void {
    if (this.isMuted) return;

    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(frequency, ctx.currentTime);

      // Smooth attack and release envelope to prevent clicking
      gain.gain.setValueAtTime(0.001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationMs / 1000);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + durationMs / 1000);
    } catch {
      // Audio playback blocked or unsupported — fail gracefully
    }
  }

  /**
   * Plays a double urgency alert tone for 1-minute warning.
   */
  public playUrgentDoubleBeep(): void {
    if (this.isMuted) return;

    this.playReminderBeep(180, 600);
    setTimeout(() => {
      this.playReminderBeep(240, 600);
    }, 240);
  }
}

export const MockAudio = new MockAudioAlerts();
