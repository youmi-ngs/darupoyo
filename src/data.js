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

// Gal pictures are cut out of the supplied character art (public/gals): <id>-full.png is the whole
// body (transparent background), <id>-face.png is the head, used in round icons. <id>-outfit-full.png and
// <id>-outfit-face.png are masks of just the dress, painted in the resident's theme color (--outfit).
export const GALS = {
  heisei: { name: '平成ギャル', tag: 'Y2K・あげぽよ', bg: '#FFF1D6',
    full: '/gals/heisei-full.png', face: '/gals/heisei-face.png',
    title: 'あげぽよ〜↑↑',
    lines: { laundry_pose: '魔法使いとかチョーうける！洗濯もできるとか神だし！', laundry_sound: 'バサバサ音きこえた〜！いい匂いの服ゲットとか最強だし', meal: 'いただきます入りました〜！ちゃんと食べるとかチョーえらいじゃん', dryer: 'ドライヤー10秒完走！髪サラサラでテンアゲ↑↑', trash_santa: 'ゴミのサンタ降臨〜！玄関スッキリでちょべりぐ', trash_thief: '泥棒ポーズうけるんだけど！ゴミ出しえらすぎだし', original_new: '一番乗りじゃん！このポーズ今日の流行り決定〜', original_copy: 'まねっこ完ぺき！うちらズッ友じゃん', cutout: 'え、切り抜きチョーかわいいんだけど！プリ超えたし！' } },
  reiwa: { name: '令和ギャル', tag: 'ビジュ・それな', bg: '#E9E3FF',
    full: '/gals/reiwa-full.png', face: '/gals/reiwa-face.png',
    title: 'え、天才すぎん？',
    lines: { laundry_pose: '魔法使いビジュ良すぎ。洗濯までやるとか優勝じゃん', laundry_sound: 'バサバサ音ガチで聞こえた。えぐい、えらすぎ', meal: 'いただきます聞こえた〜。ちゃんと食べるの、ありよりのあり', dryer: 'ドライヤーおつ〜。髪ツヤツヤでビジュ爆上がり', trash_santa: 'ゴミのサンタえぐ。玄関スッキリしか勝たん', trash_thief: '泥棒ポーズ天才？ゴミ出しまでできるの尊い', original_new: '一番乗りえぐい。このポーズ今日の正解ね', original_copy: 'まねっこ精度えぐ。それなすぎてシンクロ', cutout: '切り抜きビジュ良すぎ。かわいいしか勝たん' } },
  kuro: { name: '黒ギャル', tag: '姉御・自分の機嫌は自分で', bg: '#FFF6C9',
    full: '/gals/kuro-full.png', face: '/gals/kuro-face.png',
    title: 'やるじゃん！最強！',
    lines: { laundry_pose: '魔法使いアガる〜！だるいのにやったの、マジ最強だから', laundry_sound: 'バサバサいい音！明日の服いい匂い確定じゃん', meal: 'いただきます聞こえた！食べるのも立派な家事っしょ', dryer: 'ドライヤーおつかれ！自分の機嫌、自分でとれてえらい', trash_santa: 'ゴミ出しサンタ最高！玄関も気分もアガるね', trash_thief: 'こっそりでも出したら勝ち！ウチ見てたからね', original_new: '一番乗りアツい！みんなこのポーズについてきな〜', original_copy: 'まねっこバッチリ！仲間とそろうとアガるよね', cutout: '切り抜きキマってる！マジかわいいじゃん' } },
  hime: { name: '姫ギャル', tag: '盛り髪・リボン・♡', bg: '#FFE6F4',
    full: '/gals/hime-full.png', face: '/gals/hime-face.png',
    title: 'えらすぎて姫キュン…♡',
    lines: { laundry_pose: '魔法使いかわちい〜♡ 洗濯できる子、姫的に満点', laundry_sound: 'バサバサの音、ちゃんと届いたよ♡ いい匂いの服で無敵', meal: 'いただきます聞こえた♡ ちゃんと食べる子、かわいすぎ', dryer: 'ドライヤーおつかれさま♡ 髪サラサラで今日も姫', trash_santa: 'ゴミのサンタさん、きらきら♡ 玄関もお城みたい', trash_thief: '泥棒ちゃん、ハートまで盗まれたかも…♡', original_new: '一番乗り♡ このポーズ、今日のトレンドにしちゃお', original_copy: 'まねっこ上手すぎ♡ おそろいでテンションあがる', cutout: '切り抜きかわちい〜♡ お部屋に飾りたくなっちゃう' } }
};
export const GAL_IDS = Object.keys(GALS);
const maskStyle = (url) => 'style="-webkit-mask-image:url(' + url + ');mask-image:url(' + url + ')"';
// The dress layer over a picture: --outfit when the parent sets it, else the viewer's own color (--my-outfit).
export const outfitLayer = (url, cls) => '<span class="' + cls + '" aria-hidden="true" ' + maskStyle(url) + '></span>';
export const galFaceImg = (id) => { const gid = GALS[id] ? id : 'reiwa';
  return '<img class="gal-face-img" src="' + GALS[gid].face + '" alt="" draggable="false">' + outfitLayer('/gals/' + gid + '-outfit-face.png', 'gal-outfit'); };
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
