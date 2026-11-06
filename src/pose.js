// MediaPipe Pose Landmarker and pose comparison, all on the device.
export function poseSimilarity(a, b) {
  const normalize = points => {
    const center = { x: (points[23].x + points[24].x) / 2, y: (points[23].y + points[24].y) / 2 };
    const scale = Math.hypot((points[11].x + points[12].x) / 2 - center.x, (points[11].y + points[12].y) / 2 - center.y) || .1;
    return points.map(p => ({ x: (p.x - center.x) / scale, y: (p.y - center.y) / scale }));
  };
  const x = normalize(a), y = normalize(b), ids = [11,12,13,14,15,16,23,24,25,26,27,28];
  return Math.round(100 * Math.max(0, 1 - ids.reduce((sum, i) => sum + Math.hypot(x[i].x-y[i].x, x[i].y-y[i].y),0) / ids.length / 2));
}

export async function createPoseLandmarker(options = {}) {
  const { FilesetResolver, PoseLandmarker } = await import('@mediapipe/tasks-vision');
  return PoseLandmarker.createFromOptions(await FilesetResolver.forVisionTasks('/models/vision'), { baseOptions: { modelAssetPath: '/models/pose.task' }, runningMode: 'IMAGE', ...options });
}

export const hasFullBody = landmarks => !!landmarks && ![11,12,23,24,27,28].some(i => landmarks[i].visibility < .5);
