import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { appIconGal, setAppIcon } from '../src/app-icon.js';

test('every furniture file used by the rooms exists and has an #art group (#101)', () => {
  const pages = readFileSync('index.html', 'utf8') + readFileSync('src/legacy.js', 'utf8');
  const used = [...pages.matchAll(/\/furniture\/([a-z-]+?)(?:-' \+ \(lit \? 'day' : 'night'\) \+ '|)\.svg#art/g)].map(m => m[1]);
  // The home redesign keeps only the furniture in the sketches (door, table, vanity, plant, room set).
  assert.ok(used.length >= 8, 'furniture references found: ' + used.length);
  const files = used.flatMap(name => name === 'room-window' ? ['room-window-day', 'room-window-night'] : [name]);
  for (const name of files) {
    const path = 'public/furniture/' + name + '.svg';
    assert.ok(existsSync(path), path);
    assert.match(readFileSync(path, 'utf8'), /<g id="art"/, path);
  }
});

test('the home-screen icon follows the chosen gal, and 「ノリで」 uses 姫ギャル (#110)', () => {
  assert.equal(appIconGal('kuro'), 'kuro');
  assert.equal(appIconGal('random'), 'hime');
  assert.equal(appIconGal(undefined), 'hime');
  const links = { 'apple-touch-icon': {}, icon: {}, manifest: {} };
  const doc = { querySelector: sel => { const rel = sel.match(/rel="([^"]+)"/)[1]; return { setAttribute: (_, v) => { links[rel].href = v; } }; } };
  setAppIcon('reiwa', doc);
  assert.deepEqual(Object.fromEntries(Object.entries(links).map(([k, v]) => [k, v.href])), { 'apple-touch-icon': '/icons/gal-reiwa-180.png', icon: '/icons/gal-reiwa-192.png', manifest: '/manifest-reiwa.webmanifest' });
  setAppIcon('random', doc);
  assert.equal(links.manifest.href, '/manifest.webmanifest');
  for (const id of ['heisei', 'reiwa', 'kuro', 'hime']) {
    for (const n of [180, 192, 512]) assert.ok(existsSync(`public/icons/gal-${id}-${n}.png`), id + n);
    const manifest = JSON.parse(readFileSync(id === 'hime' ? 'public/manifest.webmanifest' : `public/manifest-${id}.webmanifest`, 'utf8'));
    for (const icon of manifest.icons) assert.ok(existsSync('public' + icon.src), icon.src);
  }
});
