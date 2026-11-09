import { setWelcomeName, setHouseName } from './onboarding-helper.js';
import { test, expect } from '@playwright/test';
test.beforeEach(async({context})=>{await context.addInitScript(()=>localStorage.setItem('darupoyo-howto-seen','1'));});
test('packaged Google models load and process blank inputs without false completion',async({page})=>{
  test.setTimeout(90000);
  await page.goto('/');
  const result = await page.evaluate(async()=>{
    const {FilesetResolver,PoseLandmarker}=await import('/node_modules/@mediapipe/tasks-vision/vision_bundle.mjs');
    const {AudioClassifier}=await import('/node_modules/@mediapipe/tasks-audio/audio_bundle.mjs');
    const pose=await PoseLandmarker.createFromOptions(await FilesetResolver.forVisionTasks('/models/vision'),{baseOptions:{modelAssetPath:'/models/pose.task'},runningMode:'IMAGE',outputSegmentationMasks:true});
    const c=document.createElement('canvas');c.width=256;c.height=256;const detected=pose.detect(c);const count=detected.landmarks.length;detected.close();pose.close();
    const {ImageSegmenter}=await import('/node_modules/@mediapipe/tasks-vision/vision_bundle.mjs');
    const seg=await ImageSegmenter.createFromOptions(await FilesetResolver.forVisionTasks('/models/vision'),{baseOptions:{modelAssetPath:'/models/segmenter.tflite'},runningMode:'IMAGE',outputConfidenceMasks:true,outputCategoryMask:false});
    const segmented=seg.segment(c);const bg=segmented.confidenceMasks[0].getAsFloat32Array();const person=bg.filter(v=>v<.5).length/bg.length;segmented.close();seg.close();
    const audio=await AudioClassifier.createFromOptions(await FilesetResolver.forAudioTasks('/models/audio'),{baseOptions:{modelAssetPath:'/models/yamnet.tflite'},maxResults:5});
    const classes=audio.classify(new Float32Array(15600),16000).flatMap(r=>r.classifications.flatMap(c=>c.categories));audio.close();
    return {count,person:person<.02,hair:classes.some(c=>/hair dryer/i.test(c.categoryName)&&c.score>=.2)};
  });
  expect(result).toEqual({count:0,person:true,hair:false});
});
test('camera capture, photo-only fallback, save and stream release',async({page,context})=>{
  await context.grantPermissions(['camera']);
  await page.goto('/');await setWelcomeName(page, 'photo');await setHouseName(page, 'camera flow');await page.getByRole('button',{name:'ハウスをつくる',exact:true}).click(); await page.getByRole('button', {name:'ハウスに入る'}).click();await expect(page.locator('.onboarding')).toHaveCount(0);
  await page.locator('.scene-dot').nth(2).click();await page.locator('[data-chore="meal"]').click();await page.getByRole('button',{name:/^たべる/}).click();await expect(page.locator('.capture video')).toBeVisible();
  await page.getByRole('button',{name:'この写真を撮る'}).waitFor({state:'visible'});
  await page.evaluate(()=>{window.testStream=document.querySelector('video').srcObject;});
  await page.getByRole('button',{name:'この写真を撮る'}).click();
  expect(await page.locator('.capture canvas').evaluate(c => c.width / c.height)).toBeCloseTo(5 / 6);
  // 撮影直後に確認でき、撮り直してもカメラは動いたまま（#12 #13）
  await expect(page.locator('.capture canvas')).toBeVisible();await expect(page.locator('.capture video')).toBeHidden();
  await page.getByRole('button',{name:'もう1回撮る'}).click();
  await expect(page.locator('.capture video')).toBeVisible();await expect(page.locator('.capture canvas')).toBeHidden();
  await expect(page.getByRole('button',{name:'いただきますをする'})).toBeDisabled(); // nothing to keep yet
  await page.getByRole('button',{name:'この写真を撮る'}).click();
  await page.getByRole('button',{name:'いただきますをする'}).click();
  await page.getByRole('button',{name:'写真だけで進む'}).click();
  await page.getByRole('button',{name:'みんなに見せる'}).click();await expect(page.getByText('記録できたよん。今日もえらい！')).toBeVisible();
  expect(await page.evaluate(()=>window.testStream.getTracks().every(t=>t.readyState==='ended'))).toBe(true);
  await page.getByRole('button',{name:'け〜じばんをちぇけらする'}).click();await page.locator('.board-back').click();await page.locator('.scene-dot').nth(5).click(); await page.locator('.door.is-me').click();await expect(page.locator('.mr-frame img')).toHaveCount(1);
});
test('preset pose is mirrored like the front camera, shows live guidance and rejects a frame without a person',async({page,context})=>{
  test.setTimeout(90000);
  await context.grantPermissions(['camera']);
  await page.goto('/');await setWelcomeName(page, 'pose');await setHouseName(page, 'pose flow');await page.getByRole('button',{name:'ハウスをつくる',exact:true}).click(); await page.getByRole('button', {name:'ハウスに入る'}).click();await expect(page.locator('.onboarding')).toHaveCount(0);
  await page.locator('.scene-dot').nth(0).click();await page.locator('[data-chore="trash"]').click();await page.getByRole('button',{name:/^ゴミ捨てる/}).click();await page.getByRole('button',{name:/サンタのポーズ/}).click();
  await expect(page.locator('.capture video')).toHaveCSS('transform', 'matrix(-1, 0, 0, 1, 0, 0)');
  await expect(page.locator('.capture-status')).toHaveText('顔と肩が入るように映ってね',{timeout:30000});
  await page.getByRole('button',{name:'この写真を撮る'}).click();
  await expect(page.locator('.capture canvas')).toHaveCSS('transform', 'matrix(-1, 0, 0, 1, 0, 0)');
  await expect(page.locator('.capture-status')).toContainText('人が見つからなかったよ');
  await expect(page.getByRole('button',{name:'もう1回撮る'})).toBeVisible();
  await expect(page.locator('.door.is-lit')).toHaveCount(0);
});
test('いただきます is recorded with the meal and plays back from the album (#9 #33)',async({page,context})=>{
  await context.grantPermissions(['camera','microphone']);
  await page.goto('/');await setWelcomeName(page, 'itadaki');await setHouseName(page, 'voice');await page.getByRole('button',{name:'ハウスをつくる',exact:true}).click(); await page.getByRole('button', {name:'ハウスに入る'}).click();await expect(page.locator('.onboarding')).toHaveCount(0);
  await page.locator('.scene-dot').nth(2).click();await page.locator('[data-chore="meal"]').click();await page.getByRole('button',{name:/^たべる/}).click();
  await page.getByRole('button',{name:'この写真を撮る'}).click();await page.getByRole('button',{name:'いただきますをする'}).click();
  // The fake mic hums nonstop: drive the loudness the page measures (a 0.6s voice, then quiet).
  await page.evaluate(() => { window.testLevel = 0; AnalyserNode.prototype.getFloatTimeDomainData = function(a) { a.fill(0); for (let i = 0; i < a.length; i += 2) a[i] = window.testLevel * Math.SQRT2; }; });
  await page.getByRole('button',{name:'マイクをオンにする'}).click();
  await expect(page.locator('.meal-voice')).toHaveAttribute('data-state', 'listening');
  await page.evaluate(() => new Promise(r => setTimeout(() => { window.testLevel = 0.2; setTimeout(() => { window.testLevel = 0; r(); }, 600); }, 400)));
  await expect(page.locator('.result-main')).toHaveText('「いただきます」聞こえた！');
  await expect(page.locator('.result-panel .voice-play')).toBeVisible();
  const saved=page.waitForResponse(r=>r.url().includes('/completions'));
  await page.getByRole('button',{name:'みんなに見せる'}).click();
  const post=(await (await saved).json()).post;
  expect(post.method).toBe('photo_voice');expect(post.voice_media_id).toBeTruthy();
  await page.getByRole('button',{name:'け〜じばんをちぇけらする'}).click();await page.locator('.board-back').click();await page.locator('.scene-dot').nth(5).click(); await page.locator('.door.is-me').click();
  await expect(page.locator('.mr-frame .voice-badge')).toHaveCount(1);
  await page.locator('.mr-frame').first().click();
  const voice=page.waitForResponse(r=>r.url().includes('/media/'+post.voice_media_id));
  await page.locator('#photo-modal .voice-play').click();
  expect((await voice).headers()['content-type']).toMatch(/^audio\//);
  await expect(page.locator('#toast')).not.toHaveText('声を再生できなかった…');
});
