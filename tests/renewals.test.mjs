import test from 'node:test';
import assert from 'node:assert/strict';
import { nextRenewalDate, daysUntil } from '../renewals.mjs';
import { occurrencesInMonth } from '../renewals.mjs';

test('monthly renewal keeps its original billing day after a short month', () => {
  assert.equal(nextRenewalDate('2026-01-31', 'monthly', '2026-02-01'), '2026-02-28');
  assert.equal(nextRenewalDate('2026-01-31', 'monthly', '2026-03-01'), '2026-03-31');
});

test('yearly leap-day renewal clamps and returns to February 29', () => {
  assert.equal(nextRenewalDate('2024-02-29', 'yearly', '2027-01-01'), '2027-02-28');
  assert.equal(nextRenewalDate('2024-02-29', 'yearly', '2028-01-01'), '2028-02-29');
});

test('a renewal due today is still shown as due today', () => {
  assert.equal(nextRenewalDate('2026-11-18', 'monthly', '2026-11-18'), '2026-11-18');
  assert.equal(daysUntil('2026-11-18', '2026-11-18'), 0);
});

test('day distance is stable across daylight saving changes', () => {
  assert.equal(daysUntil('2026-03-07', '2026-03-09'), 2);
});

test('weekly renewal advances seven days from the anchor', () => {
  assert.equal(nextRenewalDate('2026-11-18', 'weekly', '2026-11-20'), '2026-11-25');
});

test('five weekly charges can fall in one calendar month', () => {
  assert.deepEqual(occurrencesInMonth('2026-03-01', 'weekly', '2026-03-01'), [
    '2026-03-01', '2026-03-08', '2026-03-15', '2026-03-22', '2026-03-29',
  ]);
});

test('month-end charge occurs on the last day of a shorter month', () => {
  assert.deepEqual(occurrencesInMonth('2026-01-31', 'monthly', '2026-02-01'), ['2026-02-28']);
});

test('scheduled month includes weekly charges before a next date in April', () => {
  assert.deepEqual(occurrencesInMonth('2026-04-03', 'weekly', '2026-03-30'), [
    '2026-03-06', '2026-03-13', '2026-03-20', '2026-03-27',
  ]);
});

test('billing day and leap-day schedule can be projected before the next date', () => {
  assert.deepEqual(occurrencesInMonth('2026-03-31', 'monthly', '2026-02-15'), ['2026-02-28']);
  assert.deepEqual(occurrencesInMonth('2028-02-29', 'yearly', '2027-02-15'), ['2027-02-28']);
});
