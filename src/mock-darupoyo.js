// Isolated mock adapter for the non-completion record API.
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
export function mockDarupoyo({ db, houseId, uid, rest, method, body, searchParams, day, state, postId, save }) {
  if (rest !== '/darupoyo') return null;
  db.darupoyo_records ||= {}; db.darupoyo_requests ||= {};
  if (method === 'GET') {
    const before = searchParams.get('before');
    const items = Object.values(db.darupoyo_records).filter(r => r.house_id === houseId && (!before || r.id < before)).sort((a,b) => b.id.localeCompare(a.id)).slice(0,30);
    return json({items, next_cursor: items.length === 30 ? items.at(-1).id : null});
  }
  if (method !== 'POST') return json({detail:'Method not allowed'},405);
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!body || typeof body.caption !== 'string' && body.caption != null || !uuid.test(body.request_id) || !['meal','dryer','laundry','garbage'].includes(body.chore)) return json({detail:'Invalid record'},422);
  const caption = (body.caption || '').trim();
  if (caption.length > 140 || !caption && !body.media_id) return json({detail:'Photo or caption required'},422);
  const key = houseId + '/' + uid + '_' + body.request_id, fingerprint = JSON.stringify([body.chore, caption, body.media_id || null]);
  const prior = db.darupoyo_requests[key];
  if (prior) return prior.fingerprint === fingerprint ? json({record:db.darupoyo_records[prior.id],created:false},201) : json({detail:'Request ID already used'},409);
  if (body.media_id) {
    const media = db.media[body.media_id];
    if (!media || media.house_id !== houseId || media.owner_id !== uid || media.kind !== 'darupoyo') return json({detail:'Missing owned photo'},422);
  }
  const now = new Date(), record = {id:postId(now),kind:'darupoyo',house_id:houseId,user_id:uid,chore:body.chore,caption,media_id:body.media_id || null,day,created_at:now.toISOString()};
  db.darupoyo_records[record.id] = record;
  db.darupoyo_requests[key] = {id:record.id,user_id:uid,house_id:houseId,fingerprint};
  state.darupoyo_updated_at = record.created_at; db.days[houseId+'/'+day] = state;
  save(db); return json({record,created:true},201);
}
export function deleteMockDarupoyo(db, uid, removedHouses) {
  for (const collection of ['darupoyo_records','darupoyo_requests']) {
    for (const [key, value] of Object.entries(db[collection] || {})) {
      if (value.user_id === uid || removedHouses.has(value.house_id)) delete db[collection][key];
    }
  }
}
