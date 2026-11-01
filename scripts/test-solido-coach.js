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
const rawBuildProposal = vm.runInNewContext('(' + coach.slice(functionStart, functionEnd) + ')');
const buildProposal = (profile, preferences) => rawBuildProposal(profile, {limitations:'', ...preferences});

const cases = [
  [{goal:'Fuerza general',age:30,level:'Intermedio'}, {equipment:'gimnasio',experience:'intermedio',days:'1'}, 'Fuerza', 1],
  [{goal:'Fuerza general',age:30,level:'Principiante'}, {equipment:'gimnasio',experience:'intermedio',days:'5'}, 'Fuerza', 5],
  [{goal:'Fuerza de dedos',age:30,level:'Intermedio'}, {equipment:'gimnasio',experience:'intermedio'}, 'Fuerza'],
  [{goal:'Fuerza general',age:28,level:'Intermedio'}, {equipment:'basico',experience:'avanzado',days:'4'}, 'Fuerza', 4],
  [{goal:'Fuerza general',age:28,level:'Intermedio'}, {equipment:'casa',experience:'intermedio',days:'7'}, 'Fuerza', 7],
  [{goal:'Fuerza de dedos',age:16,level:'Principiante'}, {equipment:'casa',experience:'principiante'}, 'Fuerza'],
  [{goal:'Fuerza de dedos',age:32,level:'Intermedio'}, {equipment:'basico',experience:'intermedio'}, 'Fuerza'],
  [{goal:'Resistencia',age:30,level:'Intermedio'}, {equipment:'gimnasio',experience:'intermedio'}, 'Resistencia'],
  [{goal:'Resistencia',age:30,level:'Intermedio'}, {equipment:'casa',experience:'intermedio'}, 'Resistencia'],
  [{goal:'Preparación para vías ferratas',age:30,level:'Intermedio'}, {equipment:'casa',experience:'intermedio'}, 'Escalada'],
  [{goal:'Fuerza general',age:35,level:'Avanzado'}, {equipment:'gimnasio',experience:'intermedio',days:'3'}, 'Fuerza', 3]
];

for (const [profile, preferences, expectedCategory, expectedDays] of cases) {
  const proposal = buildProposal(profile, preferences);
  assert.equal(proposal.category, expectedCategory);
  assert.equal(proposal.daysAvailable, expectedDays || 3, 'Weekly availability must be reflected in the proposal');
  assert.match(proposal.note, /propuesta de una sesión, no un calendario semanal automático/);
  assert.match(proposal.note, new RegExp('Disponibilidad semanal: ' + (expectedDays || 3)));
  assert.ok(proposal.items.length >= 4, 'Proposal should include warm-up and main exercises');
  for (const item of proposal.items) {
    assert.ok(exerciseIds.has(item.id), 'Unknown exercise ID in proposal: ' + item.id);
    assert.ok(Number.isInteger(item.sets) && item.sets >= 1 && item.sets <= 20, 'Invalid sets');
    assert.ok(Number.isInteger(item.reps) && item.reps >= 1 && item.reps <= 100, 'Invalid reps');
    assert.ok(Number.isInteger(item.work) && item.work >= 5 && item.work <= 600, 'Invalid work duration');
    assert.ok(Number.isInteger(item.rest) && item.rest >= 0 && item.rest <= 600, 'Invalid rest duration');
    if ((preferences.experience === 'avanzado' || profile.level === 'Avanzado') && profile.goal !== 'Fuerza de dedos' && item.label !== 'Calentamiento general' && item.label !== 'Movilidad de hombros' && item.label !== 'Movilidad de muñecas') assert.ok(item.sets <= 3, 'Advanced volume must remain capped');
    if ((preferences.equipment === 'casa' || preferences.equipment === 'basico') && ['Resistencia','Preparación para vías ferratas'].includes(profile.goal)) assert.ok(![11,29].includes(item.id), 'Wall climbing exercises require a gym/rocodrome');
  }
}
assert.equal(buildProposal({goal:'Fuerza general',age:30,level:'Intermedio'}, {equipment:'gimnasio',experience:'intermedio',limitations:'dolor'}), null, 'Limitations must suppress automatic proposals');
const conservativeFingerPlan = buildProposal({goal:'Fuerza de dedos',age:16,level:'Principiante'}, {equipment:'casa',experience:'principiante'});
assert.ok(conservativeFingerPlan.items.every(item => ![11,29].includes(item.id)), 'Conservative finger plan must not prescribe wall climbing without a gym');
assert.ok(conservativeFingerPlan.items.some(item => item.id === 9 || item.id === 32), 'Conservative finger plan should use safe general conditioning alternatives');
const adultFingerPlan = buildProposal({goal:'Fuerza de dedos',age:30,level:'Intermedio'}, {equipment:'gimnasio',experience:'intermedio'});
assert.ok(adultFingerPlan.items.some(item => item.id === 2), 'Adult gym finger plan should include gentle grip work');
assert.ok(adultFingerPlan.items.every(item => item.id !== 11), 'Finger plan should not add unrelated wall exercises');


