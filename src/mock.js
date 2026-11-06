// In-browser stand-in for the Backend API (backend/docs/api.md), used only in development
// when no Backend answers. Same paths and response shapes; data stays in this browser.
// Tabs of the same browser share it through localStorage, so two tabs can play two users.
const KEY = 'darupoyo-mock';
const LABELS = { laundry: '洗濯', meal: 'ごはん', dryer: 'ドライヤー', garbage: 'ゴミ捨て' };
const REWARDS = { laundry: 'いい匂いの服', meal: 'ツヤ肌', dryer: '美髪', garbage: 'スッキリ玄関' };
const media = new Map(); // fallback when localStorage is full

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}
function save(db) {
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch {}
}
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
const fail = (status, detail) => json({ detail }, status);
const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date());
const newDay = day => ({ day, goals: {}, completed: {}, poses: {}, recent: [], latest: {} });
const postId = now => now.toISOString().replace(/[-:Z]/g, '').replace('.', '') + '000_' + crypto.randomUUID().replace(/-/g, '');
const blobToDataUrl = blob => new Promise(resolve => { const r = new FileReader(); r.onload = () => resolve(r.result); r.readAsDataURL(blob); });

export async function mockFetch(url, init = {}) {
  const { pathname, searchParams } = new URL(url, location.origin);
  const path = pathname.replace(/^.*?\/api/, '');
  const method = init.method || 'GET';
  const uid = (init.headers?.Authorization || '').replace(/^Bearer dev:/, '');
  const body = typeof init.body === 'string' ? JSON.parse(init.body) : init.body;
  const db = load(); db.houses ||= {}; db.invites ||= {}; db.days ||= {}; db.posts ||= {}; db.media ||= {}; db.requests ||= {};

  if (path === '/config') return json({ auth_mode: 'dev', timezone: 'Asia/Tokyo', firebase: {}, mock: true });
  if (!uid) return fail(401, 'Local token format: dev:alice');
  if (path === '/me') return json({ uid });
  if (path === '/houses' && method === 'GET') return json({ items: Object.values(db.houses).filter(h => h.member_ids.includes(uid)) });
  if (path === '/houses' && method === 'POST') {
    const id = crypto.randomUUID();
    db.houses[id] = { id, name: body.name, owner_id: uid, member_ids: [uid], members: { [uid]: { display_name: body.display_name } }, created_at: new Date().toISOString() };
    save(db); return json(db.houses[id], 201);
  }
  if (path === '/join') {
    const compact = body.token.replace(/[\s-]/g, ''), invite = db.invites[compact.length === 8 ? compact.toUpperCase() : body.token];
    if (!invite || Date.parse(invite.expires_at) <= Date.now()) return fail(404, 'Invite not found or expired');
    const house = db.houses[invite.house_id];
    if (!house.member_ids.includes(uid)) {
      if (house.member_ids.length >= 6) return fail(409, 'House is full');
      house.member_ids.push(uid); house.members[uid] = { display_name: body.display_name }; save(db);
    }
    return json(house);
  }

  const match = path.match(/^\/houses\/([^/]+)(\/.*)?$/);
  if (!match) return fail(404, 'API not found');
  const [, houseId, rest = ''] = match, house = db.houses[houseId];
  if (!house || !house.member_ids.includes(uid)) return fail(404, 'House not found');
  const day = today(), dayKey = houseId + '/' + day;
  const state = db.days[dayKey] || newDay(day);
  const posts = Object.values(db.posts).filter(p => p.house_id === houseId);

  if (rest === '' && method === 'PUT') { house.name = body.name.trim(); save(db); return json(house); }
  if (rest === '/invites') {
    const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', token = Array.from(crypto.getRandomValues(new Uint8Array(8)), n => abc[n % 32]).join(''), expires_at = new Date(Date.now() + 7 * 86400000).toISOString();
    db.invites[token] = { house_id: houseId, expires_at }; save(db); return json({ token, expires_at }, 201);
  }
  if (rest === '/dashboard') {
    const shown = db.days[houseId + '/' + (searchParams.get('day') || day)] || newDay(searchParams.get('day') || day);
    const lights = Object.fromEntries(house.member_ids.map(m => [m, !!shown.completed[m]?.length]));
    return json({ house, state: shown, lights, happiness: Math.round(100 * Object.values(lights).filter(Boolean).length / house.member_ids.length), timezone: 'Asia/Tokyo' });
  }
  if (rest === '/goals') { state.goals[uid] = [...new Set(body.chores)]; db.days[dayKey] = state; save(db); return json(state); }
  if (rest === '/profile') {
    if (body.theme) house.members[uid].theme = body.theme;
    if (body.display_name) house.members[uid].display_name = body.display_name.trim();
    save(db); return json(house);
  }
  if (rest === '/media' && method === 'POST') {
    const id = crypto.randomUUID(), data = await blobToDataUrl(body);
    media.set(id, body);
    db.media[id] = { id, owner_id: uid, house_id: houseId, kind: searchParams.get('kind') };
    save(db);
    // Images are large; keep them in localStorage only while there is room.
    try { localStorage.setItem(KEY + '-media-' + id, data); } catch {}
    return json({ id, kind: db.media[id].kind }, 201);
  }
  const mediaMatch = rest.match(/^\/media\/(.+)$/);
  if (mediaMatch) {
    const id = mediaMatch[1];
    if (media.has(id)) return new Response(media.get(id));
    let data = null; try { data = localStorage.getItem(KEY + '-media-' + id); } catch {}
    return data ? fetch(data) : fail(404, 'Image not found');
  }
  if (rest === '/completions') {
    const prior = db.requests[uid + ':' + body.request_id];
    if (prior) return json({ post: db.posts[prior], created: false });
    const now = new Date(), id = postId(now), chore = body.chore;
    const first = !state.poses[chore] && body.method === 'pose';
    let template = state.poses[chore];
    if (body.reference_post_id && template?.post_id !== body.reference_post_id) return fail(409, 'Pose reference changed; fetch today\'s pose and retry');
    if (first) template = state.poses[chore] = { user_id: uid, post_id: id, media_id: body.media_id, name: body.pose_name || '今日のオリジナルポーズ', landmarks: body.landmarks };
    const sync = Object.entries(state.latest[chore] || {}).filter(([other, at]) => other !== uid && now - Date.parse(at) <= 300000).map(([other]) => other);
    const post = { id, house_id: houseId, user_id: uid, day, chore, method: body.method, created_at: now.toISOString(), media_id: body.media_id || null,
      duration_seconds: body.duration_seconds ?? null, hits: body.hits ?? null, total_beats: body.total_beats ?? null, gal: body.gal || 'reiwa', similarity: body.similarity ?? null,
      pose_template_post_id: template?.post_id || null, is_first_pose: first, sync_with: sync, reward: REWARDS[chore], reactions: {},
      praise: { text: LABELS[chore] + 'できたのえらすぎ！今日の自分に拍手〜✨', source: 'fallback' } };
    const done = state.completed[uid] ||= [];
    if (!done.includes(chore)) done.push(chore);
    (state.latest[chore] ||= {})[uid] = post.created_at;
    state.recent = [{ id, user_id: uid, chore, created_at: post.created_at, reward: post.reward, sync_with: sync }, ...state.recent.slice(0, 49)];
    db.posts[id] = post; db.days[dayKey] = state; db.requests[uid + ':' + body.request_id] = id; save(db);
    return json({ post, created: true });
  }
  if (rest.startsWith('/posts') && method === 'GET') {
    const limit = Number(searchParams.get('limit') || 30), before = searchParams.get('before');
    const items = posts.sort((a, b) => b.id.localeCompare(a.id)).filter(p => !before || p.id < before).slice(0, limit);
    return json({ items, next_cursor: items.length === limit ? items.at(-1).id : null });
  }
  const reaction = rest.match(/^\/posts\/([^/]+)\/reaction$/);
  if (reaction) {
    const post = db.posts[reaction[1]];
    if (!post || post.house_id !== houseId) return fail(404, 'Post not found');
    post.reactions[uid] = body.emoji; save(db); return json(post);
  }
  return fail(404, 'API not found');
}
