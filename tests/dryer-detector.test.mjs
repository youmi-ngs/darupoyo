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
  for (const values of [{Speech: .9}, {Music: .9}, {Steam: .9}, {Hiss: .9}, {'White noise': .9}, {'Vacuum cleaner': .9}, {Drill: .9}, {'Mechanical fan': .9}, {Wind:.9}, {'Wind noise (microphone)':.9}]) {
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

test('motor plus two airflow windows confirms a mixed dryer session; wind earns no time', () => {
  const detect=createDryerDetector(), motor=categories({Drill:.586,Tools:.668,'Hair dryer':.008});
  assert.equal(detect(motor,.0142,.975),0);
  assert.equal(detect(motor,.0099,.975),0);
  assert.equal(detect(categories({Steam:.414,Hiss:.332}),.0098,.975),0);
  assert.equal(detect(categories({Steam:.5,Hiss:.332}),.0113,.975),3.9);
  assert.equal(detect(categories({Wind:.262,'Wind noise (microphone)':.148}),.3355,.975),0);
  assert.equal(detect(categories({Steam:.082,Hiss:.059}),.0117,.975),.975);
  assert.equal(detect(motor,.0116,.975),.975);
  assert.equal(detect([],0,1),0);assert.equal(detect([],0,1),0);
  assert.equal(detect(motor,.0142,.975),0);
  assert.equal(detect(categories({Steam:.082,Hiss:.059}),.0117,.975),0);
});
test('motor history is bounded and isolated airflow bursts do not count', () => {
  const detect=createDryerDetector();
  for(let i=0;i<30;i++) assert.equal(detect(categories({Drill:.8}),.05,.975),0);
  assert.equal(detect(airflow,.05,.975),0);
  assert.equal(detect([],0,2),0);
  assert.equal(detect(airflow,.05,.975),0);
});