console.log('SOLIDO COACH checks passed: catalogue IDs, eleven goal/level/equipment scenarios, item bounds and limitation safety.');


// The three coaching personalities must produce distinct, understandable advice.
function extractFunction(source, signature) {
  const start = source.indexOf(signature);
  assert.ok(start >= 0, 'Missing function: ' + signature);
  const open = source.indexOf('{', start);
  let depth = 0, quote = null, escaped = false;
  for (let i = open; i < source.length; i++) {
    const ch = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '\`') { quote = ch; continue; }
    if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error('Unclosed function: ' + signature);
}
const sessionDate = vm.runInNewContext('(' + extractFunction(coach, 'function sessionDate(item){').replace('function sessionDate(item){', 'function(item){') + ')');
const adviceSource = extractFunction(coach, 'function buildLocalAdvice(sessionList,profile,preferences,personality,healthData){')
  .replace('function buildLocalAdvice(sessionList,profile,preferences,personality,healthData){', 'function(sessionList,profile,preferences,personality,healthData){');
const buildAdvice = vm.runInNewContext('(' + adviceSource + ')', {sessionDate, Date});
const emptyProfile = {goal:'Escalada'};
const emptyPrefs = {days:'3',limitations:''};
const friendly = buildAdvice([], emptyProfile, emptyPrefs, 'cercano').body;
const funny = buildAdvice([], emptyProfile, emptyPrefs, 'gracioso').body;
const strict = buildAdvice([], emptyProfile, emptyPrefs, 'estricto').body;
assert.notEqual(friendly, funny, 'Funny personality should change the advice');
assert.notEqual(friendly, strict, 'Strict personality should change the advice');
assert.ok(friendly.startsWith('Vamos paso a paso:'));
assert.ok(funny.startsWith('¡A por ello'));
assert.ok(strict.startsWith('Objetivo claro:'));
assert.match(buildAdvice([], emptyProfile, {...emptyPrefs,days:'5'}, 'cercano').body, /Objetivo actual/);

// Acceptance must append a new plan and leave existing plans intact.
const acceptSource = extractFunction(html, 'window.solidoCoachAcceptPlanProposal=function(){')
  .replace('window.solidoCoachAcceptPlanProposal=function(){', 'function(){').replace(/;\s*$/, '');
const saved = [];
const nodes = {
  coachProposalAccept:{style:{}},
  coachProposalBody:{textContent:''},
  coachProposalItems:{innerHTML:'',}
};
const oldPlan = {id:123,category:'Fuerza',name:'Mi plan anterior',items:[]};
const context = {
  window:{solidoCoachCurrentProposal:{category:'Fuerza',name:'Propuesta test',items:[{id:19,sets:1,reps:1,work:300,rest:0}]}},
  customPlans:[oldPlan],
  estimatePlan:items=>items.reduce((sum,item)=>sum+item.work,0),
  localStorage:{setItem:(key,value)=>saved.push({key,value})},
  document:{getElementById:id=>nodes[id]||null},
  renderPlan:()=>{context.rendered=true;},
  show:page=>{context.shown=page;},
  Date
};
vm.runInNewContext('(' + acceptSource + ')()', context);
assert.equal(context.customPlans.length, 2, 'Accepting a proposal should add a new plan');
assert.equal(context.customPlans[1].id, 123, 'Existing plan should remain unchanged');
assert.equal(context.customPlans[0].source, 'solido-coach');
assert.equal(context.customPlans[0].items[0].id, 19);
assert.equal(context.customPlans[0].seconds, 300);
assert.ok(saved.some(x=>x.key==='solidoCustomPlans'), 'New plan should be persisted');
assert.equal(context.shown, 'plans', 'Accepted plan should navigate to plans');

