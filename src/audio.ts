export class ToneAudio {
  public onStateChange?: (enabled: boolean) => void;

  private context: AudioContext | null = null;
  private oscillator: OscillatorNode | null = null;
  private gain: GainNode | null = null;
  private enabled = false;
  private disposed = false;
  private frequency = 60;
  private amplitude = 0;
  private generation = 0;
  private suspendTimer: number | undefined;

  constructor() {
    document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  /** Must be called from a user gesture. A suspended tab never resumes itself. */
  async enable(): Promise<boolean> {
    if (this.disposed || document.hidden) return false;
    const generation = ++this.generation;
    window.clearTimeout(this.suspendTimer);

    try {
      if (!this.context || this.context.state === 'closed') {
        const AudioContextConstructor = window.AudioContext
          ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioContextConstructor) return false;

        const context = new AudioContextConstructor();
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.value = this.frequency;
        gain.gain.value = 0;
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start();

        this.context = context;
        this.oscillator = oscillator;
        this.gain = gain;
        context.addEventListener('statechange', this.onContextStateChange);
      }

      const context = this.context;
      await context.resume();
      if (generation !== this.generation || this.disposed || document.hidden) return false;
      if (context.state !== 'running') {
        this.setEnabled(false);
        return false;
      }
      this.setEnabled(true);
      this.applyValues();
      return true;
    } catch {
      if (generation === this.generation) this.disable();
      return false;
    }
  }

  disable(): void {
    ++this.generation;
    window.clearTimeout(this.suspendTimer);
    this.setEnabled(false);
    const context = this.context;
    if (!context || context.state === 'closed') return;
    if (this.gain) {
      if (context.state === 'running') this.smooth(this.gain.gain, 0, 0.025);
      else {
        this.gain.gain.cancelScheduledValues(0);
        this.gain.gain.value = 0;
      }
    }
    this.suspendTimer = window.setTimeout(() => {
      if (!this.enabled && context.state !== 'closed') void context.suspend().catch(() => {});
    }, 180);
  }

  update(frequency: number, amplitude: number): void {
    if (this.disposed) return;
    const nextFrequency = Number.isFinite(frequency) ? Math.min(20000, Math.max(20, frequency)) : 60;
    const nextAmplitude = Number.isFinite(amplitude) ? Math.min(1, Math.max(0, amplitude)) : 0;
    if (nextFrequency === this.frequency && nextAmplitude === this.amplitude) return;
    this.frequency = nextFrequency;
    this.amplitude = nextAmplitude;
    if (this.enabled) this.applyValues();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disable();
    this.disposed = true;
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    window.clearTimeout(this.suspendTimer);

    const context = this.context;
    const oscillator = this.oscillator;
    const gain = this.gain;
    this.context = null;
    this.oscillator = null;
    this.gain = null;
    if (!context) return;
    context.removeEventListener('statechange', this.onContextStateChange);
    if (oscillator && context.state !== 'closed') oscillator.stop(context.currentTime + 0.09);
    window.setTimeout(() => {
      oscillator?.disconnect();
      gain?.disconnect();
      if (context.state !== 'closed') void context.close().catch(() => {});
    }, 110);
  }

  private applyValues(): void {
    if (!this.context || !this.oscillator || !this.gain) return;
    this.smooth(this.oscillator.frequency, this.frequency, 0.03);
    this.smooth(this.gain.gain, this.enabled ? this.amplitude * 0.1 : 0, 0.035);
  }

  private smooth(parameter: AudioParam, value: number, timeConstant: number): void {
    if (!this.context || this.context.state === 'closed') return;
    const now = this.context.currentTime;
    if (typeof parameter.cancelAndHoldAtTime === 'function') parameter.cancelAndHoldAtTime(now);
    else {
      const current = parameter.value;
      parameter.cancelScheduledValues(now);
      parameter.setValueAtTime(current, now);
    }
    parameter.setTargetAtTime(value, now, timeConstant);
  }

  private setEnabled(value: boolean): void {
    if (this.enabled === value) return;
    this.enabled = value;
    this.onStateChange?.(value);
  }

  private onVisibilityChange = (): void => {
    if (document.hidden) this.disable();
  };

  private onContextStateChange = (): void => {
    if (this.enabled && this.context?.state !== 'running') this.disable();
  };
}
