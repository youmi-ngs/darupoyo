// Resident theme colors (same order as backend/src/app/themes.py). One color per
// resident in a house: it paints their room, the clothes they hang and their gal's outfit.
export const THEMES = {
  pink:   { name: 'ピンク',     accent: '#FFB3DE', wall: ['#FFF0F8', '#FFE6F3'], rug: '#FFE6F4' },
  cyan:   { name: 'みずいろ',   accent: '#A8E6FF', wall: ['#EEF9FF', '#E2F4FF'], rug: '#E2F6FF' },
  lilac:  { name: 'ライラック', accent: '#D9C2FF', wall: ['#F6EEFF', '#EFE4FF'], rug: '#F0E6FF' },
  lime:   { name: 'ライム',     accent: '#E6F7A0', wall: ['#F8FCE6', '#F1F8D6'], rug: '#F5FCD6' },
  peach:  { name: 'ピーチ',     accent: '#FFC9A8', wall: ['#FFF4EC', '#FFEADD'], rug: '#FFEDE0' },
  mint:   { name: 'ミント',     accent: '#A6E3C2', wall: ['#EEFBF4', '#E1F6EA'], rug: '#E4F7EC' },
  cream:  { name: 'クリーム',   accent: '#FFE08A', wall: ['#FFFBEC', '#FFF4D6'], rug: '#FFF6DE' },
  night:  { name: 'ナイト',     accent: '#8F86C9', wall: ['#E9E6F5', '#DEDAF0'], rug: '#E6E2F6' },
  coral:  { name: 'コーラル',   accent: '#FF9B9B', wall: ['#FFF1F1', '#FFE5E5'], rug: '#FFE8E8' },
  sky:    { name: 'スカイ',     accent: '#8DB8FF', wall: ['#EEF4FF', '#E2ECFF'], rug: '#E5EEFF' },
  grape:  { name: 'グレープ',   accent: '#B98AE6', wall: ['#F5EEFC', '#EDE2F8'], rug: '#F0E6FA' },
  leaf:   { name: 'リーフ',     accent: '#94D38E', wall: ['#F0FAEE', '#E4F5E1'], rug: '#E7F7E4' },
  orange: { name: 'オレンジ',   accent: '#FFB870', wall: ['#FFF6EC', '#FFEDDA'], rug: '#FFF0DF' },
  teal:   { name: 'ティール',   accent: '#7FD6CF', wall: ['#EDFAF8', '#DFF4F2'], rug: '#E3F6F4' },
  berry:  { name: 'ベリー',     accent: '#F28AD0', wall: ['#FDEFF8', '#F9E2F2'], rug: '#FBE6F4' },
  cocoa:  { name: 'ココア',     accent: '#C9A27E', wall: ['#F8F1EA', '#F0E5DA'], rug: '#F3E9DF' },
};
export const THEME_IDS = Object.keys(THEMES);

// Each resident's color, as the Backend settles it: earlier residents keep theirs,
// later ones with a missing or repeated color get the first free one.
export function residentThemes(house) {
  const used = new Set(), out = {};
  for (const uid of house?.member_ids || []) {
    let theme = house.members[uid]?.theme;
    if (!THEMES[theme] || used.has(theme)) theme = THEME_IDS.find(t => !used.has(t));
    used.add(theme); out[uid] = theme;
  }
  return out;
}
