// MediaPipe Image Segmenter removes the room behind the person on the device.
// Only the transparent cutout leaves this module; the original photo is never uploaded.
export async function createSegmenter() {
  const { FilesetResolver, ImageSegmenter } = await import('@mediapipe/tasks-vision');
  return ImageSegmenter.createFromOptions(await FilesetResolver.forVisionTasks('/models/vision'), {
    baseOptions: { modelAssetPath: '/models/segmenter.tflite' }, runningMode: 'IMAGE', outputConfidenceMasks: true, outputCategoryMask: false,
  });
}

// Mask 0 of the selfie multiclass model is the background; everything else is the person.
// Returns the share of pixels kept, so callers can reject frames with no person.
export function cutout(segmenter, canvas, ctx) {
  const result = segmenter.segment(canvas);
  try {
    const mask = result.confidenceMasks?.[0];
    if (!mask) throw new Error('切り抜きに失敗しました。もう一度撮ってね');
    const background = mask.getAsFloat32Array(), pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let kept = 0;
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      const person = 1 - background[Math.floor(y * mask.height / canvas.height) * mask.width + Math.floor(x * mask.width / canvas.width)];
      // Soft edge between 30% and 70% person confidence.
      const alpha = Math.max(0, Math.min(1, (person - .3) / .4));
      const offset = (y * canvas.width + x) * 4;
      if (alpha === 0) pixels.data[offset] = pixels.data[offset + 1] = pixels.data[offset + 2] = 0;
      else kept++;
      pixels.data[offset + 3] = Math.round(pixels.data[offset + 3] * alpha);
    }
    ctx.putImageData(pixels, 0, 0);
    return kept / (canvas.width * canvas.height);
  } finally { result.close(); }
}
