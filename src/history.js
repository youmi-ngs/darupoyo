// Records a resident left in their other houses (#99). The Backend only answers
// for the resident themself, or when they turned on sharing for this house.
import { houseApi } from './api.js';

const cache = new Map(); // `${house}:${uid}` → Promise<posts>
const urls = new Map();

function mediaUrl(who, source, id) {
  const key = source + '/' + id;
  if (!urls.has(key)) urls.set(key, houseApi('/members/' + encodeURIComponent(who) + '/history/' + source + '/media/' + id).then(URL.createObjectURL));
  return urls.get(key);
}

// Resolves to raw posts (Backend shape) with `image`, `foreign` and `loadMedia(id)` added.
export function otherHouseRecords(house, who, allowed) {
  if (!allowed) return Promise.resolve([]);
  const key = house + ':' + who;
  if (!cache.has(key)) {
    cache.set(key, (async () => {
      const items = []; let cursor;
      do {
        const page = await houseApi('/members/' + encodeURIComponent(who) + '/history' + (cursor ? '?before=' + encodeURIComponent(cursor) : ''));
        items.push(...page.items); cursor = page.next_cursor;
      } while (cursor);
      return { items };
    })().then(async ({ items }) => Promise.all(items.map(async p => ({
      ...p, user_id: who, foreign: true, reactions: {}, comments: [], sync_with: [],
      image: p.media_id ? await mediaUrl(who, p.source_house_id, p.media_id).catch(() => null) : null,
      loadMedia: id => mediaUrl(who, p.source_house_id, id),
    })))).catch(() => { cache.delete(key); return []; }));
  }
  return cache.get(key);
}

// Sharing changed or a new record: forget what we fetched.
export function forgetHistory() { cache.clear(); }
