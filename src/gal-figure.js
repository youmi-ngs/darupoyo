// A resident's gal, dressed in that resident's theme color. Used for the gals
// standing in the house, the 「おかえり」 at the door, praise, and the picture
// on けーじばん cards that have no photo.
import { GALS, galFaceImg, outfitLayer } from './data.js';
import { THEMES } from './themes.js';

const S = 'stroke="#3B2560" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"';
// Things a gal holds while doing a chore (24x24, drawn like the rest of the house).
export const PROPS = {
  dryer: '<svg viewBox="0 0 32 32" aria-hidden="true"><g ' + S + '><path d="M4 9h15a6 6 0 0 1 0 12H4z" fill="#D9C2FF"/><path d="M10 21l-2 9h6l2-9z" fill="#D9C2FF"/><path d="M26 11h4M26 15h5M26 19h4" stroke-width="2"/></g></svg>',
  laundry: '<svg viewBox="0 0 32 32" aria-hidden="true"><g ' + S + '><path d="M10 5q6 5 12 0l7 4-3 7-3-1v14H9V15l-3 1-3-7z" fill="#FFFFFF"/></g></svg>',
  meal: '<svg viewBox="0 0 32 32" aria-hidden="true"><g ' + S + '><path d="M4 15h24q-1 12-12 12T4 15z" fill="#FFFFFF"/><path d="M7 15q1-8 9-8t9 8" fill="#FFF4A8"/><path d="M22 3l-6 10M26 4l-7 10" stroke-width="2"/></g></svg>',
  trash: '<svg viewBox="0 0 32 32" aria-hidden="true"><g ' + S + '><path d="M7 29q-4-12 5-18l-2-5q6 3 12 0l-2 5q9 6 5 18z" fill="#E6F7A0"/><path d="M12 16q4 2 8 0" fill="none" stroke-width="2"/></g></svg>',
  darupoyo: '<svg viewBox="0 0 32 32" aria-hidden="true"><g ' + S + ' fill="none"><path d="M6 10h8l-8 9h8" stroke-width="3"/><path d="M18 4h7l-7 8h7" stroke-width="2.4"/></g></svg>',
  heart: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 28S3 20 3 11a6.5 6.5 0 0 1 13-1 6.5 6.5 0 0 1 13 1c0 9-13 17-13 17z" fill="#FF8FCB" stroke="#3B2560" stroke-width="2.5" stroke-linejoin="round"/></svg>',
};

export const outfitOf = theme => THEMES[theme]?.accent || THEMES.pink.accent;

// Full-body gal (the cut-out picture, dress in the theme color) with an optional prop in her hands.
export function galCharacter(galId, theme, prop, className = '') {
  const gal = GALS[galId] || GALS.reiwa;
  return '<div class="resident-character ' + className + '" style="--avatar-color:' + outfitOf(theme) + ';--outfit:' + outfitOf(theme) + '">'
    + '<img class="resident-art" src="' + gal.full + '" alt="" draggable="false">'
    + outfitLayer('/gals/' + (GALS[galId] ? galId : 'reiwa') + '-outfit-full.png', 'resident-outfit')
    + '<span class="resident-prop" aria-hidden="true">' + (PROPS[prop] || '') + '</span></div>';
}

// Round face icon cut from the same picture, dress in the theme color.
export function galIcon(galId, theme) {
  const id = GALS[galId] ? galId : 'reiwa';
  return '<span class="gal-face" style="background:' + GALS[id].bg + ';--outfit:' + outfitOf(theme) + '">' + galFaceImg(id) + '</span>';
}
