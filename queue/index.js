// language: JavaScript (ESM), file: queue/index.js
// *Concurrency-N FIFO. Default N=1 (Render starter-safe). Advance on task completion/failure/cancel.*
import { EventEmitter } from 'node:events';
import { config } from '../utils/config.js';
import { log, warn } from '../utils/logger.js';

class Queue extends EventEmitter {
  constructor(concurrency) {
    super();
    this.concurrency = Math.max(1, concurrency | 0);
    this.running = new Map(); // taskId -> Task
    this.waiting = [];        // Task[]
  }

  enqueue(task) {
    this.waiting.push(task);
    this.emit('enqueued', task);
    this._pump();
    return task;
  }

  position(task) {
    if (this.running.has(task.id)) return { running: true, position: 0, ahead: 0 };
    const idx = this.waiting.indexOf(task);
    if (idx < 0) return null;
    return { running: false, position: idx + 1, ahead: idx };
  }

  remove(task) {
    const idx = this.waiting.indexOf(task);
    if (idx >= 0) { this.waiting.splice(idx, 1); task.cancel(); this.emit('removed', task); return true; }
    return false;
  }

  size() { return { running: this.running.size, waiting: this.waiting.length }; }

  _pump() {
    while (this.running.size < this.concurrency && this.waiting.length) {
      const task = this.waiting.shift();
      this._start(task);
    }
  }

  async _start(task) {
    task._started = true;
    this.running.set(task.id, task);
    this.emit('start', task);
    log(`[queue] start ${task.id} kind=${task.kind} user=${task.userId} running=${this.running.size} waiting=${this.waiting.length}`);

    let timer;
    try {
      await Promise.race([
        (async () => { if (task.onStart) await task.onStart(); await task.run(); })(),
        new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('task timeout')), task.timeoutMs); }),
      ]);
      this.emit('finish', task, null);
    } catch (err) {
      warn(`[queue] fail ${task.id}: ${err?.message || err}`);
      this.emit('finish', task, err);
    } finally {
      clearTimeout(timer);
      this.running.delete(task.id);
      this._pump();
    }
  }
}

export const queue = new Queue(config.queueConcurrency);
