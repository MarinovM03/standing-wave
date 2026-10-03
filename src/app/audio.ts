export type AudioStatus = 'off' | 'starting' | 'on';
export type AudioFailure = 'blocked' | 'interrupted';

const GAIN_PER_AMPLITUDE = 0.1;
const SUSPEND_DELAY_MS = 180;

export class NoteAudio {
  public onStatusChange?: (status: AudioStatus) => void;
  public onFailure?: (failure: AudioFailure) => void;

  private context: AudioContext | null = null;
  private oscillator: OscillatorNode | null = null;
  private gain: GainNode | null = null;
  private wanted = false;
  private resuming = false;
  private suspending = false;
  private status: AudioStatus = 'off';
  private disposed = false;
  private frequency = 60;
  private amplitude = 0;
  private suspendTimer: number | undefined;

  /** Call from a user gesture: browsers only let a gesture start audio. */
  start(): void {
    if (this.disposed || this.wanted) return;
    this.wanted = true;
    const existing = this.context?.state === 'closed' ? null : this.context;
    const context = existing ?? this.createContext();
    if (!context) {
      this.fail('blocked');
      return;
    }
    // Safari can hand back a new context suspended even inside a gesture, so a new one is always resumed.
    if ((!existing || context.state !== 'running' || this.suspending) && !this.resuming) {
      this.resuming = true;
      context.resume().then(() => this.resumed(context, true), () => this.resumed(context, false));
    }
    this.settle();
  }

  stop(): void {
    if (!this.wanted) return;
    this.wanted = false;
    this.settle();
  }

  update(frequency: number, amplitude: number): void {
    if (this.disposed) return;
    const nextFrequency = Number.isFinite(frequency) ? Math.min(20000, Math.max(20, frequency)) : 60;
    const nextAmplitude = Number.isFinite(amplitude) ? Math.min(1, Math.max(0, amplitude)) : 0;
    if (nextFrequency === this.frequency && nextAmplitude === this.amplitude) return;
    this.frequency = nextFrequency;
    this.amplitude = nextAmplitude;
    if (this.status === 'on') this.applyValues();
  }

  dispose(): void {
    if (this.disposed) return;
    this.wanted = false;
    this.settle();
    this.disposed = true;
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

  private createContext(): AudioContext | null {
    const AudioContextConstructor = window.AudioContext
      ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) return null;
    try {
      const context = new AudioContextConstructor();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = this.frequency;
      gain.gain.value = 0;
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      this.context?.removeEventListener('statechange', this.onContextStateChange);
      this.context = context;
      this.oscillator = oscillator;
      this.gain = gain;
      this.resuming = false;
      this.suspending = false;
      context.addEventListener('statechange', this.onContextStateChange);
      return context;
    } catch {
      return null;
    }
  }

  private settle(): void {
    window.clearTimeout(this.suspendTimer);
    const context = this.context;
    if (this.disposed || !context || context.state === 'closed') {
      if (this.wanted) this.fail('blocked');
      else this.setStatus('off');
      return;
    }
    if (this.wanted) {
      if (!this.resuming && context.state !== 'running') {
        this.fail('blocked');
        return;
      }
      this.setStatus(this.resuming ? 'starting' : 'on');
      this.applyValues();
      return;
    }
    this.setStatus('off');
    this.applyValues();
    if (context.state === 'running' && !this.resuming && !this.suspending) {
      this.suspendTimer = window.setTimeout(() => this.suspend(context), SUSPEND_DELAY_MS);
    }
  }

  private resumed(context: AudioContext, ok: boolean): void {
    this.resuming = false;
    if (context !== this.context) return;
    if (!ok && this.wanted) this.fail('blocked');
    else this.settle();
  }

  private suspend(context: AudioContext): void {
    if (this.wanted || this.resuming || this.suspending || context !== this.context || context.state !== 'running') return;
    this.suspending = true;
    context.suspend().catch(() => undefined).finally(() => {
      this.suspending = false;
      if (context === this.context) this.settle();
    });
  }

  private fail(failure: AudioFailure): void {
    this.wanted = false;
    this.settle();
    this.onFailure?.(failure);
  }

  private applyValues(): void {
    const { context, oscillator, gain } = this;
    if (!context || !oscillator || !gain || context.state === 'closed') return;
    const target = this.status === 'on' ? this.amplitude * GAIN_PER_AMPLITUDE : 0;
    if (context.state !== 'running') {
      gain.gain.cancelScheduledValues(0);
      gain.gain.value = target;
      oscillator.frequency.cancelScheduledValues(0);
      oscillator.frequency.value = this.frequency;
      return;
    }
    this.smooth(oscillator.frequency, this.frequency, 0.03);
    this.smooth(gain.gain, target, this.status === 'on' ? 0.035 : 0.025);
  }

  private smooth(parameter: AudioParam, value: number, timeConstant: number): void {
    const now = this.context!.currentTime;
    if (typeof parameter.cancelAndHoldAtTime === 'function') parameter.cancelAndHoldAtTime(now);
    else {
      const current = parameter.value;
      parameter.cancelScheduledValues(now);
      parameter.setValueAtTime(current, now);
    }
    parameter.setTargetAtTime(value, now, timeConstant);
  }

  private setStatus(status: AudioStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.onStatusChange?.(status);
  }

  private onContextStateChange = (): void => {
    if (this.status === 'on' && this.context?.state !== 'running') this.fail('interrupted');
    else this.settle();
  };
}
