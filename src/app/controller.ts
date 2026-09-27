import type { CityId, Content } from '../content/schema.ts';
import type { Command } from '../sim/commands.ts';
import { applyCommand, stepWorld, type CommandResult } from '../sim/step.ts';
import { calNow } from '../sim/time.ts';
import { createWorld, type World } from '../sim/world.ts';
import { clearSave, contentHash, writeSave, writeSaveSync, type SaveFile } from './save.ts';

// The controller owns the real-time loop around the pure sim:
//  - fixed 20 Hz steps driven by requestAnimationFrame with an accumulator
//    clamped to tuning.maxFrameMs, so a stalled tab never fast-forwards;
//  - pause semantics chosen by the owner: manual pause, a hidden tab and a
//    blurred window all freeze the sim AND the ranked clock, and veil the board
//    until the player explicitly resumes (docs/PLAN.md §1);
//  - the ranked run clock, which is sim time (ticks x 50 ms);
//  - autosave (one continuous slot).

/** 'help' / 'read': paused while How to play or the Hall of Records page is open (no veil, so it can be read). */
export type PauseReason = 'manual' | 'hidden' | 'blur' | 'help' | 'read';

export interface RunClock {
  /** Ranked clock: sim time only. Stops whenever the game is paused. */
  simMs: number;
  /** Times the run was paused (recorded for transparency, not penalised). */
  pauses: number;
  /** Times the run was resumed from a save. */
  sessions: number;
}

export interface NewRunConfig {
  seed: string;
  homeCity: CityId;
  tavernName?: string;
  playerName?: string;
  timerScale?: number;
  ngPlus?: number;
  debug?: boolean;
  /** Guided tutorial: unranked, and never saved over a real run. */
  tutorial?: boolean;
}

type Listener = () => void;

export class GameController {
  readonly content: Content;
  readonly world: World;
  readonly debug: boolean;
  /** Tutorial runs are unranked and not saved. */
  readonly tutorial: boolean;
  /** Sim speed multiplier: only >1 in debug runs (unranked). */
  speed = 1;
  private pending: Command[] = [];
  private pauseReason: PauseReason | null = null;
  private pauses = 0;
  private sessions = 0;
  private acc = 0;
  private last = 0;
  private raf = 0;
  private running = false;
  private listeners = new Set<Listener>();
  private feedback: CommandResult[] = [];
  private readonly stepMs: number;
  private lastSegment = '';
  private autosave = true;

  constructor(content: Content, cfg: NewRunConfig | { save: SaveFile; debug?: boolean }) {
    this.content = content;
    if ('save' in cfg) {
      this.world = cfg.save.world;
      this.pauses = cfg.save.clock.pauses;
      this.sessions = cfg.save.clock.sessions + 1;
      this.debug = !!cfg.debug;
      this.tutorial = false;
      // A resumed run starts paused, behind the veil.
      this.pauseReason = 'manual';
    } else {
      this.debug = !!cfg.debug;
      this.tutorial = !!cfg.tutorial;
      if (this.tutorial) this.autosave = false;
      this.world = createWorld(
        { seed: cfg.seed, homeCity: cfg.homeCity, tavernName: cfg.tavernName, playerName: cfg.playerName, timerScale: cfg.timerScale, ngPlus: cfg.ngPlus },
        content,
      );
    }
    this.stepMs = 1000 / content.time.ticksPerSecond;
    this.lastSegment = this.world.events.lastSegment;
  }

  /** Disable autosave (tests, bots). */
  noAutosave(): this {
    this.autosave = false;
    return this;
  }

  get paused(): PauseReason | null {
    return this.pauseReason;
  }

  get clock(): RunClock {
    return { simMs: this.world.tick * this.stepMs, pauses: this.pauses, sessions: this.sessions };
  }

  calendar() {
    return calNow(this.world, this.content.time);
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  dispatch(cmd: Command): void {
    this.pending.push(cmd);
    // While paused (or the run is over) apply UI commands at once so menus still respond.
    if (this.pauseReason || this.world.run.status !== 'playing' && this.world.run.status !== 'freeplay') this.flushWithoutTick();
  }

  private flushWithoutTick(): void {
    const cmds = this.pending;
    this.pending = [];
    const res = stepWorldNoTick(this.world, this.content, cmds);
    this.feedback.push(...res);
    this.emit();
  }

  /** Command results since the last call (for toasts). */
  takeFeedback(): CommandResult[] {
    const f = this.feedback;
    this.feedback = [];
    return f;
  }

  private advance(): void {
    const cmds = this.pending;
    this.pending = [];
    const res = stepWorld(this.world, this.content, cmds);
    if (res.length) this.feedback.push(...res);
    if (this.world.events.lastSegment !== this.lastSegment) {
      this.lastSegment = this.world.events.lastSegment;
      if (this.autosave) void this.save();
    }
  }

  /** Advances exactly n ticks, synchronously. Used by tests and the debug hooks. */
  step(n = 1): void {
    for (let i = 0; i < n; i++) this.advance();
    this.emit();
  }

  pause(reason: PauseReason): void {
    if (this.pauseReason) return;
    this.pauseReason = reason;
    this.pauses += 1;
    if (reason === 'hidden' && this.autosave) void this.save();
    this.emit();
  }

  resume(): void {
    if (!this.pauseReason) return;
    this.pauseReason = null;
    this.acc = 0;
    this.last = performance.now();
    this.emit();
  }

  saveFile(): SaveFile {
    return { v: this.world.meta.v, contentHash: contentHash(), clock: { pauses: this.pauses, sessions: this.sessions }, world: this.world };
  }

  async save(): Promise<void> {
    const s = this.world.run.status;
    if (this.debug || this.tutorial) return;
    if (s === 'won' || s === 'lost' || s === 'bankrupt') {
      clearSave();
      return;
    }
    await writeSave(this.saveFile());
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
    window.addEventListener('pagehide', this.onPageHide);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('pagehide', this.onPageHide);
  }

  private tick(now: number): void {
    const dt = Math.min(now - this.last, this.content.time.maxFrameMs);
    this.last = now;
    if (this.pauseReason) return;
    const s = this.world.run.status;
    if (s === 'won' || s === 'lost' || s === 'bankrupt') return;
    this.acc += dt * this.speed;
    let steps = 0;
    while (this.acc >= this.stepMs && steps < 40) {
      this.advance();
      this.acc -= this.stepMs;
      steps++;
    }
    if (steps >= 40) this.acc = 0;
    if (steps > 0) this.emit();
  }

  private onVisibility = (): void => {
    if (document.visibilityState === 'hidden') this.pause('hidden');
  };

  private onBlur = (): void => {
    this.pause('blur');
  };

  private onPageHide = (): void => {
    const s = this.world.run.status;
    if (this.autosave && !this.debug && s !== 'won' && s !== 'lost' && s !== 'bankrupt') writeSaveSync(this.saveFile());
  };
}

function stepWorldNoTick(w: World, c: Content, cmds: Command[]): CommandResult[] {
  return cmds.map((cmd) => ({ cmd, result: applyCommand(w, c, cmd) }));
}
