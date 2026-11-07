// House timeline (#90): shared by the entrance board and け〜じばん.
//
// Connection point for other features (e.g. PC④'s 「だるぽよ記録」):
//   registerTimelineSource(ctx => [entry, ...])
// ctx = { dashboard, posts } where posts are today's converted chore posts.
// An entry is { id, at: ISO time, who: uid | null, text, tag?, suffix? } and is
// shown as 「HH:MM ● name text [tag] suffix」, newest first, mixed with chores.
const sources = [];
export function registerTimelineSource(source) { sources.push(source); }

const fmt = (at, timeZone) => new Intl.DateTimeFormat('ja-JP', { timeZone, hour: '2-digit', minute: '2-digit' }).format(new Date(at));

export function timelineEntries(ctx, REWARD) {
  const chores = ctx.posts.map(p => {
    const reward = REWARD[p.task];
    // A post of an unknown kind can describe itself with `timeline: {text, tag}`.
    if (!reward) return { id: p.id, at: p.created_at, who: p.who, text: p.timeline?.text || 'が記録したよ', tag: p.timeline?.tag };
    return { id: p.id, at: p.created_at, who: p.who, text: reward.verb + '、', tag: reward.item, suffix: 'をゲット' };
  });
  const extra = sources.flatMap(source => { try { return source(ctx) || []; } catch { return []; } });
  return [...chores, ...extra].filter(e => e && e.at).sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

// view = { nameOf, dotOf(uid) → element, timeZone, newestId, limit, empty }
export function renderTimeline(ol, entries, view) {
  ol.replaceChildren();
  if (!entries.length) {
    const li = document.createElement('li'); li.className = 'tl-empty'; li.textContent = view.empty || 'まだ静か。だれが一番乗りかな'; ol.append(li); return;
  }
  entries.slice(0, view.limit || entries.length).forEach(e => {
    const li = document.createElement('li'); li.className = 'tl-item' + (e.id && e.id === view.newestId ? ' is-new' : '');
    const time = document.createElement('span'); time.className = 'tl-time'; time.textContent = fmt(e.at, view.timeZone);
    const text = document.createElement('span'); text.className = 'tl-text';
    if (e.who) { const b = document.createElement('b'); b.textContent = view.nameOf(e.who); text.append(b, ' '); }
    text.append(e.text || '');
    if (e.tag) { const tag = document.createElement('span'); tag.className = 'tl-get'; tag.textContent = e.tag; text.append(tag); }
    if (e.suffix) text.append(e.suffix);
    const dot = e.who ? view.dotOf(e.who) : document.createElement('span');
    li.append(time, dot, text); ol.append(li);
  });
}
