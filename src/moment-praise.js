// The gal's line on a 「うちらのなう」 selfie (Figma 261:793): her face in the poster's color and
// a speech bubble, like the line after a chore. Her name is there for screen readers.
import { GALS } from './data.js';
import { galIcon } from './gal-figure.js';

export function momentPraise(praise, theme = 'pink') {
  if (!praise?.text) return null;
  const id = GALS[praise.gal] ? praise.gal : 'reiwa';
  const line = document.createElement('div'); line.className = 'moment-praise verdict';
  line.innerHTML = galIcon(id, theme);
  const who = document.createElement('b'); who.className = 'sr-only'; who.textContent = GALS[id].name;
  const bubble = document.createElement('p'); bubble.className = 'bubble';
  const text = document.createElement('span'); text.className = 'gal-text'; text.textContent = praise.text;
  bubble.append(who, text); line.append(bubble);
  return line;
}
