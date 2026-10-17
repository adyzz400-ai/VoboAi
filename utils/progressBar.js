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
    const height = opts.height || 32;
    const radius = opts.radius || 16;
    const accent = opts.accent || '#00A8E1';
    const track = opts.track || '#1E3A4C';
    const bg = opts.bg || 'transparent';
    const label = opts.label || null;
    
    // Increased label padding to fit the score text
    const labelPad = label ? 130 : 0;
    const canvas = createCanvas(width + labelPad, height);
    const ctx = canvas.getContext('2d');

    if (bg !== 'transparent') { 
      ctx.fillStyle = bg; 
      ctx.fillRect(0, 0, canvas.width, canvas.height); 
    }

    // Draw track
    ctx.fillStyle = track;
    roundRect(ctx, 0, 0, width, height, radius);
    ctx.fill();

    // Draw fill
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

    // Draw inner border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 2;
    roundRect(ctx, 1, 1, width - 2, height - 2, radius - 1);
    ctx.stroke();

    // Draw label
    if (label) {
      ctx.fillStyle = '#FFFFFF';
      // Slightly smaller font so it fits in the padding
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, width + 12, height / 2);
    }

    return canvas.toBuffer('image/png');
  } catch (err) {
    warn('[canvas] Failed to render progress bar: ' + err.message);
    const fallbackB64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    return Buffer.from(fallbackB64, 'base64');
  }
}
