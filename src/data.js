// Static app data: chores, rewards, pose figures, gal praise, and room themes.
export const TASKS = {
  laundry: { label: '洗濯', color: 'cyan',
    presets: [{ id: 'wizard', name: '魔法使い', hint: '洗濯物をはたいて、杖みたいにふる', fig: 8, praise: '洗濯物の魔法使い、爆誕。えらすぎ。' }],
    sound: { title: 'バサバサ音を録る', hint: '洗濯物をはたく音を10秒', listen: 'バサバサ音、聞いてる…', praise: 'バサバサ音、ちゃんと聞こえた。えらすぎ。' } },
  meal: { label: 'ごはん', color: 'pink',
    photo: { title: 'ごはんを撮る', hint: 'ごはんの写真で記録する', look: 'ごはん、確認するね…', praise: 'いただきます、ちゃんと聞こえた。今日の私、優勝。' } },
  dryer: { label: 'ドライヤー', color: 'lilac',
    sound: { title: 'ドライヤーの音を録る', hint: '10秒つづくとゲージがたまる', listen: 'ドライヤーの音、聞いてる…', praise: 'ドライヤーの音、10秒ちゃんと聞こえた。天才。' } },
  trash: { label: 'ゴミ捨て', color: 'lime',
    presets: [
      { id: 'santa', name: 'サンタ', hint: 'ゴミ袋を肩にかついで', fig: 6, praise: 'サンタ（ゴミ）来た。えらすぎ。' },
      { id: 'thief', name: '泥棒', hint: 'ゴミ袋をかついで、こっそり', fig: 7, praise: '泥棒（ゴミ）、確保。えらすぎ。' }
    ] }
};
export const ORDER = ['laundry', 'meal', 'dryer', 'trash'];
export const REWARD = {
  laundry: { verb: '洗濯をして', item: 'いい匂いの服' },
  meal: { verb: 'ごはんを食べて', item: 'ツヤ肌' },
  dryer: { verb: 'ドライヤーをして', item: '美髪' },
  trash: { verb: 'ゴミを出して', item: 'スッキリ玄関' }
};
export const S = 'stroke="#3B2560" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" fill="none"';
export const POSES = [
  '<g ' + S + '><circle cx="60" cy="58" r="11" fill="#FFFFFF"/><path d="M60 70v34M60 80l-22-18M60 80l24-6M60 104l-16 26M60 104l20 22"/></g>',
  '<g ' + S + '><circle cx="58" cy="56" r="11" fill="#FFFFFF"/><path d="M58 68l4 36M60 78l-26 4M60 78l20-26M62 104l-24 18M62 104l12 28"/></g>',
  '<g ' + S + '><circle cx="62" cy="60" r="11" fill="#FFFFFF"/><path d="M62 72v32M62 82l-20-24M62 82l20-24M62 104l-22 10M62 104l22 10"/></g>',
  '<g ' + S + '><circle cx="58" cy="58" r="11" fill="#FFFFFF"/><path d="M58 70v34M58 80l-18 18M58 80l18-6l-2-16M74 58l-4-10M74 58l4-10M58 104l-12 26M58 104l14 26"/></g>',
  '<g ' + S + '><circle cx="60" cy="62" r="11" fill="#FFFFFF"/><path d="M60 74v30M60 82l-16-20l16-24M60 82l16-20l-16-24M60 104l-14 26M60 104l14 26"/></g>',
  '<g ' + S + '><circle cx="60" cy="54" r="11" fill="#FFFFFF"/><path d="M60 66v36M60 76l-24 6M60 76l24 6M60 102v30M60 102l18 6l-8 14"/></g>',
  '<g ' + S + '><circle cx="78" cy="50" r="20" fill="#FFFFFF" stroke-width="4"/><path d="M70 30q8-8 16 0" stroke-width="4"/><circle cx="54" cy="60" r="11" fill="#FFFFFF"/><path d="M54 72v32M54 80l14-20M54 82l-18 14M54 104l-14 26M54 104l14 26"/></g>',
  '<g ' + S + '><circle cx="86" cy="64" r="18" fill="#FFFFFF" stroke-width="4"/><circle cx="50" cy="66" r="11" fill="#FFFFFF"/><path d="M42 64h16" stroke-width="4"/><path d="M54 77l8 26M57 86l18-10M57 86l-20 6M62 103l-20 22M62 103l18 24"/></g>',
  '<g ' + S + '><path d="M46 46l14-22l14 22z" fill="#FFFFFF" stroke-width="4"/><circle cx="60" cy="56" r="10" fill="#FFFFFF"/><path d="M60 66v38M60 76l22-20M60 78l-20 14M60 104l-14 26M60 104l14 26"/><path d="M82 56l10-16" stroke-width="3"/><path d="M90 30l2 6l6 2l-6 2l-2 6l-2-6l-6-2l6-2z" fill="#FFF4A8" stroke-width="2"/></g>'
];
export const ORIGINAL_FIGS = [0, 1, 2, 3, 4, 5];
export const figSvg = (i) => '<svg viewBox="0 0 120 144" aria-hidden="true">' + POSES[i % POSES.length] + '</svg>';
export const MEAL_SVG = '<svg viewBox="0 0 120 144" aria-hidden="true"><g stroke="#3B2560" stroke-width="4" fill="none" stroke-linecap="round"><ellipse cx="60" cy="96" rx="34" ry="12" fill="#FFFFFF"/><path d="M34 92q26-34 52 0" fill="#FFF4A8"/><path d="M92 58v44M98 58v44"/></g></svg>';

