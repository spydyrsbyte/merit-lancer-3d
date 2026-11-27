/*
  An Animated is what animate gives back: one animation as it plays on an actor, to be
  steered from outside.

    name      unique for the actor: the name it was started with and a number
    state     activity: running 1, stopped 0, paused -1
              sliceSpeed, speedLocked, loop, whether it has no end, and pauseOn

  It can be stopped, paused and resumed, and its speed changed while it plays. Once
  stopped, by itself at its end or by another one in its place, it stays stopped.

  pauseOn names a mark to pause on: it stops right at that moment, before the mark is
  passed, and pauses, as if it were told to. Resumed, it passes the mark and goes on. It
  pauses there once; pauseOn("") forgets it. So a game can get an attack ready and let
  it go when the dice are rolled.

  One which could not be started is stopped from the start, and says why.
*/

const RUNNING = 1;
const STOPPED = 0;
const PAUSED = -1;

export class Animated {
  #end;

  constructor({ name = "", key = "", place = "", isBody = false, player = null, sliceSpeed = 0, speedLocked = false, pauseOn = "", reason = "" }, end = () => null) {
    this.name = name;
    this.key = key;
    this.place = place;
    this.isBody = isBody;
    this.player = player;
    this.reason = reason;
    this.sliceSpeed = sliceSpeed;
    this.speedLocked = speedLocked;
    this.pauseMark = pauseOn;
    this.activity = player ? RUNNING : STOPPED;

    this.#end = end;
  }

  get state() {
    const { activity, sliceSpeed, speedLocked, pauseMark } = this;

    return { activity, sliceSpeed, speedLocked, loop: this.player?.loop ?? false, pauseOn: pauseMark };
  }

  get isRunning() {
    return this.activity === RUNNING;
  }

  stop() {
    if (this.activity === STOPPED) return;

    this.activity = STOPPED;
    this.#end(this);
  }

  pause() {
    if (this.activity === RUNNING) this.activity = PAUSED;
  }

  pauseOn(mark) {
    this.pauseMark = typeof mark === "string" ? mark : "";
  }

  reachedMark() {
    this.pauseMark = "";
    this.pause();
  }

  resume() {
    if (this.activity === PAUSED) this.activity = RUNNING;
  }

  ended() {
    this.activity = STOPPED;
  }

  setSliceSpeed(value) {
    if (typeof value === "number" && Number.isFinite(value)) this.sliceSpeed = value;
  }

  setSpeedLocked(value) {
    this.speedLocked = value === true;
  }
}
