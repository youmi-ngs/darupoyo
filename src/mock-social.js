// Mock counterparts of backend/src/app/social.py (comments, profile photo, other-house history).
// Returns a Response, or null when the path is not one of these.
const HISTORY_FIELDS = ['id', 'day', 'chore', 'method', 'created_at', 'media_id', 'voice_media_id', 'finished_voice_media_id', 'reward', 'praise', 'gal'];
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
const fail = (status, detail) => json({ detail }, status);

export function socialRoute({ db, uid, houseId, house, rest, method, body, save, readMedia, dropMedia, searchParams }) {
  const comments = rest.match(/^\/posts\/([^/]+)\/comments(?:\/([^/]+))?$/);
  if (comments) {
    const post = db.posts[comments[1]];
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
      if (!list.some(c => c.id === comments[2] && c.user_id === uid)) return fail(404, 'Own comment not found');
      post.comments = list.filter(c => c.id !== comments[2]); save(db); return json(post);
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

// Account deletion: drop the user's comments on everyone else's posts.
export function scrubSocial(db, uid) {
  for (const post of Object.values(db.posts)) if (post.comments) post.comments = post.comments.filter(c => c.user_id !== uid);
}
