// language: JavaScript (ESM), file: utils/senaiLayout.js
import { createCanvas } from '@napi-rs/canvas';
import { warn } from './logger.js';

export async function renderSenAIProgressBar(index, totalQuestions, correct) {
  try {
    const width = 450;
    const height = 90;
    
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    
    // Fill background with Discord's dark embed color
    ctx.fillStyle = '#2B2D31';
    ctx.fillRect(0, 0, width, height);
    
    // 1. Draw the text "1. Question 1"
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '24px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(index + '. Question ' + index, 10, 12);
    
    // 2. Draw the percentage box
    const pct = Math.round((correct / totalQuestions) * 100);
    const pctText = pct + '%';
    
    ctx.font = 'bold 18px sans-serif';
    const textWidth = ctx.measureText(pctText).width;
    const boxWidth = textWidth + 20;
    const boxHeight = 30;
    
    // Position the box right after the text
    const textWidthMain = ctx.measureText(index + '. Question ' + index).width;
    const boxX = 10 + textWidthMain + 12;
    const boxY = 10;
    
    // Draw dark box background
    ctx.fillStyle = '#1E1F22';
    ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
    
    // Draw subtle border around percentage box
    ctx.strokeStyle = '#4E5058';
    ctx.lineWidth = 2;
    ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);
    
    // Draw the percentage text
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(pctText, boxX + (boxWidth / 2), boxY + (boxHeight / 2) + 1);
    
    // 3. Draw the square progress bar
    const barY = 55;
    const barHeight = 20;
    const barWidth = 430;
    
    // Dark track
    ctx.fillStyle = '#1E1F22';
    ctx.fillRect(10, barY, barWidth, barHeight);
    
    // Colored fill
    const ratio = correct / totalQuestions;
    ctx.fillStyle = '#5865F2'; // Discord blue
    ctx.fillRect(10, barY, barWidth * ratio, barHeight);
    
    // Thick blue border
    ctx.strokeStyle = '#5865F2';
    ctx.lineWidth = 3;
    ctx.strokeRect(10, barY, barWidth, barHeight);
    
    return canvas.toBuffer('image/png');
  } catch (err) {
    warn('[senai] render failed: ' + err.message);
    return null;
  }
}
