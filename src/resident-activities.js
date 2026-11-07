import { galCharacter } from './gal-figure.js';
import { residentThemes } from './themes.js';
const SCENES = { meal: 'ldk', garbage: 'outside', dryer: 'wash', laundry: 'balcony' };
const LABELS = { meal: 'いただきます', garbage: 'ゴミ捨てできた', dryer: '髪さらさら', laundry: '洗濯できた' };
const PROP = { meal: 'meal', garbage: 'trash', dryer: 'dryer', laundry: 'laundry' };

// Latest activity is stored with the household day; every resident sees the same
// phase and chosen gal, dressed in that resident's theme color. A new action
// replaces it, and 04:00 starts an empty day.
export function renderActivities(data) {
  document.querySelectorAll('.resident-activities').forEach(el => el.remove());
  const themes = residentThemes(data.house);
  for (const [uid, activity] of Object.entries(data.state.activity || {})) {
    const member = data.house.members[uid], scene = SCENES[activity.chore];
    if (!member || !scene) continue;
    const room = document.querySelector(`.scene[data-scene="${scene}"] .sv`);
    if (!room) continue;
    let group = room.querySelector('.resident-activities');
    if (!group) { group = document.createElement('div'); group.className = 'resident-activities'; room.append(group); }
    const figure = document.createElement('figure');
    const finished = activity.phase === 'finished';
    figure.className = 'resident-avatar avatar-' + activity.chore + (finished ? ' is-satisfied' : '');
    figure.dataset.user = uid;
    const label = finished ? 'ごちそうさま・満腹' : LABELS[activity.chore];
    figure.setAttribute('aria-label', member.display_name + '：' + label);
    figure.innerHTML = galCharacter(member.gal && member.gal !== 'random' ? member.gal : activity.gal, themes[uid], finished ? 'heart' : PROP[activity.chore]);
    const caption = document.createElement('figcaption');
    const name = document.createElement('strong'); name.textContent = member.display_name;
    const phase = document.createElement('span'); phase.textContent = label;
    caption.append(name, phase); figure.append(caption); group.append(figure);
  }
}
