import test from 'node:test';
import assert from 'node:assert/strict';
import { timeScene } from '../src/ambience.js';
// Weather conditions are mapped on the server now (backend/tests/test_itadakimasu_weather.py, #125).
test('daylight boundaries',()=>{
 for(const [h,period] of [[4,'night'],[5,'twilight'],[7,'day'],[16,'twilight'],[19,'night']]) assert.equal(timeScene(new Date(2026,10,7,h)).period,period);
});
