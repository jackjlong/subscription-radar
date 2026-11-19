const DAY_MS = 86_400_000;

function parseDate(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new Error('Use a YYYY-MM-DD date.');
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error('Use a valid calendar date.');
  }
  return date;
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function addMonths(anchor, count) {
  const year = anchor.getUTCFullYear();
  const month = anchor.getUTCMonth() + count;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(anchor.getUTCDate(), lastDay)));
}

function addYears(anchor, count) {
  const year = anchor.getUTCFullYear() + count;
  const month = anchor.getUTCMonth();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(anchor.getUTCDate(), lastDay)));
}

export function nextRenewalDate(anchorIso, cadence, todayIso) {
  const anchor = parseDate(anchorIso);
  const today = parseDate(todayIso);
  if (!['weekly', 'monthly', 'yearly'].includes(cadence)) throw new Error('Unknown billing cycle.');
  if (anchor >= today) return anchorIso;

  if (cadence === 'weekly') {
    const weeks = Math.ceil((today - anchor) / (7 * DAY_MS));
    return isoDate(new Date(anchor.getTime() + weeks * 7 * DAY_MS));
  }

  if (cadence === 'monthly') {
    let months = (today.getUTCFullYear() - anchor.getUTCFullYear()) * 12
      + today.getUTCMonth() - anchor.getUTCMonth();
    let date = addMonths(anchor, months);
    if (date < today) date = addMonths(anchor, ++months);
    return isoDate(date);
  }

  let years = today.getUTCFullYear() - anchor.getUTCFullYear();
  let date = addYears(anchor, years);
  if (date < today) date = addYears(anchor, ++years);
  return isoDate(date);
}

export function daysUntil(todayIso, targetIso) {
  return (parseDate(targetIso) - parseDate(todayIso)) / DAY_MS;
}

export function occurrencesInMonth(anchorIso, cadence, monthIso) {
  const month = parseDate(monthIso);
  const anchor = parseDate(anchorIso);
  if (!['weekly', 'monthly', 'yearly'].includes(cadence)) throw new Error('Unknown billing cycle.');
  const first = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1));
  const end = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1));
  const dates = [];
  let index;
  let occurrence;
  if (cadence === 'weekly') {
    index = Math.ceil((first - anchor) / (7 * DAY_MS));
    occurrence = count => new Date(anchor.getTime() + count * 7 * DAY_MS);
  } else if (cadence === 'monthly') {
    index = (first.getUTCFullYear() - anchor.getUTCFullYear()) * 12 + first.getUTCMonth() - anchor.getUTCMonth();
    occurrence = count => addMonths(anchor, count);
  } else {
    index = first.getUTCFullYear() - anchor.getUTCFullYear();
    occurrence = count => addYears(anchor, count);
  }
  while (occurrence(index) < first) index++;
  while (occurrence(index) < end) {
    dates.push(isoDate(occurrence(index)));
    index++;
  }
  return dates;
}
