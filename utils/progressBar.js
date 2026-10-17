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
    const width = opts.width || 440;
    const height = opts.height || 24;
    const radius = opts.radius || 12;
    const accent = opts.accent || '#22C55E';
    const track = opts.track || '#1F2937';
    const bg = opts.bg || 'transparent';
    const label = opts.label || null;
    const labelFont = opts.labelFont || '500 14px sans-serif';
    const filled = opts.filled || 0;
    const total = opts.total || 1;

    const labelPad = label ? 56 : 0;
    const canvas = createCanvas(width + labelPad, height);
    const ctx = canvas.getContext('2d');

    if (bg !== 'transparent') { 
      ctx.fillStyle = bg; 
      ctx.fillRect(0, 0, canvas.width, canvas.height); 
    }

    ctx.fillStyle = track;
    roundRect(ctx, 0, 0, width, height, radius);
    ctx.fill();

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

    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 1;
    roundRect(ctx, 0.5, 0.5, width - 1, height - 1, radius);
    ctx.stroke();

    if (label) {
      ctx.fillStyle = '#E5E7EB';
      ctx.font = labelFont;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, width + 12, height / 2 + 1);
    }

    return canvas.toBuffer('image/png');
  } catch (err) {
    warn('[canvas] Failed to render progress bar: ' + err.message);
    // Return a minimal valid 1x1 transparent PNG so the bot doesn't crash
    const fallbackB64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    return Buffer.from(fallbackB64, 'base64');
  }
}