// Preference saving must attempt every field even if one storage write fails.
const saveDetailsSource = extractFunction(coach, 'window.solidoCoachSaveDetails=function(event){')
  .replace('window.solidoCoachSaveDetails=function(event){', 'function(event){');
function runSaveDetailsTest(failingKey) {
  const values = {
    coachDays:{value:'4'},
    coachExperience:{value:'avanzado'},
    coachEquipment:{value:'basico'},
    coachLimitations:{value:'Molestias en el hombro'},
    coachSaveStatus:{textContent:''}
  };
  const attempted = [];
  let prevented = false;
  const context = {
    $: id => values[id] || null,
    write: (key, value) => {
      attempted.push({key, value});
      return key !== failingKey;
    },
    render: () => {},
  };
  vm.runInNewContext('(' + saveDetailsSource + ')({preventDefault(){}})', {
    ...context,
    event: {preventDefault(){prevented = true;}}
  });
  return {attempted, status:values.coachSaveStatus.textContent, prevented};
}
const failedPreferenceSave = runSaveDetailsTest('solidoCoachExperience');
assert.deepEqual(failedPreferenceSave.attempted.map(x=>x.key), [
  'solidoCoachDays','solidoCoachExperience','solidoCoachEquipment','solidoCoachLimitations'
], 'Every preference must be attempted even when one write fails');
assert.equal(failedPreferenceSave.status, 'No se pudieron guardar todos los datos.');
const successfulPreferenceSave = runSaveDetailsTest(null);
assert.equal(successfulPreferenceSave.attempted.length, 4);
assert.equal(successfulPreferenceSave.status, 'Preferencias guardadas en este dispositivo.');
console.log('SOLIDO COACH preference persistence checks passed: all fields attempted and partial failures reported.');

// Exhaustive safety matrix for supported goals, age bands, equipment and experience.
const matrixGoals = ['Fuerza general','Fuerza de dedos','Resistencia','Preparación para vías ferratas'];
const matrixAges = [0,15,17,18,30,70];
const matrixEquipment = ['casa','basico','gimnasio','completo'];
const matrixExperience = ['principiante','intermedio','avanzado'];
const matrixDays = ['0','1','3','7','9'];
let matrixCases = 0;
for (const goal of matrixGoals) {
  for (const age of matrixAges) {
    for (const equipment of matrixEquipment) {
      for (const experience of matrixExperience) {
        for (const days of matrixDays) {
          const proposal = buildProposal(
            {goal,age,level:experience},
            {equipment,experience,days}
          );
          assert.ok(proposal, 'A valid profile should receive a local proposal');
          assert.equal(proposal.daysAvailable, Math.max(1,Math.min(7,Number(days)||3)));
          assert.ok(proposal.items.length >= 4);
          for (const item of proposal.items) {
            assert.ok(exerciseIds.has(item.id), 'Matrix produced an unknown exercise ID: ' + item.id);
            assert.ok(item.sets >= 1 && item.sets <= 3, 'Matrix produced an unsafe set count');
            assert.ok(item.reps >= 1 && item.reps <= 100, 'Matrix produced an invalid repetition count');
            assert.ok(item.work >= 5 && item.work <= 600, 'Matrix produced an invalid work duration');
            assert.ok(item.rest >= 0 && item.rest <= 600, 'Matrix produced an invalid rest duration');
          }
          if (goal === 'Fuerza de dedos' && age < 18) {
            assert.ok(proposal.items.every(item => item.id !== 2), 'Under-18 finger plan must not prescribe grip-strength loading');
          }
          if ((equipment === 'casa' || equipment === 'basico') && ['Resistencia','Preparación para vías ferratas'].includes(goal)) {
            assert.ok(proposal.items.every(item => ![11,29].includes(item.id)), 'Home plan must not require a climbing wall');
          }
          matrixCases++;
        }
      }
    }
  }
}
console.log('SOLIDO COACH exhaustive safety matrix passed: ' + matrixCases + ' combinations.');

// Activity history regression tests: monthly totals, force measurements and date filtering.
const sessionDateSource = extractFunction(coach, 'function sessionDate(item){')
  .replace('function sessionDate(item){', 'function(item){');
const statsSource = extractFunction(coach, 'function getActivityStats(sessionList){')
  .replace('function getActivityStats(sessionList){', 'function(sessionList){');
