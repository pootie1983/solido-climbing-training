'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('app/src/main/assets/index.html', 'utf8');
const coach = fs.readFileSync('app/src/main/assets/solido-coach.js', 'utf8');

const catalogStart = html.indexOf('const exercises = [');
const catalogEnd = html.indexOf('\n];', catalogStart);
assert.ok(catalogStart >= 0 && catalogEnd > catalogStart, 'Exercise catalogue must exist');
const catalog = html.slice(catalogStart, catalogEnd);
const exerciseIds = new Set([...catalog.matchAll(/\{id:(\d+),name:/g)].map(match => Number(match[1])));
assert.ok(exerciseIds.size >= 30, 'Expected the existing exercise catalogue to be present');

const functionStart = coach.indexOf('function buildProposal(profile,preferences){');
assert.ok(functionStart >= 0, 'Local proposal builder must exist');
const openBrace = coach.indexOf('{', functionStart);
let depth = 0, quote = null, escaped = false, functionEnd = -1;
for (let i = openBrace; i < coach.length; i++) {
  const ch = coach[i];
  if (quote) {
    if (escaped) escaped = false;
    else if (ch === '\\') escaped = true;
    else if (ch === quote) quote = null;
    continue;
  }
  if (ch === "'" || ch === '"' || ch === '\`') { quote = ch; continue; }
  if (ch === '{') depth++;
  else if (ch === '}') {
    depth--;
    if (depth === 0) { functionEnd = i + 1; break; }
  }
}
assert.ok(functionEnd > functionStart, 'Proposal builder must be a complete function');
const buildProposal = vm.runInNewContext('(' + coach.slice(functionStart, functionEnd) + ')');

const cases = [
  [{goal:'Fuerza general',age:30,level:'Intermedio'}, {equipment:'gimnasio',experience:'intermedio'}, 'Fuerza'],
  [{goal:'Fuerza general',age:30,level:'Principiante'}, {equipment:'gimnasio',experience:'intermedio'}, 'Fuerza'],
  [{goal:'Fuerza de dedos',age:30,level:'Intermedio'}, {equipment:'gimnasio',experience:'intermedio'}, 'Fuerza'],
  [{goal:'Fuerza de dedos',age:16,level:'Principiante'}, {equipment:'casa',experience:'principiante'}, 'Fuerza'],
  [{goal:'Resistencia',age:30,level:'Intermedio'}, {equipment:'gimnasio',experience:'intermedio'}, 'Resistencia'],
  [{goal:'Preparación para vías ferratas',age:30,level:'Intermedio'}, {equipment:'casa',experience:'intermedio'}, 'Escalada']
];

for (const [profile, preferences, expectedCategory] of cases) {
  const proposal = buildProposal(profile, preferences);
  assert.equal(proposal.category, expectedCategory);
  assert.ok(proposal.items.length >= 4, 'Proposal should include warm-up and main exercises');
  for (const item of proposal.items) {
    assert.ok(exerciseIds.has(item.id), 'Unknown exercise ID in proposal: ' + item.id);
    assert.ok(Number.isInteger(item.sets) && item.sets >= 1 && item.sets <= 20, 'Invalid sets');
    assert.ok(Number.isInteger(item.reps) && item.reps >= 1 && item.reps <= 100, 'Invalid reps');
    assert.ok(Number.isInteger(item.work) && item.work >= 5 && item.work <= 600, 'Invalid work duration');
    assert.ok(Number.isInteger(item.rest) && item.rest >= 0 && item.rest <= 600, 'Invalid rest duration');
  }
}
assert.equal(buildProposal({goal:'Fuerza general',age:30,level:'Intermedio'}, {equipment:'gimnasio',experience:'intermedio',limitations:'dolor'}), null, 'Limitations must suppress automatic proposals');

console.log('SOLIDO COACH checks passed: catalogue IDs, six goal/level scenarios, item bounds and limitation safety.');
