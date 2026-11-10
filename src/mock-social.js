// Mock counterparts of backend/src/app/social.py (comments, profile photo, other-house history).
// Returns a Response, or null when the path is not one of these.
const HISTORY_FIELDS = ['id', 'day', 'chore', 'method', 'created_at', 'media_id', 'voice_media_id', 'finished_voice_media_id', 'reward', 'praise', 'gal'];
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
const fail = (status, detail) => json({ detail }, status);

export function socialRoute({ db, uid, houseId, house, rest, method, body, save, readMedia, dropMedia, searchParams }) {
  // Edit the words of, or delete, your own post (backend/src/app/edits.py).
  const own = rest.match(/^\/(posts|moments|darupoyo)\/([^/]+)$/);
  if (own && (method === 'PATCH' || method === 'DELETE')) {
    const [, kind, id] = own, table = { posts: db.posts, moments: db.moments, darupoyo: db.darupoyo_records ||= {} }[kind];
    const record = table[id];
    if (!record || record.house_id !== houseId || record.user_id !== uid) return fail(404, 'Own post not found');
    if (method === 'PATCH') {
      const caption = String(body.caption ?? '').trim();
      if ([...caption].length > 30) return fail(422, 'Too long');
      if (caption !== (record.caption || '')) {
        record.caption = caption; record.edited_at = new Date().toISOString();
        if (kind === 'posts') record.praise = { text: (caption ? '「' + caption + '」' : '') + 'やったのえらすぎ！今日の自分に拍手〜✨', source: 'fallback' };
        if (kind === 'moments') record.praise = { ...record.praise, text: (caption ? caption + '、' : '') + '今を見せてくれてうれしい♡', source: 'fallback' };
      }
      save(db); return json(record);
    }
    delete table[id];
    const state = record.day && db.days[houseId + '/' + record.day];
    if (state && kind === 'posts') {
      const same = Object.values(db.posts).filter(p => p.house_id === houseId && p.user_id === uid && p.day === record.day && p.chore === record.chore);
      if (!same.length) { state.completed[uid] = (state.completed[uid] || []).filter(c => c !== record.chore); if (!state.completed[uid].length) delete state.completed[uid]; delete state.latest[record.chore]?.[uid]; }
      if (state.activity?.[uid]?.post_id === id) delete state.activity[uid];
      if (state.poses?.[record.chore]?.post_id === id) delete state.poses[record.chore];
      state.recent = state.recent.filter(p => p.id !== id);
    }
    if (state && kind === 'darupoyo' && !Object.values(table).some(r => r.house_id === houseId && r.user_id === uid && r.day === record.day)) delete state.darupoyo_shared?.[uid];
    for (const key of ['media_id', 'voice_media_id', 'finished_voice_media_id']) if (record[key]) dropMedia(record[key]);
    save(db); return json({ deleted: id });
  }
  // Chore posts, うちらのなう and だるぽよ take comments the same way.
  const comments = rest.match(/^\/(posts|moments|darupoyo)\/([^/]+)\/comments(?:\/([^/]+))?$/)?.slice(1);
  if (comments) {
    const table = { posts: db.posts, moments: db.moments, darupoyo: db.darupoyo_records || {} }[comments.shift()];
    const post = table[comments[0]];
    if (!post || post.house_id !== houseId) return fail(404, 'Post not found');
    const list = post.comments ||= [];
    if (method === 'POST') {
      const text = String(body.text || '').trim();
      if (!text || text.length > 200) return fail(422, 'Invalid comment');
      const prior = list.find(c => c.id === body.request_id);
      if (prior) return prior.user_id === uid && prior.text === text ? json(post, 201) : fail(409, 'request_id was already used');
      if (list.length >= 50) return fail(409, 'Too many comments');
      list.push({ id: body.request_id, user_id: uid, text, created_at: new Date().toISOString() });
      save(db); return json(post, 201);
    }
    if (method === 'DELETE') {
      if (!list.some(c => c.id === comments[1] && c.user_id === uid)) return fail(404, 'Own comment not found');
      post.comments = list.filter(c => c.id !== comments[1]); save(db); return json(post);
    }
  }
  if (rest === '/avatar') {
    const member = house.members[uid], old = member.avatar_media_id;
    if (method === 'PUT') {
      const photo = db.media[body.media_id];
      if (!photo || photo.house_id !== houseId || photo.owner_id !== uid || photo.kind !== 'avatar') return fail(422, 'Invalid profile photo');
      member.avatar_media_id = body.media_id;
    } else if (method === 'DELETE') delete member.avatar_media_id;
    else return null;
    if (old && old !== member.avatar_media_id) dropMedia(old);
    save(db); return json(house);
  }
  if (rest === '/history-sharing' && method === 'PUT') { house.members[uid].share_history = !!body.enabled; save(db); return json(house); }
  const history = rest.match(/^\/members\/([^/]+)\/history(?:\/([^/]+)\/media\/([^/]+))?$/);
  if (history && method === 'GET') {
    const [, member, source, mediaId] = history;
    if (!house.member_ids.includes(member)) return fail(404, 'Resident not found');
    if (member !== uid && !house.members[member].share_history) return fail(403, 'Private');
    if (mediaId) {
      const meta = db.media[mediaId];
      if (!meta || meta.house_id !== source || meta.owner_id !== member || !['meal', 'cutout', 'voice'].includes(meta.kind) || !db.houses[source]?.member_ids.includes(member)) return fail(404, 'Image not found');
      const published = Object.values(db.posts).some(p => p.house_id === source && p.user_id === member && [p.media_id,p.voice_media_id,p.finished_voice_media_id].includes(mediaId));
      if (!published) return fail(404, 'Record media not found');
      return readMedia(mediaId);
    }
    const others = new Set(Object.values(db.houses).filter(h => h.id !== houseId && h.member_ids.includes(member)).map(h => h.id));
    const before = searchParams?.get('before');
    const all = Object.values(db.posts).filter(p => others.has(p.house_id) && p.user_id === member && (!before || p.id < before))
      .sort((a, b) => b.id.localeCompare(a.id));
    const items = all.slice(0, 200)
      .map(p => ({ ...Object.fromEntries(HISTORY_FIELDS.map(k => [k, p[k] ?? null])), source_house_id: p.house_id }));
    return json({ items, next_cursor: all.length > 200 ? items.at(-1).id : null, shared: !!house.members[member].share_history });
  }
  return null;
}

// Account deletion: drop the user's comments on everyone else's posts, うちらのなう and だるぽよ.
export function scrubSocial(db, uid) {
  for (const post of [db.posts, db.moments, db.darupoyo_records].flatMap(t => Object.values(t || {}))) if (post.comments) post.comments = post.comments.filter(c => c.user_id !== uid);
}
