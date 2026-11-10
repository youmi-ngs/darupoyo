import test from 'node:test';
import assert from 'node:assert/strict';
import { createDryerDetector } from '../src/dryer-detector.js';
const categories = values => Object.entries(values).map(([categoryName, score]) => ({categoryName, score}));
const airflow = categories({Steam: .74, Hiss: .59, Water: .33});
test('dryer evidence enables sustained airflow, but silence stops counting and expires it', () => {
  const detect = createDryerDetector();
  assert.equal(detect(airflow, .05, .975), 0);
  assert.equal(detect(categories({'Hair dryer': .1484375}), .08, .975), 1.95);
  for (let i = 0; i < 11; i++) assert.equal(detect(airflow, .05, .975), .975);
  for (let i = 0; i < 3; i++) assert.equal(detect([], 0, .975), 0);
  assert.equal(detect(airflow, .05, .975), 0);
});
test('loud sound, speech, music, or a single airflow label never start counting', () => {
  for (const values of [{Speech: .9}, {Music: .9}, {Steam: .9}, {Hiss: .9}, {'White noise': .9}, {'Vacuum cleaner': .9}]) {
    const detect = createDryerDetector();
    for (let i = 0; i < 20; i++) assert.equal(detect(categories(values), .8, .975), 0);
  }
});
test('sustained jointly classified airflow can start without a fragile dryer label', () => {
  const detect = createDryerDetector();
  for (let i = 0; i < 3; i++) assert.equal(detect(airflow, .05, .975), 0);
  assert.equal(detect(airflow, .05, .975), 3.9);
  assert.equal(detect([...airflow, ...categories({Music: .8})], .05, .975), 0);
});
test('brief interruptions do not count, competing speech blocks continuation, sessions are isolated', () => {
  const detect = createDryerDetector();
  assert.equal(detect(categories({'Hair dryer': .8}), .05, .975), .975);
  assert.equal(detect([], .05, .975), 0);
  assert.equal(detect(airflow, .05, .975), .975);
  assert.equal(detect([...airflow, ...categories({Speech: .8})], .05, .975), 0);
  assert.equal(createDryerDetector()(airflow, .05, .975), 0);
  assert.equal(detect(categories({'Hair dryer': .8}), 0, .975), 0);
});
