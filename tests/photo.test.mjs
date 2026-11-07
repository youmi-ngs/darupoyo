import test from 'node:test';
import assert from 'node:assert/strict';
import { photoCrop } from '../src/camera.js';
test('album crop is centered at 5:6 for portrait and landscape cameras', () => {
  for (const [width, height] of [[1920, 1080], [720, 960], [500, 600]]) {
    const crop = photoCrop(width, height);
    assert.ok(Math.abs(crop.width / crop.height - 5 / 6) < 1e-10);
    assert.equal(crop.x * 2 + crop.width, width);
    assert.equal(crop.y * 2 + crop.height, height);
    assert.ok(crop.x >= 0 && crop.y >= 0);
  }
});
