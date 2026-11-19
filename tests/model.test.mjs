import test from 'node:test';
import assert from 'node:assert/strict';
import { summarize, yearlyProjectionCents } from '../model.mjs';

test('monthly, weekly, and yearly plans have clear yearly projections', () => {
  assert.equal(yearlyProjectionCents({ amountCents: 1200, cadence: 'monthly' }), 14400);
  assert.equal(yearlyProjectionCents({ amountCents: 1000, cadence: 'weekly' }), 52000);
  assert.equal(yearlyProjectionCents({ amountCents: 12000, cadence: 'yearly' }), 12000);
});

test('five weekly charges affect this month differently from the monthly average', () => {
  const subscriptions = [
    { id: 'weekly', name: 'Weekly plan', amountCents: 1000, cadence: 'weekly', nextDate: '2026-03-01', category: 'Entertainment', status: 'confirmed' },
    { id: 'monthly', name: 'Monthly plan', amountCents: 1200, cadence: 'monthly', nextDate: '2026-03-15', category: 'Software', status: 'confirmed' },
    { id: 'yearly', name: 'Yearly plan', amountCents: 12000, cadence: 'yearly', nextDate: '2026-03-20', category: 'Learning', status: 'confirmed' },
  ];
  const result = summarize(subscriptions, '2026-03-01');
  assert.equal(result.monthlyAverageCents, 6533);
  assert.equal(result.scheduledThisMonthCents, 18200);
  assert.equal(result.scheduledBreakdown.filter(item => item.subscription.id === 'weekly').length, 5);
  assert.deepEqual(result.upcoming.map(item => item.subscription.id), ['weekly', 'monthly', 'yearly']);
  assert.deepEqual(result.categoryTotals.map(item => [item.category, item.monthlyAverageCents]), [
    ['Entertainment', 4333], ['Software', 1200], ['Learning', 1000],
  ]);
});

test('candidate and dismissed charges stay out of every dashboard total', () => {
  const subscriptions = [
    { id: 'kept', name: 'Kept', amountCents: 1000, cadence: 'monthly', nextDate: '2026-11-20', category: 'Software', status: 'confirmed' },
    { id: 'candidate', name: 'Candidate', amountCents: 9000, cadence: 'monthly', nextDate: '2026-11-21', category: 'Software', status: 'candidate' },
    { id: 'dismissed', name: 'Dismissed', amountCents: 8000, cadence: 'monthly', nextDate: '2026-11-22', category: 'Software', status: 'dismissed' },
  ];
  const result = summarize(subscriptions, '2026-11-18');
  assert.equal(result.monthlyAverageCents, 1000);
  assert.equal(result.scheduledThisMonthCents, 1000);
  assert.deepEqual(result.upcoming.map(item => item.subscription.id), ['kept']);
});

test('rounded category and plan breakdowns add to the monthly headline', () => {
  const subscriptions = [
    { id: 'a', name: 'Plan A', amountCents: 1000, cadence: 'weekly', nextDate: '2026-04-03', category: 'Music', status: 'confirmed' },
    { id: 'b', name: 'Plan B', amountCents: 1000, cadence: 'weekly', nextDate: '2026-04-03', category: 'Video', status: 'confirmed' },
  ];
  const result = summarize(subscriptions, '2026-03-30');
  assert.equal(result.monthlyAverageCents, 8667);
  assert.equal(result.scheduledThisMonthCents, 8000);
  assert.equal(result.monthlyBreakdown.reduce((sum, item) => sum + item.displayCents, 0), 8667);
  assert.equal(result.categoryTotals.reduce((sum, item) => sum + item.monthlyAverageCents, 0), 8667);
});
