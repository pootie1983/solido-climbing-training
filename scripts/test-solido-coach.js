'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('app/src/main/assets/index.html', 'utf8');
const coach = fs.readFileSync('app/src/main/assets/solido-coach.js', 'utf8');
assert.match(coach, /let coachFormInitialized=false;/, 'Coach preferences form should track its first initialization');
assert.match(coach, /if\(!coachFormInitialized\)\{[\s\S]*?coachFormInitialized=true;/, 'Changing Coach personality must not overwrite unsaved preference edits');
assert.match(coach, /const parsed=JSON\.parse\(read\('solidoSessions','\[\]'\)\);return Array\.isArray\(parsed\)\?parsed\.filter\(item=>item&&typeof item==='object'&&!Array\.isArray\(item\)\):\[\];/, 'Coach must ignore malformed session history entries safely');

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


// Exhaustively verify every supported goal, equipment option and experience level.
for (const goal of ['Fuerza general','Fuerza de dedos','Resistencia','Preparación para vías ferratas']) {
  for (const equipment of ['casa','basico','gimnasio','completo']) {
    for (const level of ['Principiante','Intermedio','Avanzado']) {
      for (const age of [16,30,65]) {
        const proposal = buildProposal({goal,age,level},{equipment,experience:level.toLowerCase(),days:'3'});
        assert.ok(proposal && proposal.items.length >= 4, 'Every supported profile should return a non-empty safe proposal: ' + [goal,equipment,level,age].join('/'));
        for (const item of proposal.items) {
          assert.ok(exerciseIds.has(item.id), 'Proposal references an exercise missing from the catalogue: ' + item.id);
          assert.ok(item.sets >= 1 && item.sets <= 3, 'Proposal set count must remain conservative and bounded');
          assert.ok(item.reps >= 1 && item.reps <= 100, 'Proposal repetitions must remain bounded');
          assert.ok(item.work >= 5 && item.work <= 600, 'Proposal work duration must remain bounded');
          assert.ok(item.rest >= 0 && item.rest <= 600, 'Proposal rest duration must remain bounded');
        }
        if (goal === 'Fuerza de dedos' && age < 18) {
          assert.ok(proposal.items.every(item => ![2,28,11,29].includes(item.id)), 'Under-18 finger-strength proposals must avoid loaded finger-specific or wall exercises');
        }
        if (['casa','basico'].includes(equipment) && ['Resistencia','Preparación para vías ferratas'].includes(goal)) {
          assert.ok(proposal.items.every(item => ![11,29].includes(item.id)), 'Home proposals must not require a climbing wall');
        }
      }
    }
  }
}
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
assert.match(friendly, /Escucha tu cuerpo; la constancia y una buena recuperación/,'Friendly personality should reinforce listening to the body and recovery');
assert.match(funny, /no hace falta correr\. Descansar también forma parte del entrenamiento/,'Funny personality should keep a safe recovery reminder');
assert.match(strict, /Cumple los descansos, cuida la técnica y no fuerces cuando aparezca dolor/,'Strict personality should remain safety-first rather than encouraging overtraining');
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

const unchangedPlan = {id:456,category:'Resistencia',name:'Plan que ya existía',items:[]};
let unexpectedSave = false;
const noProposalContext = {
  window:{solidoCoachCurrentProposal:null},
  customPlans:[unchangedPlan],
  localStorage:{setItem:()=>{unexpectedSave=true;}},
  document:{getElementById:()=>null},
  renderPlan:()=>{throw new Error('A missing proposal must not render a new plan');},
  show:()=>{throw new Error('A missing proposal must not navigate');},
  Date
};
vm.runInNewContext('(' + acceptSource + ')()', noProposalContext);
assert.deepEqual(noProposalContext.customPlans, [unchangedPlan], 'A missing or blocked proposal must leave existing plans untouched');
assert.equal(unexpectedSave, false, 'A missing proposal must not write to storage');

const storageFailurePlan = {id:789,category:'Fuerza',name:'Plan protegido',items:[]};
let storageFailureAlert = '';
const storageFailureContext = {
  window:{solidoCoachCurrentProposal:{category:'Fuerza',name:'Propuesta no guardable',items:[{id:19,sets:1,reps:1,work:300,rest:0}]}},
  customPlans:[storageFailurePlan],
  estimatePlan:items=>items.reduce((sum,item)=>sum+item.work,0),
  localStorage:{setItem:()=>{throw new Error('storage full');}},
  document:{getElementById:()=>null},
  renderPlan:()=>{throw new Error('Failed persistence must not navigate to plans');},
  show:()=>{throw new Error('Failed persistence must not navigate');},
  alert:message=>{storageFailureAlert=message;},
  Date
};
vm.runInNewContext('(' + acceptSource + ')()', storageFailureContext);
assert.deepEqual(storageFailureContext.customPlans, [storageFailurePlan], 'A storage failure must roll back the new plan and preserve previous plans');
assert.match(storageFailureAlert, /Tus planes anteriores no se han modificado/);


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

assert.ok(parseSessionDate({ts:new Date(Date.now()-60*60*1000).toISOString()}) instanceof Date, 'ISO timestamps from completed sessions should be parsed');
assert.ok(parseSessionDate({date:new Date(Date.now()-60*60*1000).toLocaleString('es-ES')}) instanceof Date, 'Legacy localized session dates should remain readable');

console.log('SOLIDO COACH activity history checks passed: date filtering, monthly totals and force measurements.');

const recentAdvice = buildAdvice([{ts:new Date(Date.now()-60*60*1000).toISOString(),mins:50}], emptyProfile, emptyPrefs, 'cercano');
assert.match(recentAdvice.title, /Siguiente paso|Buena constancia/);
assert.match(recentAdvice.body, /últimas 24 horas/, 'Recent activity should trigger a recovery reminder');
const staleAdvice = buildAdvice([{date:daysAgo(10),mins:40}], emptyProfile, emptyPrefs, 'cercano');
assert.equal(staleAdvice.title, 'Vamos a crear una rutina', 'Old activity should not be treated as recent training');
const limitationAdvice = buildAdvice([{ts:new Date(Date.now()-60*60*1000).toISOString(),mins:50}], emptyProfile, {...emptyPrefs,limitations:'molestia de hombro'}, 'estricto');
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

const proposalBlockSource = extractFunction(coach, 'function getProposalBlockReason(sessionList,preferences,healthData){')
  .replace('function getProposalBlockReason(sessionList,preferences,healthData){', 'function(sessionList,preferences,healthData){');
const getProposalBlockReason = vm.runInNewContext('(' + proposalBlockSource + ')', {sessionDate, Date});
const restedPreferences = {...emptyPrefs,limitations:''};
assert.equal(getProposalBlockReason([{date:new Date(Date.now()-2*60*60*1000).toLocaleString('es-ES'),mins:35}],restedPreferences,null).includes('últimas 24 horas'), true, 'Recent legacy sessions without ISO timestamps must still trigger recovery');
assert.equal(getProposalBlockReason([{ts:new Date(Date.now()-2*60*60*1000).toISOString(),mins:0}],restedPreferences,null), '', 'Zero-duration records must not be treated as completed training sessions');
assert.equal(getProposalBlockReason([{ts:new Date(Date.now()-2*60*60*1000).toISOString(),mins:35,force:24}],restedPreferences,null), '', 'Force measurements must not be treated as training sessions even when they have duration metadata');

assert.match(getProposalBlockReason([{ts:Date.now()-2*60*60*1000,mins:45}],restedPreferences,null), /últimas 24 horas/, 'A completed session from two hours ago should block another automatic proposal');
assert.equal(getProposalBlockReason([{ts:Date.now()-26*60*60*1000,mins:45}],restedPreferences,null), '', 'Training older than 24 hours should not block a new proposal');
assert.equal(getProposalBlockReason([{ts:Date.now()-2*60*60*1000,force:25}],restedPreferences,null), '', 'Force tests should not count as a training session for recovery blocking');
assert.equal(getProposalBlockReason([{date:'01/01/2099, 10:30',mins:45}],restedPreferences,null), '', 'Future training entries must not trigger recovery blocking');
assert.match(getProposalBlockReason([],restedPreferences,{sleepMinutes:330}), /menos de 6 horas/, 'Short sleep should block automatic loading proposals');
assert.equal(getProposalBlockReason([],restedPreferences,{sleepMinutes:null}), '', 'Missing sleep data must not block proposals');
assert.match(getProposalBlockReason([], {...restedPreferences,limitations:'molestia de hombro'},null), /lesión o limitación/, 'Declared limitations must block automatic proposals');

assert.match(coach, /const proposalBlockReason=getProposalBlockReason\(sessionList,preferences,window\.solidoCoachHealthData\|\|null\);\s*const proposal=proposalBlockReason\?null:buildProposal\(profile,preferences\);/, 'The renderer must apply recovery gates before creating a proposal');
assert.match(coach, /window\.solidoCoachCurrentProposal=proposal\?\{[\s\S]*?:null;/, 'A blocked proposal must not remain available as a stale current proposal');
assert.match(coach, /if\(proposalButton\)proposalButton\.style\.display=proposal&&!initialPlanReady\?'block':'none';/, 'The accept button must be hidden when a proposal is blocked or already saved automatically');

console.log('SOLIDO COACH recovery gate checks passed: recent sessions, short sleep, limitations and invalid records.');


const bridge = fs.readFileSync('app/src/main/java/com/solidoclimbing/training/HealthConnectBridge.kt', 'utf8');
const mainActivity = fs.readFileSync('app/src/main/java/com/solidoclimbing/training/MainActivity.kt', 'utf8');
assert.match(mainActivity, /healthPermissions: Set<String> = setOf\([\s\S]*?HeartRateRecord::class[\s\S]*?SleepSessionRecord::class/, 'The Android permission request should offer optional heart rate and sleep access');

assert.match(bridge, /private val requiredPermissions = setOf\([\s\S]*?StepsRecord::class[\s\S]*?DistanceRecord::class[\s\S]*?TotalCaloriesBurnedRecord::class[\s\S]*?\)/, 'Only steps, distance and calories should be required for core Health Connect data');
assert.doesNotMatch(bridge.match(/private val requiredPermissions = setOf\([\s\S]*?\n    \)/)?.[0] || '', /HeartRateRecord|SleepSessionRecord/, 'Heart rate and sleep must remain optional');
assert.match(bridge, /private val optionalHeartRatePermission =\s*HealthPermission\.getReadPermission\(HeartRateRecord::class\)/);
assert.doesNotMatch(bridge.match(/private val requiredPermissions = setOf\([\s\S]*?\n    \)/)?.[0] || '', /SleepSessionRecord/, 'Sleep must remain optional');
assert.match(bridge, /private val optionalSleepPermission =\s*HealthPermission\.getReadPermission\(SleepSessionRecord::class\)/);
assert.match(bridge, /if \(granted\.contains\(optionalSleepPermission\)\)/);
assert.match(bridge, /val sleepMinutes = if \(granted\.contains\(optionalSleepPermission\)\) \{\s*try \{/);
assert.match(bridge, /catch \(_:\s*Exception\)\s*\{\s*null\s*\}/, 'A sleep read failure must be isolated and treated as missing optional data');
assert.match(bridge, /result\.put\("status", "ok"\)[\s\S]*?val sleepMinutes = if[\s\S]*?result\.put\("sleepMinutes", sleepMinutes \?: JSONObject\.NULL\)/, 'Core metrics must remain successful when optional sleep data is unavailable');
assert.match(bridge, /val averageBpm = if \(granted\.contains\(optionalHeartRatePermission\)\) \{\s*try \{[\s\S]*?HeartRateRecord::class[\s\S]*?catch \(_:\s*Exception\)\s*\{\s*null\s*\}[\s\S]*?result\.put\("heartRate", averageBpm \?: JSONObject\.NULL\)/, 'Heart rate is read only with its optional permission and failures do not invalidate steps and calories');


assert.match(bridge, /result\.put\("sleepMinutes", sleepMinutes \?: JSONObject\.NULL\)/);
assert.match(bridge, /\}\s*else\s*\{\s*null\s*\}\s*result\.put\("sleepMinutes", sleepMinutes \?: JSONObject\.NULL\)/, 'Missing sleep permission must return a null metric without failing core Health Connect data');
assert.match(html, /window\.solidoCoachHealthData=data&&data\.status==='ok'\?[\s\S]*?sleepMinutes:data\.sleepMinutes==null\?null:Number\(data\.sleepMinutes\)/, 'The WebView callback must pass optional sleep data into local advice');

assert.match(html, /heartRate:data\.heartRate==null\?null:Number\(data\.heartRate\)/, 'Missing optional heart-rate data must be represented as null, not zero');
assert.match(html, /sleepMinutes:data\.sleepMinutes==null\?null:Number\(data\.sleepMinutes\)/, 'Missing optional sleep data must be represented as null');
assert.match(html, /set\('hcHeart',data\.heartRate==null\?'—':data\.heartRate\+' bpm'\)/, 'The UI must show unavailable heart rate clearly when permission or records are missing');
assert.match(html, /set\('hcSleep',data\.sleepMinutes==null\?'Sin datos'/, 'The UI must show unavailable sleep clearly when permission or records are missing');
assert.match(html, /set\('hcSteps',Number\(data\.steps\|\|0\)\.toLocaleString\('es-ES'\)\)[\s\S]*?set\('hcCalories',Math\.round\(data\.totalCalories\|\|0\)/, 'Core steps and calorie metrics must still be rendered when optional metrics are null');

console.log('SOLIDO COACH Health Connect integration contract passed: required metrics, optional sleep permission and WebView mapping.');

const coachUiIds = ['coachProposalBody','coachProposalItems','coachProposalAccept','coachAdviceTitle','coachAdviceBody','coachProfileSummary','coachHealthSummary','coachDays','coachExperience','coachEquipment','coachLimitations','coachSaveStatus','coachPersonalitySummary'];
for (const id of coachUiIds) {
  const doubleQuoted = html.split('id="' + id + '"').length - 1;
  const singleQuoted = html.split("id='" + id + "'").length - 1;
  assert.equal(doubleQuoted + singleQuoted, 1, 'Coach UI element must exist exactly once: ' + id);
}
assert.ok(html.includes('onsubmit="solidoCoachSaveDetails(event)"'), 'Coach preferences form must be connected to its save handler');
for (const personality of ['cercano','gracioso','estricto']) {
  assert.ok(html.includes("solidoCoachSetPersonality('" + personality + "')"), 'Coach personality button must be connected: ' + personality);
}
assert.match(html, /onclick=["']solidoCoachAcceptPlanProposal\(\)["']/, 'Accept proposal button must be connected to the guarded acceptance handler');
assert.match(coach, /const proposalBlockReason=getProposalBlockReason\(sessionList,preferences,window\.solidoCoachHealthData\|\|null\);/, 'Coach rendering must apply recovery checks');






// The first valid profile must receive a plan automatically, without waiting for training history.
const ensureInitialPlanSource = extractFunction(html, 'window.solidoCoachEnsureInitialPlan=function(proposal){')
  .replace('window.solidoCoachEnsureInitialPlan=function(proposal){', 'function(proposal){');
function makeInitialPlanContext(overrides={}) {
  const stored=[];
  const context={
    customPlans:[],
    readPersonalProfile:()=>({nickname:'Escalador',grade:'6a',height:'175',age:'30',weight:'70'}),
    validPersonalProfile:()=>true,
    estimatePlan:items=>items.reduce((sum,item)=>sum+item.work,0),
    localStorage:{setItem:(key,value)=>stored.push({key,value})},
    renderPlan:()=>{context.rendered=true;},
    Date,
    stored,
    ...overrides
  };
  return context;
}
const autoPlanProposal={category:'Fuerza',name:'SOLIDO COACH · Plan inicial',items:[{id:19,sets:1,reps:1,work:300,rest:0}]};
const autoPlanContext=makeInitialPlanContext();
const ensureInitialPlan=vm.runInNewContext('('+ensureInitialPlanSource+')',autoPlanContext);
assert.equal(ensureInitialPlan.call(autoPlanContext,autoPlanProposal),true,'A valid first profile should automatically create a plan');
assert.equal(autoPlanContext.customPlans.length,1);
assert.equal(autoPlanContext.customPlans[0].source,'solido-coach-initial');
assert.equal(autoPlanContext.customPlans[0].items[0].id,19);
assert.ok(autoPlanContext.stored.some(item=>item.key==='solidoCustomPlans'));
assert.equal(autoPlanContext.rendered,true);
assert.equal(ensureInitialPlan.call(autoPlanContext,autoPlanProposal),true);
assert.equal(autoPlanContext.customPlans.length,1,'Repeated Coach renders must not create duplicate initial plans');
const existingButBlockedContext=makeInitialPlanContext({customPlans:[{source:'solido-coach-initial'}]});
const ensureExistingButBlocked=vm.runInNewContext('('+ensureInitialPlanSource+')',existingButBlockedContext);
assert.equal(ensureExistingButBlocked(null),false,'An existing plan must not mask a current recovery or safety block');
const blockedInitialPlanContext=makeInitialPlanContext();
const ensureBlockedPlan=vm.runInNewContext('('+ensureInitialPlanSource+')',blockedInitialPlanContext);
assert.equal(ensureBlockedPlan(null),false,'Safety-blocked or unavailable proposals must not create a plan');
assert.equal(blockedInitialPlanContext.customPlans.length,0);
const invalidProfileContext=makeInitialPlanContext({validPersonalProfile:()=>false});
const ensureInvalidProfilePlan=vm.runInNewContext('('+ensureInitialPlanSource+')',invalidProfileContext);
assert.equal(ensureInvalidProfilePlan(autoPlanProposal),false,'An incomplete profile must not create a plan');
assert.equal(invalidProfileContext.customPlans.length,0);
const failedInitialStorageContext=makeInitialPlanContext({localStorage:{setItem:()=>{throw new Error('storage full');}}});
const ensureFailedStoragePlan=vm.runInNewContext('('+ensureInitialPlanSource+')',failedInitialStorageContext);
assert.equal(ensureFailedStoragePlan(autoPlanProposal),false);
assert.equal(failedInitialStorageContext.customPlans.length,0,'Storage failure must roll back the automatic plan');
assert.match(coach,/window\.solidoCoachEnsureInitialPlan\(window\.solidoCoachCurrentProposal\)/,'Coach rendering must trigger automatic first-plan creation');
assert.match(coach,/initialPlanReady\?'Tu primer plan ya está creado/,'Coach must tell the user when the first plan is ready');
assert.match(html,/function completeFirstProfile\(event\)[\s\S]*?window\.solidoCoachRender\(\)/,'Saving the first profile must refresh Coach immediately');

// Accepting a Coach proposal must be safe, idempotent after success, and rollback on storage failure.
const acceptProposalSource = extractFunction(html, 'window.solidoCoachAcceptPlanProposal=function(){')
  .replace('window.solidoCoachAcceptPlanProposal=function(){', 'function(){');
function makeAcceptProposalContext(storageFails=false) {
  const previous={id:7,name:'Mi plan anterior',source:'manual'};
  const elements={
    coachProposalAccept:{style:{}},
    coachProposalBody:{textContent:''},
    coachProposalItems:{innerHTML:'contenido'}
  };
  const context={
    window:{solidoCoachCurrentProposal:{category:'Fuerza',name:'SOLIDO COACH · Prueba',items:[{id:19,sets:1,reps:1,work:300,rest:0}]}},
    customPlans:[previous],
    Date,
    estimatePlan:items=>items.reduce((sum,item)=>sum+item.work,0),
    localStorage:{setItem:(key,value)=>{if(storageFails)throw new Error('storage full');context.saved={key,value};}},
    alert:message=>{context.alerted=message;},
    document:{getElementById:id=>elements[id]||null},
    renderPlan:()=>{context.rendered=true;},
    show:screen=>{context.shown=screen;},
    elements,
    previous
  };
  return context;
}
const acceptedContext=makeAcceptProposalContext();
const acceptProposal = vm.runInNewContext('('+acceptProposalSource+')',acceptedContext);
acceptProposal.call(acceptedContext);
assert.equal(acceptedContext.customPlans.length,2,'Accepting a proposal should append a new plan without deleting existing plans');
assert.equal(acceptedContext.customPlans[1],acceptedContext.previous);
assert.equal(acceptedContext.customPlans[0].source,'solido-coach');
assert.equal(acceptedContext.window.solidoCoachCurrentProposal,null,'Successful acceptance should clear the pending proposal');
assert.equal(acceptedContext.shown,'plans');
assert.equal(acceptedContext.rendered,true);
acceptProposal.call(acceptedContext);
assert.equal(acceptedContext.customPlans.length,2,'A repeated click after acceptance must not create duplicate plans');
const failedAcceptContext=makeAcceptProposalContext(true);
const failedAcceptProposal=vm.runInNewContext('('+acceptProposalSource+')',failedAcceptContext);
failedAcceptProposal.call(failedAcceptContext);
assert.equal(failedAcceptContext.customPlans.length,1,'Storage failure must roll back the new plan');
assert.equal(failedAcceptContext.customPlans[0],failedAcceptContext.previous,'Storage failure must preserve every existing plan');
assert.match(failedAcceptContext.alerted,/no se han modificado/i);
assert.ok(failedAcceptContext.window.solidoCoachCurrentProposal,'A failed save should keep the proposal available for retry');
const emptyAcceptContext=makeAcceptProposalContext();
emptyAcceptContext.window.solidoCoachCurrentProposal=null;
vm.runInNewContext('('+acceptProposalSource+')',emptyAcceptContext).call(emptyAcceptContext);
assert.equal(emptyAcceptContext.customPlans.length,1,'Accepting without a proposal must be a no-op');

// Plan sessions must announce their start, rests, resumed work and exercise transitions.
// These cues reuse the existing workout audio/notice helpers; the force hand-switch flow is untouched.
const planRunnerSource=html.slice(html.indexOf('let planRunState=null'),html.indexOf('/* =========================\n   ESTADÍSTICAS',html.indexOf('let planRunState=null')));
assert.match(planRunnerSource,/playWorkoutCue\('start'\)/);
assert.match(planRunnerSource,/showWorkoutNotice\('start'/);
assert.match(planRunnerSource,/playWorkoutCue\('rest'\)/);
assert.match(planRunnerSource,/showWorkoutNotice\('rest'/);
assert.match(planRunnerSource,/if\(st\.phase==='rest'\)[\s\S]*?DESCANSO EN CURSO/,'Resuming during a rest period must keep the rest notice instead of telling the user to work');
assert.match(planRunnerSource,/restReason==='set'\?'SIGUIENTE SERIE':restReason==='rep'\?'SIGUIENTE REPETICIÓN'/,'The notice after rest must identify the correct next set or repetition');
assert.match(html,/const restIntervals=Math\.max\(0,sets\*reps-1\);[\s\S]*?return sets\*reps\*work\+restIntervals\*rest;/,'The plan duration must include every rest between work intervals');
const estimateItemSource=extractFunction(html,'function estimatePlanItem(item){');
const estimatePlanSource=extractFunction(html,'function estimatePlan(items){');
const estimateContext={Math,Number};
estimateContext.estimatePlanItem=vm.runInNewContext('('+estimateItemSource.replace('function estimatePlanItem(item){','function(item){')+')',estimateContext);
const estimatePlan=vm.runInNewContext('('+estimatePlanSource.replace('function estimatePlan(items){','function(items){')+')',estimateContext);
assert.equal(estimatePlan([{sets:2,reps:2,work:5,rest:2},{sets:1,reps:1,work:5,rest:0}]),31,'Displayed duration must match timed work and intra-exercise rests; the runner has no inter-exercise pause');
assert.equal(estimatePlan([]),0,'An empty plan must have zero duration');
assert.match(planRunnerSource,/SIGUIENTE EJERCICIO/);
assert.match(html,/function updateWorkoutSwitchOverlay\(\)/,'Existing force hand-switch overlay must remain present');
assert.match(html,/id="workoutSwitchOverlay"/,'Existing force hand-switch UI must remain present');
assert.match(html,/id="workoutNotice"/,'Plan cues must reuse the existing visual workout notice');

 
// Exercise the plan runner state machine, not only the presence of cue strings.
const runnerFunctions = {
  startPlanRunRest: extractFunction(html, 'function startPlanRunRest(st,item,reason){'),
  tickPlanRun: extractFunction(html, 'function tickPlanRun(){'),
  advancePlanRunExercise: extractFunction(html, 'function advancePlanRunExercise(){')
};
const runnerEvents=[];
const runnerContext={
  planRunState:null,
  planRunInterval:null,
  exercises:[{id:1,name:'Agarre suave'},{id:2,name:'Movilidad'}],
  playWorkoutCue:kind=>runnerEvents.push({type:'sound',kind}),
  showWorkoutNotice:(kind,title,message)=>runnerEvents.push({type:'notice',kind,title,message}),
  renderPlanRun:()=>runnerEvents.push({type:'render'}),
  finishPlanRun:()=>{runnerContext.planRunState=null;runnerEvents.push({type:'finish'});},
  formatPlanTime:n=>String(n),
  Math,Number
};
for(const [name,source] of Object.entries(runnerFunctions)){
runnerContext[name]=vm.runInNewContext('('+source.replace('function '+name+'(','function(')+')',runnerContext);
}
const runnerItem={id:1,sets:2,reps:2,work:5,rest:2};
const runnerNextItem={id:2,sets:1,reps:1,work:5,rest:0};
runnerContext.planRunState={plan:{name:'Prueba',items:[runnerItem,runnerNextItem]},index:0,set:1,rep:1,phase:'work',exerciseRemaining:1,totalRemaining:100,running:true,restReason:null,completed:false};
runnerContext.tickPlanRun();
assert.equal(runnerContext.planRunState.phase,'rest','Work completion should enter a rest interval');
assert.equal(runnerContext.planRunState.restReason,'rep');
assert.ok(runnerEvents.some(e=>e.type==='sound'&&e.kind==='rest'));
assert.ok(runnerEvents.some(e=>e.type==='notice'&&e.kind==='rest'));
runnerContext.planRunState.exerciseRemaining=1;
runnerContext.tickPlanRun();
assert.equal(runnerContext.planRunState.phase,'work');
assert.equal(runnerContext.planRunState.rep,2);
assert.ok(runnerEvents.some(e=>e.type==='notice'&&e.title==='SIGUIENTE REPETICIÓN'));
runnerContext.planRunState.exerciseRemaining=1;
runnerContext.tickPlanRun();
assert.equal(runnerContext.planRunState.phase,'rest');
assert.equal(runnerContext.planRunState.restReason,'set');
runnerContext.planRunState.exerciseRemaining=1;
runnerContext.tickPlanRun();
assert.equal(runnerContext.planRunState.set,2);
assert.equal(runnerContext.planRunState.rep,1);
assert.ok(runnerEvents.some(e=>e.type==='notice'&&e.title==='SIGUIENTE SERIE'));
runnerContext.planRunState.exerciseRemaining=1;
runnerContext.tickPlanRun();
assert.equal(runnerContext.planRunState.phase,'rest','The second set must still complete its second repetition');
runnerContext.planRunState.exerciseRemaining=1;
runnerContext.tickPlanRun();
assert.equal(runnerContext.planRunState.rep,2);
runnerContext.planRunState.exerciseRemaining=1;
runnerContext.tickPlanRun();
assert.equal(runnerContext.planRunState.index,1,'Finishing all sets and repetitions should advance to the next exercise');
assert.ok(runnerEvents.some(e=>e.type==='notice'&&e.title==='SIGUIENTE EJERCICIO'));
assert.ok(runnerEvents.filter(e=>e.type==='sound'&&e.kind==='start').length>=3,'Starting/resuming work intervals should play the start cue');

console.log('SOLIDO plan automation and workout cue checks passed: first plan auto-created once, safety gates preserved, and session transitions announce start/rest/exercise changes.');
