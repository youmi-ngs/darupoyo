import { GALS } from './data.js';
const SCENES = { meal: 'ldk', garbage: 'entry', dryer: 'wash', laundry: 'balcony' };
const LABELS = { meal: 'いただきます', garbage: 'ゴミ捨てできた', dryer: '髪さらさら', laundry: '洗濯できた' };

// Latest activity is stored with the household day; every resident sees the same
// phase and chosen gal. A new action replaces it, and 04:00 starts an empty day.
export function renderActivities(data) {
  document.querySelectorAll('.resident-activities').forEach(el => el.remove());
  for (const [uid, activity] of Object.entries(data.state.activity || {})) {
    const member = data.house.members[uid], scene = SCENES[activity.chore];
    if (!member || !scene) continue;
    const gal = GALS[member.gal] || GALS[activity.gal] || GALS.reiwa;
    const room = document.querySelector(`.scene[data-scene="${scene}"] .sv`);
    if (!room) continue;
    let group = room.querySelector('.resident-activities');
    if (!group) { group = document.createElement('div'); group.className = 'resident-activities'; room.append(group); }
    const figure = document.createElement('figure');
    figure.className = 'resident-avatar avatar-' + activity.chore + (activity.phase === 'finished' ? ' is-satisfied' : '');
    figure.dataset.user = uid;
    const label = activity.phase === 'finished' ? 'ごちそうさま・満腹' : LABELS[activity.chore];
    figure.setAttribute('aria-label', member.display_name + '：' + label);
    const character = document.createElement('div'); character.className = 'resident-character';
    character.innerHTML = '<span class="resident-face">' + gal.svg + '</span><span class="resident-body"><i class="arm left"></i><i class="arm right"></i><i class="legs"></i></span><span class="resident-prop" aria-hidden="true"></span>';
    character.style.setProperty('--avatar-color', gal.bg);
    character.querySelector('.resident-prop').textContent = activity.chore === 'meal' ? (activity.phase === 'finished' ? '♡' : '🍚') : ({ laundry: '👕', dryer: '✨', garbage: '✌' })[activity.chore];
    const caption = document.createElement('figcaption');
    const name = document.createElement('strong'); name.textContent = member.display_name;
    const phase = document.createElement('span'); phase.textContent = label;
    caption.append(name, phase); figure.append(character, caption); group.append(figure);
  }
}
