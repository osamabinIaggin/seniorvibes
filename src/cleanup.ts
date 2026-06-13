/**
 * State machine for directive auto-removal. Pure — no `vscode`, no real timers — so the
 * "reset the countdown when the cursor leaves the directive" logic is unit-testable.
 *
 * Rules:
 *  - While the cursor is on the directive, the countdown is paused (timer cleared).
 *  - The moment the cursor leaves the directive, the countdown (re)starts from zero.
 *  - Moving the cursor around elsewhere (already off the directive) does NOT restart it.
 *  - When the timer fires with the cursor off the directive, the directive is deleted;
 *    if the cursor happens to be on it, nothing happens (a later leave re-arms it).
 */
export interface CleanupHost {
  /** (Re)start the delay timer from zero. */
  setTimer(): void;
  /** Cancel any pending timer. */
  clearTimer(): void;
  /** Perform the deletion. */
  delete(): void;
}

export class DirectiveCleanupMachine {
  private wasOnDirective = false;

  constructor(private readonly host: CleanupHost) {}

  /** Called once after generation, with whether the cursor starts on the directive. */
  start(cursorOnDirective: boolean): void {
    this.wasOnDirective = cursorOnDirective;
    if (cursorOnDirective) {
      this.host.clearTimer();
    } else {
      this.host.setTimer();
    }
  }

  /** Called on every cursor move. */
  cursorMoved(cursorOnDirective: boolean): void {
    if (cursorOnDirective) {
      this.host.clearTimer();
    } else if (this.wasOnDirective) {
      // Just left the directive — reset the countdown.
      this.host.setTimer();
    }
    // else: already off the directive and still off — let the timer keep running.
    this.wasOnDirective = cursorOnDirective;
  }

  /** Called when the delay timer fires. */
  timerFired(cursorOnDirective: boolean): void {
    if (cursorOnDirective) {
      return; // raced onto the directive; a later leave will re-arm
    }
    this.host.delete();
  }
}
