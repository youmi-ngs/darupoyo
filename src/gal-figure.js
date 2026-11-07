// A resident's gal, dressed in that resident's theme color. Used for the gals
// standing in the house, the 「おかえり」 at the door, praise, and the picture
// on けーじばん cards that have no photo.
import { GALS } from './data.js';
import { THEMES } from './themes.js';

const S = 'stroke="#3B2560" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"';
// Things a gal holds while doing a chore (24x24, drawn like the rest of the house).
export const PROPS = {
  dryer: '<svg viewBox="0 0 32 32" aria-hidden="true"><g ' + S + '><path d="M4 9h15a6 6 0 0 1 0 12H4z" fill="#D9C2FF"/><path d="M10 21l-2 9h6l2-9z" fill="#D9C2FF"/><path d="M26 11h4M26 15h5M26 19h4" stroke-width="2"/></g></svg>',
  laundry: '<svg viewBox="0 0 32 32" aria-hidden="true"><g ' + S + '><path d="M10 5q6 5 12 0l7 4-3 7-3-1v14H9V15l-3 1-3-7z" fill="var(--outfit, #A8E6FF)"/></g></svg>',
  meal: '<svg viewBox="0 0 32 32" aria-hidden="true"><g ' + S + '><path d="M4 15h24q-1 12-12 12T4 15z" fill="#FFFFFF"/><path d="M7 15q1-8 9-8t9 8" fill="#FFF4A8"/><path d="M22 3l-6 10M26 4l-7 10" stroke-width="2"/></g></svg>',
  trash: '<svg viewBox="0 0 32 32" aria-hidden="true"><g ' + S + '><path d="M7 29q-4-12 5-18l-2-5q6 3 12 0l-2 5q9 6 5 18z" fill="#E6F7A0"/><path d="M12 16q4 2 8 0" fill="none" stroke-width="2"/></g></svg>',
  darupoyo: '<svg viewBox="0 0 32 32" aria-hidden="true"><g ' + S + ' fill="none"><path d="M6 10h8l-8 9h8" stroke-width="3"/><path d="M18 4h7l-7 8h7" stroke-width="2.4"/></g></svg>',
  heart: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 28S3 20 3 11a6.5 6.5 0 0 1 13-1 6.5 6.5 0 0 1 13 1c0 9-13 17-13 17z" fill="#FF8FCB" stroke="#3B2560" stroke-width="2.5" stroke-linejoin="round"/></svg>',
};

export const outfitOf = theme => THEMES[theme]?.accent || THEMES.pink.accent;

// Full-body gal: face, body in the outfit color, arms, legs and an optional prop.
export function galCharacter(galId, theme, prop, className = '') {
  const gal = GALS[galId] || GALS.reiwa;
  return '<div class="resident-character ' + className + '" style="--avatar-color:' + outfitOf(theme) + ';--outfit:' + outfitOf(theme) + '">'
    + '<span class="resident-face">' + gal.svg + '</span>'
    + '<span class="resident-body"><i class="arm left"></i><i class="arm right"></i><i class="legs"></i></span>'
    + '<span class="resident-prop" aria-hidden="true">' + (PROPS[prop] || '') + '</span></div>';
}

// Round face icon with the shoulders of the outfit showing at the bottom.
export function galIcon(galId, theme) {
  const gal = GALS[galId] || GALS.reiwa;
  return '<span class="gal-face has-outfit" style="background:' + gal.bg + ';--outfit:' + outfitOf(theme) + '">' + gal.svg + '</span>';
}
