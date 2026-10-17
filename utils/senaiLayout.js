// language: JavaScript (ESM), file: utils/senaiLayout.js
import { createCanvas } from '@napi-rs/canvas';
import { warn } from './logger.js';

export async function renderSenAIProgressBar(index, totalQuestions, correct) {
  try {
    const width = 500;
    const height = 110;
    
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    
    // Background to match Discord dark mode
    ctx.fillStyle = '#2B2D31';
    ctx.fillRect(0, 0, width, height);

    // 1. Draw the text "1. Question 1"
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '26px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(index + '. Question ' + index, 20, 20);

    // 2. Draw the percentage box
    const pct = Math.round((correct / totalQuestions) * 100);
    const pctText = pct + '%';
    
    ctx.font = 'bold 20px sans-serif';
    const textWidth = ctx.measureText(pctText).width;
    const boxWidth = textWidth + 24;
    const boxHeight = 36;
    
    // Position the box right after the text
    const textWidthMain = ctx.measureText(index + '. Question ' + index).width;
    const boxX = 20 + textWidthMain + 15; 
    const boxY = 18;

    // Draw sharp square background for percentage (no curves)
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
    ctx.fillText(pctText, boxX + (boxWidth / 2), boxY + (boxHeight / 2) + 2);

    // 3. Draw the square progress bar
    const barY = 70;
    const barHeight = 24;
    const barWidth = 460;
    
    // Dark track
    ctx.fillStyle = '#1E1F22';
    ctx.fillRect(20, barY, barWidth, barHeight);

    // Colored fill
    const ratio = correct / totalQuestions;
    ctx.fillStyle = '#5865F2'; // Discord blue
    ctx.fillRect(20, barY, barWidth * ratio, barHeight);

    // Thick blue border (the SenAI look)
    ctx.strokeStyle = '#5865F2';
    ctx.lineWidth = 4;
    ctx.strokeRect(20, barY, barWidth, barHeight);

    return canvas.toBuffer('image/png');
  } catch (err) {
    warn('[senai] render failed: ' + err.message);
    return null;
  }
}
