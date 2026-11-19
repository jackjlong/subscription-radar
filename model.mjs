import { daysUntil, nextRenewalDate, occurrencesInMonth } from './renewals.mjs';

export function yearlyProjectionCents(subscription) {
  const multipliers = { weekly: 52, monthly: 12, yearly: 1 };
  const multiplier = multipliers[subscription.cadence];
  if (!multiplier) throw new Error('Unknown billing cycle.');
  return subscription.amountCents * multiplier;
}

export function summarize(subscriptions, todayIso) {
  const confirmed = subscriptions.filter(item => item.status === 'confirmed');
  const monthlyBreakdown = confirmed.map(subscription => ({
    subscription,
    contributionCents: yearlyProjectionCents(subscription) / 12,
  }));
  const monthlyAverageCents = Math.round(monthlyBreakdown.reduce((sum, item) => sum + item.contributionCents, 0));
  for (const item of monthlyBreakdown) item.displayCents = Math.floor(item.contributionCents);
  const remainingCents = monthlyAverageCents - monthlyBreakdown.reduce((sum, item) => sum + item.displayCents, 0);
  const byRemainder = [...monthlyBreakdown].sort((a, b) =>
    (b.contributionCents - Math.floor(b.contributionCents)) - (a.contributionCents - Math.floor(a.contributionCents))
    || a.subscription.id.localeCompare(b.subscription.id)
  );
  for (let index = 0; index < remainingCents; index++) byRemainder[index].displayCents++;

  const scheduledBreakdown = confirmed.flatMap(subscription =>
    occurrencesInMonth(subscription.nextDate, subscription.cadence, todayIso)
      .map(date => ({ subscription, date, amountCents: subscription.amountCents }))
  ).sort((a, b) => a.date.localeCompare(b.date) || a.subscription.name.localeCompare(b.subscription.name));
  const scheduledThisMonthCents = scheduledBreakdown.reduce((sum, item) => sum + item.amountCents, 0);

  const upcoming = confirmed.map(subscription => {
    const nextDate = nextRenewalDate(subscription.nextDate, subscription.cadence, todayIso);
    return { subscription, nextDate, daysAway: daysUntil(todayIso, nextDate) };
  }).sort((a, b) => a.nextDate.localeCompare(b.nextDate) || a.subscription.name.localeCompare(b.subscription.name));

  const groups = new Map();
  for (const item of monthlyBreakdown) {
    const category = item.subscription.category?.trim() || 'Other';
    if (!groups.has(category)) groups.set(category, { category, displayCents: 0, subscriptions: [] });
    const group = groups.get(category);
    group.displayCents += item.displayCents;
    group.subscriptions.push(item.subscription);
  }
  const categoryTotals = [...groups.values()].map(group => ({
    category: group.category,
    monthlyAverageCents: group.displayCents,
    subscriptions: group.subscriptions,
  })).sort((a, b) => b.monthlyAverageCents - a.monthlyAverageCents || a.category.localeCompare(b.category));

  return { confirmedCount: confirmed.length, monthlyAverageCents, scheduledThisMonthCents, monthlyBreakdown, scheduledBreakdown, upcoming, categoryTotals };
}