export const GH = '<circle cx="32" cy="36" r="17" fill="#FFE8DE"/>';
export const BL = '<ellipse cx="22" cy="42.5" rx="3.6" ry="2" fill="#FFB3C7" stroke="none"/><ellipse cx="42" cy="42.5" rx="3.6" ry="2" fill="#FFB3C7" stroke="none"/>';
export const EYES = '<ellipse cx="25" cy="38" rx="2.8" ry="3.4" fill="#3B2560"/><ellipse cx="39" cy="38" rx="2.8" ry="3.4" fill="#3B2560"/><circle cx="26" cy="36.8" r="1" fill="#FFFFFF" stroke="none"/><circle cx="40" cy="36.8" r="1" fill="#FFFFFF" stroke="none"/>';
export const G = (inner) => '<svg viewBox="0 0 64 64" aria-hidden="true"><g stroke="#3B2560" stroke-width="2" stroke-linejoin="round" stroke-linecap="round">' + inner + '</g></svg>';
export const GALS = {
  heisei: { name: '平成ギャル', tag: 'Y2K・あげぽよ', bg: '#FFF1D6',
    svg: G('<path d="M12 56 Q8 18 32 15 Q56 18 52 56 Q46 44 47 34 L17 34 Q18 44 12 56Z" fill="#D9A35B"/><circle cx="32" cy="36" r="17" fill="#F6CFAF"/><path d="M15 34 Q16 19 32 18 Q48 19 49 34 Q41 25 33 29 Q27 24 15 34Z" fill="#D9A35B"/><path d="M24 21 Q20 28 18 33" stroke="#FFE08A" stroke-width="3"/><rect x="39" y="21" width="9" height="3.4" rx="1.7" fill="#FF8FCB" transform="rotate(-22 43.5 22.7)"/><rect x="41" y="26" width="9" height="3.4" rx="1.7" fill="#A8E6FF" transform="rotate(-22 45.5 27.7)"/><path d="M21.5 35.5q3.5-2.2 7 0M35.5 35.5q3.5-2.2 7 0" stroke-width="2.6"/>' + EYES + '<path d="M21.6 41.4l-1.2 1.2M42.4 41.4l1.2 1.2"/>' + BL + '<path d="M29 44.5q3 2.6 6 0z" fill="#FF7FA0"/><path d="M45.5 45.5c-.8-1.2-2.6-.4-1.8.9l1.8 1.7 1.8-1.7c.8-1.3-1-2.1-1.8-.9z" fill="#FF8FCB" stroke-width="1.2"/>'),
    title: 'あげぽよ〜↑↑',
    lines: { laundry_pose: '魔法使いとかチョーうける！洗濯もできるとか神だし！', laundry_sound: 'バサバサ音きこえた〜！いい匂いの服ゲットとか最強だし', meal: 'いただきます入りました〜！ちゃんと食べるとかチョーえらいじゃん', dryer: 'ドライヤー10秒完走！髪サラサラでテンアゲ↑↑', trash_santa: 'ゴミのサンタ降臨〜！玄関スッキリでちょべりぐ', trash_thief: '泥棒ポーズうけるんだけど！ゴミ出しえらすぎだし', original_new: '一番乗りじゃん！このポーズ今日の流行り決定〜', original_copy: 'まねっこ完ぺき！うちらズッ友じゃん' } },
  reiwa: { name: '令和ギャル', tag: 'ビジュ・それな', bg: '#E9E3FF',
    svg: G('<path d="M12 58 Q9 16 32 15 Q55 16 52 58 L46 58 Q48 40 46 32 L18 32 Q16 40 18 58Z" fill="#F2C4CF"/><circle cx="32" cy="36" r="17" fill="#FFE8DE"/><path d="M15 41 Q14 20 32 18 Q50 20 49 41 Q46 27 34 22.5 L32 25.5 L30 22.5 Q18 27 15 41Z" fill="#F2C4CF"/>' + EYES + '<path d="M21.5 35.4l-1.4-1.1M42.5 35.4l1.4-1.1"/><path d="M21.6 42.2q3.4 1.6 6.8 0M35.6 42.2q3.4 1.6 6.8 0" stroke="#FF9FB8" stroke-width="1.6"/><ellipse cx="21" cy="44.5" rx="4" ry="1.8" fill="#FFB3C7" stroke="none"/><ellipse cx="43" cy="44.5" rx="4" ry="1.8" fill="#FFB3C7" stroke="none"/><path d="M29.5 45.6q2.5 2.2 5 0q-2.5-1.5-5 0z" fill="#FF6F91"/><circle cx="16" cy="45" r="1.6" fill="#FFFFFF"/><circle cx="48" cy="45" r="1.6" fill="#FFFFFF"/>'),
    title: 'え、天才すぎん？',
    lines: { laundry_pose: '魔法使いビジュ良すぎ。洗濯までやるとか優勝じゃん', laundry_sound: 'バサバサ音ガチで聞こえた。えぐい、えらすぎ', meal: 'いただきます聞こえた〜。ちゃんと食べるの、ありよりのあり', dryer: 'ドライヤーおつ〜。髪ツヤツヤでビジュ爆上がり', trash_santa: 'ゴミのサンタえぐ。玄関スッキリしか勝たん', trash_thief: '泥棒ポーズ天才？ゴミ出しまでできるの尊い', original_new: '一番乗りえぐい。このポーズ今日の正解ね', original_copy: 'まねっこ精度えぐ。それなすぎてシンクロ' } },
  kuro: { name: '黒ギャル', tag: '姉御・自分の機嫌は自分で', bg: '#FFF6C9',
    svg: G('<path d="M10 56 Q6 16 32 14 Q58 16 54 56 Q47 46 47 34 L17 34 Q17 46 10 56Z" fill="#FFF3C4"/><circle cx="32" cy="36" r="17" fill="#B97A57"/><path d="M15 34 Q17 18 33 17 Q48 18 49 32 Q40 22 28 28 Q22 30 15 34Z" fill="#FFF3C4"/><ellipse cx="25" cy="38" rx="4.4" ry="4.8" fill="none" stroke="#FFFFFF" stroke-width="1.8"/><ellipse cx="39" cy="38" rx="4.4" ry="4.8" fill="none" stroke="#FFFFFF" stroke-width="1.8"/>' + EYES + '<path d="M21 35l-1.4-1.3M43 35l1.4-1.3" stroke-width="2.4"/><ellipse cx="21" cy="43.5" rx="3.6" ry="2" fill="#F28A8A" stroke="none"/><ellipse cx="43" cy="43.5" rx="3.6" ry="2" fill="#F28A8A" stroke="none"/><path d="M28.5 44.5q3.5 3 7 0z" fill="#FFFFFF"/><circle cx="14" cy="47" r="4" fill="none" stroke="#FFD84D" stroke-width="2.2"/><circle cx="50" cy="47" r="4" fill="none" stroke="#FFD84D" stroke-width="2.2"/>'),
    title: 'やるじゃん！最強！',
    lines: { laundry_pose: '魔法使いアガる〜！だるいのにやったの、マジ最強だから', laundry_sound: 'バサバサいい音！明日の服いい匂い確定じゃん', meal: 'いただきます聞こえた！食べるのも立派な家事っしょ', dryer: 'ドライヤーおつかれ！自分の機嫌、自分でとれてえらい', trash_santa: 'ゴミ出しサンタ最高！玄関も気分もアガるね', trash_thief: 'こっそりでも出したら勝ち！ウチ見てたからね', original_new: '一番乗りアツい！みんなこのポーズについてきな〜', original_copy: 'まねっこバッチリ！仲間とそろうとアガるよね' } },
  hime: { name: '姫ギャル', tag: '盛り髪・リボン・♡', bg: '#FFE6F4',
    svg: G('<circle cx="32" cy="31" r="20" fill="#F6A9C8"/><circle cx="32" cy="17" r="12" fill="#F6A9C8"/><circle cx="12" cy="44" r="7" fill="#F6A9C8"/><circle cx="52" cy="44" r="7" fill="#F6A9C8"/><circle cx="14" cy="55" r="6" fill="#F6A9C8"/><circle cx="50" cy="55" r="6" fill="#F6A9C8"/><circle cx="32" cy="37" r="16.5" fill="#FFEBE3"/><path d="M15.5 36 Q17 22 32 21 Q47 22 48.5 36 Q44 29 38 31 Q35 26 32 29 Q29 26 26 31 Q20 29 15.5 36Z" fill="#F6A9C8"/><path d="M32 9l-10-5.5v11zM32 9l10-5.5v11z" fill="#FFFFFF"/><circle cx="32" cy="9" r="2.6" fill="#FF8FCB"/><ellipse cx="25" cy="39" rx="3" ry="3.8" fill="#3B2560"/><ellipse cx="39" cy="39" rx="3" ry="3.8" fill="#3B2560"/><circle cx="26.1" cy="37.6" r="1.1" fill="#FFFFFF" stroke="none"/><circle cx="40.1" cy="37.6" r="1.1" fill="#FFFFFF" stroke="none"/><path d="M21 36.2l-1.7-1.6M22.9 35.2l-.9-2M43 36.2l1.7-1.6M41.1 35.2l.9-2"/><ellipse cx="22" cy="43.5" rx="3.4" ry="1.9" fill="#FFB3C7" stroke="none"/><ellipse cx="42" cy="43.5" rx="3.4" ry="1.9" fill="#FFB3C7" stroke="none"/><path d="M30 44.8q2 2.6 4 0" fill="#FF8FA8"/>'),
    title: 'えらすぎて姫キュン…♡',
    lines: { laundry_pose: '魔法使いかわちい〜♡ 洗濯できる子、姫的に満点', laundry_sound: 'バサバサの音、ちゃんと届いたよ♡ いい匂いの服で無敵', meal: 'いただきます聞こえた♡ ちゃんと食べる子、かわいすぎ', dryer: 'ドライヤーおつかれさま♡ 髪サラサラで今日も姫', trash_santa: 'ゴミのサンタさん、きらきら♡ 玄関もお城みたい', trash_thief: '泥棒ちゃん、ハートまで盗まれたかも…♡', original_new: '一番乗り♡ このポーズ、今日のトレンドにしちゃお', original_copy: 'まねっこ上手すぎ♡ おそろいでテンションあがる' } }
};
export const GAL_IDS = Object.keys(GALS);
export const HEX = { pink: '#FFB3DE', cyan: '#A8E6FF', lilac: '#D9C2FF', lime: '#E6F7A0' };
export const ITEM_SVG = {
  laundry: '<path d="M20 6a4 4 0 1 1 4 4v3" fill="none"/><path d="M24 13L6 22h36z" fill="none"/><path d="M10 22l-4 6l6 3v15h24V31l6-3l-4-6z" fill="#A8E6FF"/>',
  meal: '<rect x="16" y="6" width="16" height="8" rx="2" fill="#FFFFFF"/><rect x="12" y="14" width="24" height="32" rx="8" fill="#FFB3DE"/><path d="M18 26q6 4 12 0" fill="none"/><path d="M38 10l2-4l2 4l4 2l-4 2l-2 4l-2-4l-4-2z" fill="#FFF4A8"/>',
  dryer: '<rect x="8" y="10" width="32" height="12" rx="4" fill="#D9C2FF"/><path d="M12 22v18M17 22v18M22 22v18M27 22v18M32 22v18M37 22v18" fill="none"/>',
  trash: '<path d="M24 4l4 14l14 4l-14 4l-4 14l-4-14l-14-4l14-4z" fill="#E6F7A0"/><circle cx="40" cy="40" r="3" fill="#FFF4A8"/>'
};
export const ROOM_THEMES = {
  pink: { wall: ['#FFF0F8', '#FFE6F3'], accent: '#FFB3DE', rug: '#FFE6F4' },
  lilac: { wall: ['#F6EEFF', '#EFE4FF'], accent: '#D9C2FF', rug: '#F0E6FF' },
  cyan: { wall: ['#EEF9FF', '#E2F4FF'], accent: '#A8E6FF', rug: '#E2F6FF' },
  lime: { wall: ['#F8FCE6', '#F1F8D6'], accent: '#E6F7A0', rug: '#F5FCD6' },
  peach: { wall: ['#FFF4EC', '#FFEADD'], accent: '#FFC9A8', rug: '#FFEDE0' },
  mint: { wall: ['#EEFBF4', '#E1F6EA'], accent: '#A6E3C2', rug: '#E4F7EC' },
  cream: { wall: ['#FFFBEC', '#FFF4D6'], accent: '#FFE08A', rug: '#FFF6DE' },
  night: { wall: ['#E9E6F5', '#DEDAF0'], accent: '#8F86C9', rug: '#E6E2F6' }
};
