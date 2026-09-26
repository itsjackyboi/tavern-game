import type { CityId, Content } from '../content/schema.ts';
import type { Command } from '../sim/commands.ts';
import { stepWorld } from '../sim/step.ts';
import { calendarAt } from '../sim/time.ts';
import { createWorld, type World } from '../sim/world.ts';

// The controller owns the real-time loop around the pure sim:
//  - fixed 20 Hz steps driven by requestAnimationFrame with an accumulator
//    clamped to tuning.maxFrameMs, so a stalled tab never fast-forwards;
//  - pause semantics chosen by the owner: manual pause, a hidden tab and a
//    blurred window all freeze the sim AND the ranked clock, and veil the board
//    until the player explicitly resumes (docs/PLAN.md §1);
//  - the ranked run clock, which is sim time (ticks x 50 ms).

export type PauseReason = 'manual' | 'hidden' | 'blur';

export interface RunClock {
  /** Ranked clock: sim time only. Stops whenever the game is paused. */
  simMs: number;
  /** Number of times the run was paused (recorded for transparency, not penalised). */
  pauses: number;
}

type Listener = () => void;

export class GameController {
  readonly content: Content;
  readonly world: World;
  readonly debug: boolean;
  private pending: Command[] = [];
  private pauseReason: PauseReason | null = null;
  private pauses = 0;
  private acc = 0;
  private last = 0;
  private raf = 0;
  private running = false;
  private listeners = new Set<Listener>();
  private readonly stepMs: number;

  constructor(content: Content, opts: { seed: string; homeCity: CityId; debug?: boolean }) {
    this.content = content;
    this.debug = !!opts.debug;
    this.world = createWorld({ seed: opts.seed, homeCity: opts.homeCity }, content);
    this.stepMs = 1000 / content.time.ticksPerSecond;
  }

  get paused(): PauseReason | null {
    return this.pauseReason;
  }

  get clock(): RunClock {
    return { simMs: this.world.tick * this.stepMs, pauses: this.pauses };
  }

  calendar() {
    return calendarAt(this.world.tick, this.content.time);
  }

  /** Subscribe to state changes (throttled by the UI, not here). Returns an unsubscribe fn. */
  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  dispatch(cmd: Command): void {
    this.pending.push(cmd);
  }

  /** Advances exactly n ticks, synchronously. Used by tests and the debug hooks. */
  step(n = 1): void {
    for (let i = 0; i < n; i++) {
      const cmds = this.pending;
      this.pending = [];
      stepWorld(this.world, this.content, cmds);
    }
    this.emit();
  }

  pause(reason: PauseReason): void {
    if (this.pauseReason) return;
    this.pauseReason = reason;
    this.pauses += 1;
    this.emit();
  }

  /** Only an explicit player action resumes; the veil stays up until then. */
  resume(): void {
    if (!this.pauseReason) return;
    this.pauseReason = null;
    this.acc = 0;
    this.last = performance.now();
    this.emit();
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const frame = (now: number) => {
      if (!this.running) return;
      this.tick(now);
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('blur', this.onBlur);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('blur', this.onBlur);
  }

  private tick(now: number): void {
    const dt = Math.min(now - this.last, this.content.time.maxFrameMs);
    this.last = now;
    if (this.pauseReason) return;
    this.acc += dt;
    let steps = 0;
    while (this.acc >= this.stepMs) {
      const cmds = this.pending;
      this.pending = [];
      stepWorld(this.world, this.content, cmds);
      this.acc -= this.stepMs;
      steps++;
    }
    if (steps > 0) this.emit();
  }

  private onVisibility = (): void => {
    if (document.visibilityState === 'hidden') this.pause('hidden');
  };

  private onBlur = (): void => {
    this.pause('blur');
  };
}
