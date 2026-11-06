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
    const audio=await AudioClassifier.createFromOptions(await FilesetResolver.forAudioTasks('/models/audio'),{baseOptions:{modelAssetPath:'/models/yamnet.tflite'},maxResults:5});
    const classes=audio.classify(new Float32Array(15600),16000).flatMap(r=>r.classifications.flatMap(c=>c.categories));audio.close();
    return {count,hair:classes.some(c=>/hair dryer/i.test(c.categoryName)&&c.score>=.2)};
  });
  expect(result).toEqual({count:0,hair:false});
});
test('camera capture, photo-only fallback, save and stream release',async({page,context})=>{
  await context.grantPermissions(['camera']);
  await page.goto('/');await page.getByLabel('あなたの名前').fill('photo');await page.getByLabel('新しいハウスの名前').fill('camera flow');await page.getByRole('button',{name:'ハウスを作る',exact:true}).click();await expect(page.locator('.onboarding')).toHaveCount(0);
  await page.locator('[data-chore="meal"]').click();await page.getByRole('button',{name:'ごはんを撮る'}).click();await expect(page.locator('video')).toBeVisible();
  await page.getByRole('button',{name:'この写真を撮る'}).waitFor({state:'visible'});
  await page.evaluate(()=>{window.testStream=document.querySelector('video').srcObject;});
  await page.getByRole('button',{name:'この写真を撮る'}).click();
  await page.getByRole('button',{name:'写真だけで進む'}).or(page.locator('#post')).first().waitFor({state:'visible'});
  if(await page.getByRole('button',{name:'写真だけで進む'}).count()) await page.getByRole('button',{name:'写真だけで進む'}).click();
  await page.getByRole('button',{name:'部屋に飾る',exact:true}).click();await expect(page.getByText('記録できた！')).toBeVisible();
  expect(await page.evaluate(()=>window.testStream.getTracks().every(t=>t.readyState==='ended'))).toBe(true);
  await page.getByRole('button',{name:'お部屋へ',exact:true}).click();await page.locator('#nav-room').click();await expect(page.locator('.mr-frame img')).toHaveCount(1);
});
