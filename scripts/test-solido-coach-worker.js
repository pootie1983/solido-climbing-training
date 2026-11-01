'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('cloudflare/solido-coach-ai/src/index.js', 'utf8');
const executable = source.replace('export default { fetch: handleRequest };', 'module.exports = { fetch: handleRequest };');
const sandbox = { module: { exports: {} }, Response, Request, URL, TextEncoder, Set, JSON, Number, String, Error };
vm.runInNewContext(executable, sandbox, { filename: 'solido-coach-worker.js' });
const worker = sandbox.module.exports.default || sandbox.module.exports;

(async () => {
  let calls = 0;
  const env = {
    COACH_ACCESS_TOKEN: 'test-token',
    AI: { run: async () => { calls++; return { response: JSON.stringify({ message: 'Consejo prudente', session: { name: 'Sesión de prueba', category: 'Fuerza', items: [{ id: 5, sets: 2, reps: 5, work: 5, rest: 90 }] } }) }; } }
  };
  const get = await worker.fetch(new Request('https://example.test/health'), env);
  assert.equal(get.status, 200);
  assert.equal((await get.json()).mode, 'free-tier-only');

  const unauthorized = await worker.fetch(new Request('https://example.test/v1/coach/recommendation', { method: 'POST', body: '{}' }), env);
  assert.equal(unauthorized.status, 401);
  assert.equal(calls, 0, 'Unauthenticated requests must not invoke AI');

  const payload = {
    schemaVersion: 1, personality: 'cercano', goal: 'Fuerza general',
    experience: 'intermedio', daysAvailable: 3, equipment: 'gimnasio',
    trainingSummary: { sessionsLast30Days: 4, minutesLast30Days: 120, forceRecords: 1, bestForceKg: 20 },
    availableExerciseIds: [5, 9, 17]
  };
  const valid = await worker.fetch(new Request('https://example.test/v1/coach/recommendation', {
    method: 'POST', headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  }), env);
  assert.equal(valid.status, 200);
  assert.equal((await valid.json()).session.items[0].id, 5);
  assert.equal(calls, 1);

  const invalid = { ...payload, availableExerciseIds: [] };
  const rejected = await worker.fetch(new Request('https://example.test/v1/coach/recommendation', {
    method: 'POST', headers: { Authorization: 'Bearer test-token' }, body: JSON.stringify(invalid)
  }), env);
  assert.equal(rejected.status, 400);
  assert.equal(calls, 1, 'Invalid requests must not invoke AI');

  const badModelEnv = { COACH_ACCESS_TOKEN: 'test-token', AI: { run: async () => ({ response: JSON.stringify({ message: 'unsafe', session: { name: 'Bad', category: 'Fuerza', items: [{ id: 999, sets: 2, reps: 5, work: 5, rest: 90 }] } }) }) } };
  const badModel = await worker.fetch(new Request('https://example.test/v1/coach/recommendation', {
    method: 'POST', headers: { Authorization: 'Bearer test-token' }, body: JSON.stringify(payload)
  }), badModelEnv);
  assert.equal(badModel.status, 502, 'Unknown exercise IDs must be rejected');

  const unavailable = await worker.fetch(new Request('https://example.test/v1/coach/recommendation', {
    method: 'POST', headers: { Authorization: 'Bearer test-token' }, body: JSON.stringify(payload)
  }), { COACH_ACCESS_TOKEN: 'test-token', AI: { run: async () => { throw new Error('quota exhausted'); } } });
  assert.equal(unavailable.status, 503);
  assert.equal((await unavailable.json()).fallback, 'local');

  console.log('SOLIDO COACH Worker tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
