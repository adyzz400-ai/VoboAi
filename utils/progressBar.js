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
    const width = opts.width || 460;
    const height = opts.height || 32;
    const radius = opts.radius || 16;
    
    const accent = opts.accent || '#4C8DFF';
    const track = opts.track || '#2B2D31';
    const bg = opts.bg || 'transparent';
    const label = opts.label || null;
    const labelFont = opts.labelFont || 'bold 16px sans-serif';
    const filled = opts.filled || 0;
    const total = opts.total || 1;

    const labelPad = label ? 60 : 0;
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

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 2;
    roundRect(ctx, 1, 1, width - 2, height - 2, radius - 1);
    ctx.stroke();

    if (label) {
      ctx.fillStyle = '#FFFFFF';
      ctx.font = labelFont;
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

export function renderMultiBar(opts) {
  try {
    const bars = opts.bars || [];
    const width = opts.width || 440;
    const height = opts.height || 22;
    const gap = opts.gap || 10;
    const radius = opts.radius || 11;
    const accent = opts.accent || '#22C55E';
    const track = opts.track || '#1F2937';
    const bg = opts.bg || 'transparent';
    const labelFont = opts.labelFont || '500 14px sans-serif';
    const labelWidth = opts.labelWidth || 150;

    const totalH = bars.length * height + (bars.length - 1) * gap;
    const canvas = createCanvas(width + labelWidth + 70, totalH);
    const ctx = canvas.getContext('2d');
    
    if (bg !== 'transparent') { 
      ctx.fillStyle = bg; 
      ctx.fillRect(0, 0, canvas.width, canvas.height); 
    }

    bars.forEach((b, i) => {
      const y = i * (height + gap);
      
      ctx.fillStyle = '#E5E7EB';
      ctx.font = labelFont;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(b.label ?? `Task ${i + 1}`, 0, y + height / 2 + 1);

      const barX = labelWidth;
      ctx.fillStyle = track;
      roundRect(ctx, barX, y, width, height, radius);
      ctx.fill();

      const ratio = b.total > 0 ? Math.max(0, Math.min(1, b.filled / b.total)) : 0;
      if (ratio > 0) {
        ctx.save();
        roundRect(ctx, barX, y, width, height, radius);
        ctx.clip();
        ctx.fillStyle = accent;
        roundRect(ctx, barX, y, width * ratio, height, radius);
        ctx.fill();
        ctx.restore();
      }

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = 2;
      roundRect(ctx, barX + 1, y + 1, width - 2, height - 2, radius - 1);
      ctx.stroke();

      ctx.fillStyle = '#E5E7EB';
      ctx.font = labelFont;
      ctx.textAlign = 'right';
      ctx.fillText(`${Math.round(ratio * 100)}%`, barX + width + 50, y + height / 2 + 1);
    });

    return canvas.toBuffer('image/png');
  } catch (err) {
    warn('[canvas] Failed to render multi bar: ' + err.message);
    return null;
  }
}
