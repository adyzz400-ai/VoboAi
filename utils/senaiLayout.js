// language: JavaScript (ESM), file: utils/senaiLayout.js
import { createCanvas } from '@napi-rs/canvas';
import { warn } from './logger.js';

export async function renderSenAIProgressBar(index, totalQuestions, correct) {
  try {
    const width = 460;
    const height = 16; // Height of the pill
    
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    
    const radius = height / 2; // Fully rounded pill ends
    
    // 1. Draw the dark background track
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.roundRect(0, 0, width, height, radius);
    ctx.fill();
    
    // 2. Draw the green fill
    const ratio = correct / totalQuestions;
    if (ratio > 0) {
      ctx.fillStyle = '#32C05E'; // The bright green from your image
      // We only draw the fill up to the ratio. 
      // To keep the left edge rounded but the right edge flat, we clip it.
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(0, 0, width, height, radius);
      ctx.clip();
      ctx.fillRect(0, 0, width * ratio, height);
      ctx.restore();
    }
    
    return canvas.toBuffer('image/png');
  } catch (err) {
    warn('[senai] render failed: ' + err.message);
    return null;
  }
}
