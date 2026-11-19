import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCandidateFile, mergeCandidates, dismissedRecord } from '../import.mjs';

const file = JSON.stringify({
  format: 'subscription-radar-candidates-v1',
  candidates: [{
    sourceId: 'private-stream-1', name: 'Example plan', amountCents: 1299,
    cadence: 'monthly', nextDate: '2026-11-25', category: 'Software',
    paymentMethod: 'Example card', status: 'confirmed',
  }],
});

test('a valid file creates candidates regardless of a status in the file', () => {
  const candidates = parseCandidateFile(file);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].status, 'candidate');
  assert.equal(candidates[0].amountCents, 1299);
  assert.equal(candidates[0].paymentMethod, 'Example card');
});

test('malformed or unsupported files are rejected', () => {
  assert.throws(() => parseCandidateFile('{broken'), /valid JSON/);
  assert.throws(() => parseCandidateFile(JSON.stringify({ format: 'another-format', candidates: [] })), /supported candidate file/);
  assert.throws(() => parseCandidateFile(JSON.stringify({ format: 'subscription-radar-candidates-v1', candidates: [{ sourceId: 'a', name: 'Bad', amountCents: -100, cadence: 'monthly', nextDate: '2026-11-25' }] })), /positive amount/);
});

test('reimport keeps an existing review decision and does not duplicate a candidate', () => {
  const incoming = parseCandidateFile(file);
  const existing = [{ ...incoming[0], name: 'Corrected name', status: 'confirmed' }];
  const merged = mergeCandidates(existing, incoming);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].name, 'Corrected name');
  assert.equal(merged[0].status, 'confirmed');
});

test('import rejects amounts larger than the manual form allows', () => {
  const unsafe = JSON.parse(file);
  unsafe.candidates[0].amountCents = 1e307;
  assert.throws(() => parseCandidateFile(JSON.stringify(unsafe)), /positive amount/);
});

test('dismissing a candidate retains deduplication without private details', () => {
  const candidate = parseCandidateFile(file)[0];
  const dismissed = dismissedRecord(candidate);
  assert.deepEqual(dismissed, { id: 'import:private-stream-1', sourceId: 'private-stream-1', status: 'dismissed' });
  assert.deepEqual(mergeCandidates([dismissed], [candidate]), [dismissed]);
});
