// Home-screen icon = the gal you chose (#110). 「ノリで」(random) uses 姫ギャル, the default icon.
// iOS reads apple-touch-icon and Android/Chrome reads the manifest when the page is added to the home screen,
// so the links are switched as soon as the choice is known. An icon already on the home screen does not change
// until it is added again (an OS limitation).
const ICON_GALS = ['heisei', 'reiwa', 'kuro', 'hime'];
export function appIconGal(pref) { return ICON_GALS.includes(pref) ? pref : 'hime'; }
export function setAppIcon(pref, doc = document) {
  const id = appIconGal(pref);
  const link = (rel) => doc.querySelector('link[rel="' + rel + '"]');
  link('apple-touch-icon')?.setAttribute('href', '/icons/gal-' + id + '-180.png');
  link('icon')?.setAttribute('href', '/icons/gal-' + id + '-192.png');
  link('manifest')?.setAttribute('href', id === 'hime' ? '/manifest.webmanifest' : '/manifest-' + id + '.webmanifest');
  return id;
}
