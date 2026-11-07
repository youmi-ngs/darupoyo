import { mockDarupoyo, deleteMockDarupoyo } from './mock-darupoyo.js';
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
const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date(Date.now() - 4 * 60 * 60 * 1000));
const newDay = day => ({ day, goals: {}, completed: {}, poses: {}, recent: [], latest: {}, activity: {} });
const postId = now => now.toISOString().replace(/[-:Z]/g, '').replace('.', '') + '000_' + crypto.randomUUID().replace(/-/g, '');
const blobToDataUrl = blob => new Promise(resolve => { const r = new FileReader(); r.onload = () => resolve(r.result); r.readAsDataURL(blob); });

export async function mockFetch(url, init = {}) {
  const { pathname, searchParams } = new URL(url, location.origin);
  const path = pathname.replace(/^.*?\/api/, '');
  const method = init.method || 'GET';
  const uid = (init.headers?.Authorization || '').replace(/^Bearer dev:/, '');
  const body = typeof init.body === 'string' ? JSON.parse(init.body) : init.body;
  const db = load(); db.houses ||= {}; db.invites ||= {}; db.days ||= {}; db.posts ||= {}; db.media ||= {}; db.requests ||= {}; db.moments ||= {};

  if (path === '/config') return json({ auth_mode: 'dev', timezone: 'Asia/Tokyo', firebase: {}, mock: true });
  if (!uid) return fail(401, 'Local token format: dev:alice');
  if (path === '/me' && method === 'DELETE') {
    const removedHouses = new Set();
    for (const [id, h] of Object.entries(db.houses)) {
      if (!h.member_ids.includes(uid)) continue;
      h.member_ids = h.member_ids.filter(m => m !== uid); delete h.members[uid];
      if (!h.member_ids.length) { removedHouses.add(id); delete db.houses[id]; }
      else if (h.owner_id === uid) h.owner_id = h.member_ids[0];
    }
    const removedPosts = new Set();
    for (const [id, post] of Object.entries(db.posts)) {
      if (post.user_id === uid || removedHouses.has(post.house_id)) { removedPosts.add(id); delete db.posts[id]; }
      else { delete post.reactions[uid]; post.sync_with = (post.sync_with || []).filter(m => m !== uid); }
    }
    for (const post of Object.values(db.posts)) if (removedPosts.has(post.pose_template_post_id)) post.pose_template_post_id = null;
    for (const [id, moment] of Object.entries(db.moments)) if (moment.user_id === uid || removedHouses.has(moment.house_id)) delete db.moments[id];
    for (const [id, meta] of Object.entries(db.media)) {
      if (meta.owner_id === uid || removedHouses.has(meta.house_id)) { media.delete(id); try { localStorage.removeItem(KEY + '-media-' + id); } catch {} delete db.media[id]; }
    }
    for (const [key, state] of Object.entries(db.days)) {
      if (removedHouses.has(key.split('/')[0])) { delete db.days[key]; continue; }
      delete state.goals[uid]; delete state.completed[uid]; if (state.activity) delete state.activity[uid];
      for (const [chore, pose] of Object.entries(state.poses)) if (pose.user_id === uid) delete state.poses[chore];
      Object.values(state.latest).forEach(v => delete v[uid]);
      state.recent = state.recent.filter(p => p.user_id !== uid).map(p => ({...p, sync_with: p.sync_with.filter(m => m !== uid)}));
    }
    for (const [key, id] of Object.entries(db.requests)) if (key.startsWith(uid + ':') || removedPosts.has(id)) delete db.requests[key];
    for (const [key, invite] of Object.entries(db.invites)) if (invite.created_by === uid || removedHouses.has(invite.house_id)) delete db.invites[key];
    deleteMockDarupoyo(db, uid, removedHouses);
    save(db); return new Response(null, {status: 204});
  }
  if (path === '/me') return json({ uid, deletion_pending: false });
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
  const darupoyo = mockDarupoyo({ db, houseId, uid, rest, method, body, searchParams, day, state, postId, save });
  if (darupoyo) return darupoyo;

  if (rest === '' && method === 'PUT') { house.name = body.name.trim(); save(db); return json(house); }
  if (rest === '/invites') {
    const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', token = Array.from(crypto.getRandomValues(new Uint8Array(8)), n => abc[n % 32]).join(''), expires_at = new Date(Date.now() + 7 * 86400000).toISOString();
    db.invites[token] = { house_id: houseId, expires_at, created_by: uid }; save(db); return json({ token, expires_at }, 201);
  }
  if (rest === '/dashboard') {
    const shown = db.days[houseId + '/' + (searchParams.get('day') || day)] || newDay(searchParams.get('day') || day);
    const lights = Object.fromEntries(house.member_ids.map(m => [m, !!shown.completed[m]?.length]));
    return json({ house, state: shown, lights, happiness: Math.round(100 * Object.values(lights).filter(Boolean).length / house.member_ids.length), timezone: 'Asia/Tokyo' });
  }
  if (rest === '/goals') { state.goals[uid] = [...new Set(body.chores)]; db.days[dayKey] = state; save(db); return json(state); }
  if (rest === '/profile') {
    if (body.gal) house.members[uid].gal = body.gal;
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
    if (db.media[id]?.house_id !== houseId) return fail(404, 'Image not found');
    if (media.has(id)) return new Response(media.get(id));
    let data = null; try { data = localStorage.getItem(KEY + '-media-' + id); } catch {}
    return data ? fetch(data) : fail(404, 'Image not found');
  }
  if (rest === '/moments' && method === 'GET') {
    const before = searchParams.get('before');
    const items = Object.values(db.moments).filter(p => p.house_id === houseId && (!before || p.id < before)).sort((a,b) => b.id.localeCompare(a.id)).slice(0,30);
    return json({items, next_cursor: items.length === 30 ? items.at(-1).id : null});
  }
  if (rest === '/moments' && method === 'POST') {
    const prior = Object.values(db.moments).find(p => p.house_id === houseId && p.user_id === uid && p.request_id === body.request_id);
    if (prior) return prior.media_id === body.media_id && prior.caption === body.caption.trim() ? json(prior,201) : fail(409, 'Request ID already used');
    const photo = db.media[body.media_id];
    if (!photo || photo.house_id !== houseId || photo.owner_id !== uid || photo.kind !== 'selfie') return fail(422, 'Invalid selfie');
    const now = new Date(), moment = {id:postId(now),house_id:houseId,user_id:uid,request_id:body.request_id,media_id:body.media_id,caption:body.caption.trim(),created_at:now.toISOString()};
    db.moments[moment.id]=moment;save(db);return json(moment,201);
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
    const post = { id, house_id: houseId, user_id: uid, day, chore, method: body.method, created_at: now.toISOString(), media_id: body.media_id || null, voice_media_id: body.voice_media_id || null,
      duration_seconds: body.duration_seconds ?? null, hits: body.hits ?? null, total_beats: body.total_beats ?? null, gal: body.gal || 'reiwa', similarity: body.similarity ?? null,
      pose_template_post_id: template?.post_id || null, is_first_pose: first, sync_with: sync, reward: REWARDS[chore], reactions: {},
      praise: { text: LABELS[chore] + 'できたのえらすぎ！今日の自分に拍手〜✨', source: 'fallback' } };
    const done = state.completed[uid] ||= [];
    if (!done.includes(chore)) done.push(chore);
    (state.latest[chore] ||= {})[uid] = post.created_at;
    (state.activity ||= {})[uid] = { chore, phase: chore === 'meal' ? 'eating' : 'done', gal: post.gal, at: post.created_at, post_id: id };
    state.recent = [{ id, user_id: uid, chore, created_at: post.created_at, reward: post.reward, sync_with: sync }, ...state.recent.slice(0, 49)];
    db.posts[id] = post; db.days[dayKey] = state; db.requests[uid + ':' + body.request_id] = id; save(db);
    return json({ post, created: true });
  }
  if (rest.startsWith('/posts') && method === 'GET') {
    const limit = Number(searchParams.get('limit') || 30), before = searchParams.get('before');
    const items = posts.sort((a, b) => b.id.localeCompare(a.id)).filter(p => !before || p.id < before).slice(0, limit);
    return json({ items, next_cursor: items.length === limit ? items.at(-1).id : null });
  }
  const mealFinish = rest.match(/^\/posts\/([^/]+)\/meal-finish$/);
  if (mealFinish && method === 'PUT') {
    const post = db.posts[mealFinish[1]], voice = db.media[body.voice_media_id];
    if (!post || post.house_id !== houseId || post.user_id !== uid || post.chore !== 'meal') return fail(404, 'Own meal not found');
    if (post.day !== day) return fail(409, 'This meal belongs to a previous day');
    if (!voice || voice.house_id !== houseId || voice.owner_id !== uid || voice.kind !== 'voice') return fail(422, 'Missing owned voice');
    if (post.finished_voice_media_id) return post.finished_voice_media_id === body.voice_media_id ? json(post) : fail(409, 'Already finished');
    post.finished_voice_media_id = body.voice_media_id; post.finished_at = new Date().toISOString();
    (state.activity ||= {})[uid] = {chore:'meal', phase:'finished', gal:post.gal, at:post.finished_at, post_id:post.id};
    db.days[dayKey] = state; save(db); return json(post);
  }
  const reaction = rest.match(/^\/posts\/([^/]+)\/reaction$/);
  if (reaction) {
    const post = db.posts[reaction[1]];
    if (!post || post.house_id !== houseId) return fail(404, 'Post not found');
    post.reactions[uid] = body.emoji; save(db); return json(post);
  }
  return fail(404, 'API not found');
}
