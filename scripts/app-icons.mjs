// Builds one home-screen icon per gal (#110) from the gal faces in src/data.js.
// Usage: node scripts/app-icons.mjs
//   → public/icons/gal-<id>.svg and public/manifest-<id>.webmanifest (hime uses the default manifest.webmanifest).
// PNGs (macOS): for id in heisei reiwa kuro hime; do qlmanage -t -s 512 -o /tmp public/icons/gal-$id.svg;
//   for n in 512 192 180; do sips -s format png -z $n $n /tmp/gal-$id.svg.png --out public/icons/gal-$id-$n.png; done; done
//   The default icons (icon-192/512, apple-touch-icon) are copies of the hime ones, used for 「ノリで」.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { GALS, GAL_IDS } from '../src/data.js';

mkdirSync('public/icons', { recursive: true });
for (const id of GAL_IDS) {
  const g = GALS[id];
  const face = g.svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<defs><clipPath id="c"><circle cx="256" cy="256" r="196"/></clipPath><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFE6F4"/><stop offset="1" stop-color="#E3D9FF"/></linearGradient></defs>
<rect width="512" height="512" fill="url(#bg)"/>
<circle cx="256" cy="256" r="196" fill="${g.bg}" stroke="#3B2560" stroke-width="10"/>
<g clip-path="url(#c)"><g transform="translate(45 52) scale(6.6)">${face}</g></g>
<circle cx="256" cy="256" r="196" fill="none" stroke="#3B2560" stroke-width="10"/>
</svg>`;
  writeFileSync(`public/icons/gal-${id}.svg`, svg);
  console.log('wrote public/icons/gal-' + id + '.svg');
}

const base = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8'));
for (const id of GAL_IDS.filter(id => id !== 'hime')) {
  const icons = [
    { src: `/icons/gal-${id}-192.png`, sizes: '192x192', type: 'image/png' },
    { src: `/icons/gal-${id}-512.png`, sizes: '512x512', type: 'image/png' },
    { src: `/icons/gal-${id}-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ];
  writeFileSync(`public/manifest-${id}.webmanifest`, JSON.stringify({ ...base, icons }, null, 2) + '\n');
  console.log('wrote public/manifest-' + id + '.webmanifest');
}
