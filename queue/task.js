// language: JavaScript (ESM), file: queue/task.js
// *A single queued unit of work. kind distinguishes login (fast) from run (long).*
let seq = 0;
export class Task {
  constructor({ userId, kind, run, onStart, timeoutMs = 15 * 60 * 1000 }) {
    this.id = `task_${++seq}`;
    this.userId = userId;
    this.kind = kind;
    this.run = run;
    this.onStart = onStart;
    this.timeoutMs = timeoutMs;
    this.enqueuedAt = Date.now();
    this._cancelled = false;
    this._started = false;
  }
  cancel() { this._cancelled = true; }
  get cancelled() { return this._cancelled; }
  get started()   { return this._started; }
}
