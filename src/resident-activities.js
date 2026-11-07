import { galCharacter } from './gal-figure.js';
import { residentThemes } from './themes.js';
const SCENES = { meal: 'ldk', garbage: 'outside', dryer: 'wash', laundry: 'balcony' };
const LABELS = { meal: 'いただきます', garbage: 'ゴミ捨てできた', dryer: '髪さらさら', laundry: '洗濯できた' };
const PROP = { meal: 'meal', garbage: 'trash', dryer: 'dryer', laundry: 'laundry' };
// #121: a gal stays where her resident last finished a chore for 5 minutes, then goes back to her room.
export const STAY_MS = 5 * 60 * 1000;
const away = (activity, now) => now - Date.parse(activity.at) >= STAY_MS;
const galId = (member, activity) => member.gal && member.gal !== 'random' ? member.gal : activity.gal;

// Latest activity is stored with the household day; every resident sees the same
// phase and chosen gal, dressed in that resident's theme color. A new action
// replaces it, and 04:00 starts an empty day.
export function renderActivities(data, now = Date.now()) {
  document.querySelectorAll('.resident-activities').forEach(el => el.remove());
  const themes = residentThemes(data.house);
  for (const [uid, activity] of Object.entries(data.state.activity || {})) {
    const member = data.house.members[uid], scene = SCENES[activity.chore];
    if (!member || !scene || away(activity, now)) continue;
    const room = document.querySelector(`.scene[data-scene="${scene}"] .sv`);
    if (!room) continue;
    let group = room.querySelector('.resident-activities');
    if (!group) {
      group = document.createElement('div'); group.className = 'resident-activities';
      if (activity.chore === 'meal') {
        group.classList.add('meal-seats');
        room.querySelector('[data-chore=meal]').append(group);
      } else room.append(group);
    }
    const figure = document.createElement('figure');
    const finished = activity.phase === 'finished';
    figure.className = 'resident-avatar avatar-' + activity.chore + (finished ? ' is-satisfied' : '');
    figure.dataset.user = uid;
    if (activity.chore === 'meal') figure.style.setProperty('--extra-seat', Math.max(0, group.children.length - 2));
    const label = finished ? 'ごちそうさま・満腹' : LABELS[activity.chore];
    figure.setAttribute('aria-label', member.display_name + '：' + label);
    figure.innerHTML = galCharacter(galId(member, activity), themes[uid], finished ? 'heart' : PROP[activity.chore]);
    const caption = document.createElement('figcaption');
    const name = document.createElement('strong'); name.textContent = member.display_name;
    const phase = document.createElement('span'); phase.textContent = label;
    caption.append(name, phase); figure.append(caption); group.append(figure);
  }
}

// The gal back in her own room (5 minutes after the last chore), or '' while she is out.
export function roomGal(data, uid, now = Date.now()) {
  const activity = data?.state.activity?.[uid], member = data?.house.members[uid];
  if (!activity || !member || !away(activity, now)) return '';
  return '<figure class="room-gal" aria-label="' + member.display_name.replace(/[<>"&]/g, '') + 'のギャル（部屋でひと休み）">'
    + galCharacter(galId(member, activity), residentThemes(data.house)[uid], 'heart') + '</figure>';
}
// Milliseconds until the next gal walks back to her room, or null when none is out.
export function nextReturn(data, now = Date.now()) {
  const left = Object.values(data?.state.activity || {}).filter(a => !away(a, now)).map(a => Date.parse(a.at) + STAY_MS - now);
  return left.length ? Math.max(1000, Math.min(...left) + 50) : null;
}
