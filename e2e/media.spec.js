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
  await page.goto('/');await page.getByLabel('あなたの名前').fill('photo');await page.getByLabel('新しいハウスの名前').fill('camera flow');await page.getByRole('button',{name:'ハウスを作る',exact:true}).click();await expect(page.locator('.onboarding')).toHaveCount(0);
  await page.locator('[data-chore="meal"]').click();await page.getByRole('button',{name:'ごはんを撮る'}).click();await expect(page.locator('video')).toBeVisible();
  await page.getByRole('button',{name:'この写真を撮る'}).waitFor({state:'visible'});
  await page.evaluate(()=>{window.testStream=document.querySelector('video').srcObject;});
  await page.getByRole('button',{name:'この写真を撮る'}).click();
  expect(await page.locator('.capture canvas').evaluate(c => c.width / c.height)).toBeCloseTo(5 / 6);
  // 撮影直後に確認でき、撮り直してもカメラは動いたまま（#12 #13）
  await expect(page.locator('.capture canvas')).toBeVisible();await expect(page.locator('video')).toBeHidden();
  await page.getByRole('button',{name:'もう1回撮る'}).click();
  await expect(page.locator('video')).toBeVisible();await expect(page.locator('.capture canvas')).toBeHidden();
  await page.getByRole('button',{name:'この写真を撮る'}).click();
  await page.getByRole('button',{name:'この写真を使う'}).click();
  await page.getByRole('button',{name:'写真だけで進む'}).or(page.locator('#post')).first().waitFor({state:'visible'});
  if(await page.getByRole('button',{name:'写真だけで進む'}).count()) await page.getByRole('button',{name:'写真だけで進む'}).click();
  await page.getByRole('button',{name:'部屋に飾る',exact:true}).click();await expect(page.getByText('記録できた！')).toBeVisible();
  expect(await page.evaluate(()=>window.testStream.getTracks().every(t=>t.readyState==='ended'))).toBe(true);
  await page.getByRole('button',{name:'お部屋へ',exact:true}).click();await page.locator('#nav-room').click();await expect(page.locator('.mr-frame img')).toHaveCount(1);
});
test('preset pose shows live guidance and rejects a frame without a person',async({page,context})=>{
  test.setTimeout(90000);
  await context.grantPermissions(['camera']);
  await page.goto('/');await page.getByLabel('あなたの名前').fill('pose');await page.getByLabel('新しいハウスの名前').fill('pose flow');await page.getByRole('button',{name:'ハウスを作る',exact:true}).click();await expect(page.locator('.onboarding')).toHaveCount(0);
  await page.locator('[data-chore="trash"]').click();await page.getByRole('button',{name:/サンタのポーズ/}).click();
  await expect(page.locator('.capture video')).toHaveCSS('transform', 'matrix(-1, 0, 0, 1, 0, 0)');
  await expect(page.locator('.capture-status')).toHaveText('全身が入るように、少し離れてね',{timeout:30000});
  await page.getByRole('button',{name:'この写真を撮る'}).click();
  await expect(page.locator('.capture canvas')).toHaveCSS('transform', 'matrix(-1, 0, 0, 1, 0, 0)');
  await expect(page.locator('.capture-status')).toContainText('全身を見つけられませんでした');
  await expect(page.getByRole('button',{name:'もう1回撮る'})).toBeVisible();
  await expect(page.locator('.door.is-lit')).toHaveCount(0);
});
test('いただきます is recorded with the meal and plays back from the album (#9 #33)',async({page,context})=>{
  await context.grantPermissions(['camera','microphone']);
  await page.goto('/');await page.getByLabel('あなたの名前').fill('itadaki');await page.getByLabel('新しいハウスの名前').fill('voice');await page.getByRole('button',{name:'ハウスを作る',exact:true}).click();await expect(page.locator('.onboarding')).toHaveCount(0);
  await page.locator('[data-chore="meal"]').click();await page.getByRole('button',{name:'ごはんを撮る'}).click();
  await page.getByRole('button',{name:'この写真を撮る'}).click();await page.getByRole('button',{name:'この写真を使う'}).click();
  await page.getByRole('button',{name:'マイクをオンにする'}).click();
  await expect(page.locator('.meal-voice')).toHaveAttribute('data-state', 'recording');
  // Allow the real fake-device audio encoder to produce the short spoken clip.
  await page.waitForTimeout(700);
  await page.getByRole('button', { name: '録音を止める' }).click();
  await page.getByRole('button', { name: 'この音声を使う' }).click();
  await expect(page.locator('.result-main')).toHaveText('いただきますを記録！');
  await expect(page.locator('.result-card .voice-play')).toBeVisible();
  const saved=page.waitForResponse(r=>r.url().includes('/completions'));
  await page.getByRole('button',{name:'部屋に飾る',exact:true}).click();
  const post=(await (await saved).json()).post;
  expect(post.method).toBe('photo_voice');expect(post.voice_media_id).toBeTruthy();
  await page.getByRole('button',{name:'お部屋へ',exact:true}).click();await page.locator('#nav-room').click();
  await expect(page.locator('.mr-frame .voice-badge')).toHaveCount(1);
  await page.locator('.mr-frame').first().click();
  const voice=page.waitForResponse(r=>r.url().includes('/media/'+post.voice_media_id));
  await page.locator('#photo-modal .voice-play').click();
  expect((await voice).headers()['content-type']).toMatch(/^audio\//);
  await expect(page.locator('#toast')).not.toHaveText('声を再生できなかった…');
});
