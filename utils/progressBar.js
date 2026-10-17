// language: JavaScript (ESM), file: utils/progressBar.js
import { createCanvas } from '@napi-rs/canvas';
import { warn } from './logger.js';

const roundRect = (ctx, x, y, w, h, r) => {
  const rr = Math.min(r, h / 2, w / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y,     x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x,     y + h, rr);
  ctx.arcTo(x,     y + h, x,     y,     rr);
  ctx.arcTo(x,     y,     x + w, y,     rr);
  ctx.closePath();
};

export function renderProgressBar(opts) {
  try {
    // Thick dimensions to match SenAI
    const width = opts.width || 460;
    const height = opts.height || 28;
    const radius = opts.radius || 14;
    
    const accent = opts.accent || '#4C8DFF'; // SenAI bright blue
    const track = opts.track || '#2B2D31';
    const bg = opts.bg || 'transparent';
    
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    if (bg !== 'transparent') { 
      ctx.fillStyle = bg; 
      ctx.fillRect(0, 0, canvas.width, canvas.height); 
    }

    // 1. Dark Track
    ctx.fillStyle = track;
    roundRect(ctx, 0, 0, width, height, radius);
    ctx.fill();

    // 2. Colored Fill
    const filled = opts.filled || 0;
    const total = opts.total || 1;
    const ratio = total > 0 ? Math.max(0, Math.min(1, filled / total)) : 0;
    
    if (ratio > 0) {
      ctx.save();
      roundRect(ctx, 0, 0, width, height, radius);
      ctx.clip();
      ctx.fillStyle = accent;
      roundRect(ctx, 0, 0, width * ratio, height, radius);
      ctx.fill();
      ctx.restore();
    }

    // 3. Bright Inner Border (The key to the SenAI look)
    ctx.strokeStyle = '#8BB4FF'; // Lighter blue border
    ctx.lineWidth = 3;
    roundRect(ctx, 1.5, 1.5, width - 3, height - 3, radius - 1.5);
    ctx.stroke();

    return canvas.toBuffer('image/png');
  } catch (err) {
    warn('[canvas] Failed to render progress bar: ' + err.message);
    const fallbackB64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    return Buffer.from(fallbackB64, 'base64');
  }
}
