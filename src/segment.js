// Removes the room behind the person. Only the transparent cutout leaves this module.
export function applyMask(canvas, ctx, mask) {
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height), values = mask.getAsFloat32Array();
  for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
    const confidence = values[Math.floor(y * mask.height / canvas.height) * mask.width + Math.floor(x * mask.width / canvas.width)];
    const offset = (y * canvas.width + x) * 4;
    if (confidence < .8) { pixels.data[offset] = pixels.data[offset+1] = pixels.data[offset+2] = pixels.data[offset+3] = 0; }
  }
  ctx.putImageData(pixels, 0, 0);
}
