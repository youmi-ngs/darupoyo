// Little hidden friends: the bird on the drying pole talks in gal slang, and the
// black cat by the garbage (only while there is garbage) meows and moves when tapped.
import { chirp, meow } from './sfx.js';

const BIRD = ['それな〜', 'ぽよ〜', 'え、天才？', 'ビジュ良すぎん？', 'あげぽよ↑↑', 'わかりみ〜', 'ちょっと休も？', '今日もかわちい♡', 'いい匂いしてきた〜', 'だるい日もえらいよ'];
// Sometimes (1 in 10) the bird says something rare.
const RARE = ['ここだけの話…あなたが一番がんばってる♡', 'ピヨってないで家事しよ？笑', '今日のMVP、決定〜！'];
const CAT = ['にゃ〜', 'にゃっ', 'ごろごろ…'];

function say(el, text, rare = false) {
  const bubble = el.querySelector('.critter-bubble');
  bubble.textContent = text; bubble.classList.toggle('is-rare', rare);
  el.classList.remove('is-talking'); void el.offsetWidth; el.classList.add('is-talking');
  clearTimeout(el.talkTimer); el.talkTimer = setTimeout(() => el.classList.remove('is-talking'), 2600);
}
const pick = (list, last) => { const options = list.filter(x => x !== last); return options[Math.floor(Math.random() * options.length)]; };

export function setupCritters() {
  const bird = document.querySelector('.pole-bird');
  let lastBird = '';
  bird?.addEventListener('click', () => {
    const rare = Math.random() < .1;
    lastBird = pick(rare ? RARE : BIRD, lastBird);
    say(bird, lastBird, rare); chirp();
  });
  const cat = document.querySelector('.trash-cat');
  let lastCat = '';
  cat?.addEventListener('click', () => { lastCat = pick(CAT, lastCat); say(cat, lastCat); meow(); });
}