const dateContext = {Date};
const parseSessionDate = vm.runInNewContext('(' + sessionDateSource + ')', dateContext);
const getStats = vm.runInNewContext('(' + statsSource + ')', {Date, sessionDate});
const fixedNow = new Date();
const daysAgo = days => {
  const d = new Date(fixedNow);
  d.setDate(d.getDate() - days);
  return d.toLocaleDateString('es-ES') + ', 10:30';
};
const history = [
  {date:daysAgo(2),mins:45},
  {date:daysAgo(12),mins:30},
  {date:daysAgo(45),mins:90},
  {date:'fecha no válida',mins:120},
  {date:daysAgo(1),force:22.5,hand:'izquierda',grip:'20'},
  {date:daysAgo(40),force:25,hand:'derecha',grip:'18'},
  {date:'01/01/2099, 10:30',mins:500,force:99,hand:'futura',grip:'99'}
];
const stats = getStats(history);
assert.equal(stats.total, 3, 'Total saved training sessions should exclude force tests, invalid dates and future entries');
assert.equal(stats.month, 2, 'Monthly session count should exclude old and invalid dates');
assert.equal(stats.minutes, 75, 'Monthly training minutes should sum only valid recent sessions');
assert.equal(stats.forceCount, 1, 'Monthly force count should include only recent valid measurements');
assert.equal(stats.bestForce, 25, 'Best force should ignore future-dated measurements');
assert.equal(stats.latestForce, 22.5, 'Latest force should use the newest measurement');
assert.equal(stats.latestForceHand, 'izquierda');
assert.equal(stats.latestForceGrip, '20');
assert.ok(parseSessionDate({ts:Date.now()}) instanceof Date, 'Valid timestamp should be parsed');
assert.equal(parseSessionDate({date:'not a date'}), null, 'Invalid date should be ignored');
assert.equal(parseSessionDate({date:'31/02/2026, 10:30'}), null, 'Impossible calendar dates should be rejected');
console.log('SOLIDO COACH activity history checks passed: date filtering, monthly totals and force measurements.');

const recentAdvice = buildAdvice([{date:daysAgo(1),mins:50}], emptyProfile, emptyPrefs, 'cercano');
assert.match(recentAdvice.title, /Siguiente paso|Buena constancia/);
assert.match(recentAdvice.body, /últimas 24 horas/, 'Recent activity should trigger a recovery reminder');
const staleAdvice = buildAdvice([{date:daysAgo(10),mins:40}], emptyProfile, emptyPrefs, 'cercano');
assert.equal(staleAdvice.title, 'Vamos a crear una rutina', 'Old activity should not be treated as recent training');
const limitationAdvice = buildAdvice([{date:daysAgo(1),mins:50}], emptyProfile, {...emptyPrefs,limitations:'molestia de hombro'}, 'estricto');
assert.match(limitationAdvice.body, /molestia de hombro/);
assert.match(limitationAdvice.body, /detén la actividad si aparece dolor/);
const weeklyAdvice = buildAdvice([
  {date:daysAgo(1),mins:40},
  {date:daysAgo(2),mins:45},
  {date:daysAgo(3),mins:35}
], emptyProfile, {...emptyPrefs,days:'3'}, 'cercano');
assert.equal(weeklyAdvice.title, 'Buena constancia esta semana');
assert.match(weeklyAdvice.body, /120 minutos/);
console.log('SOLIDO COACH advice regression checks passed: recent recovery, stale activity, limitations and weekly consistency.');

const shortSleepAdvice = buildAdvice([], emptyProfile, emptyPrefs, 'cercano', {sleepMinutes:330});
assert.match(shortSleepAdvice.body, /último registro de sueño fue inferior a 6 horas/);
assert.match(shortSleepAdvice.body, /no determina tu recuperación/);
const adequateSleepAdvice = buildAdvice([], emptyProfile, emptyPrefs, 'cercano', {sleepMinutes:420});
assert.doesNotMatch(adequateSleepAdvice.body, /último registro de sueño/);
const noSleepPermissionAdvice = buildAdvice([], emptyProfile, emptyPrefs, 'cercano', {sleepMinutes:null});
const missingSleepAdvice = buildAdvice([], emptyProfile, emptyPrefs, 'cercano', {});
assert.doesNotMatch(noSleepPermissionAdvice.body, /último registro de sueño/);
assert.doesNotMatch(missingSleepAdvice.body, /último registro de sueño/);
console.log('SOLIDO COACH Health Connect checks passed: optional sleep context is cautious and never blocks local advice.');


