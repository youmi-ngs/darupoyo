import test from 'node:test';
import assert from 'node:assert/strict';
import { timeScene, weatherKind } from '../src/ambience.js';
test('daylight boundaries and weather conditions',()=>{
 for(const [h,period] of [[4,'night'],[5,'twilight'],[7,'day'],[16,'twilight'],[19,'night']]) assert.equal(timeScene(new Date(2026,10,7,h)).period,period);
 for(const [code,kind] of [[0,'clear'],[3,'cloudy'],[45,'cloudy'],[61,'rain'],[71,'snow'],[95,'rain']]) assert.equal(weatherKind(code),kind);
});
