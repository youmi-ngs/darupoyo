// #158: the gal's line on a 「みんなの今」 selfie, with the gal's face and name.
import { GALS } from './data.js';

export function momentPraise(praise) {
  if (!praise?.text) return null;
  const gal = GALS[praise.gal] || GALS.reiwa;
  const line = document.createElement('p'); line.className = 'moment-praise';
  const face = document.createElement('span'); face.className = 'moment-praise-face'; face.innerHTML = gal.svg; face.style.background = gal.bg;
  const who = document.createElement('b'); who.textContent = gal.name;
  const text = document.createElement('span'); text.textContent = praise.text;
  line.append(face, who, text);
  return line;
}
