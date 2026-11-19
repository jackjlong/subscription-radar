import { nextRenewalDate } from './renewals.mjs';

const FORMAT = 'subscription-radar-candidates-v1';
const CYCLES = new Set(['weekly', 'monthly', 'yearly']);

function shortText(value, label, maximum, fallback = '') {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string' || value.trim().length > maximum) throw new Error(`Invalid ${label}.`);
  return value.trim();
}

export function parseCandidateFile(text) {
  if (typeof text !== 'string' || text.length > 1_000_000) throw new Error('Import must be a valid JSON file under 1 MB.');
  let file;
  try {
    file = JSON.parse(text);
  } catch {
    throw new Error('Import must be valid JSON.');
  }
  if (!file || file.format !== FORMAT || !Array.isArray(file.candidates) || file.candidates.length > 500) {
    throw new Error('Choose a supported candidate file.');
  }

  const sourceIds = new Set();
  return file.candidates.map(raw => {
    if (!raw || typeof raw !== 'object') throw new Error('Invalid candidate.');
    const sourceId = shortText(raw.sourceId, 'source ID', 200);
    const name = shortText(raw.name, 'subscription name', 120);
    if (!sourceId || !name || sourceIds.has(sourceId)) throw new Error('Missing or repeated candidate ID or name.');
    sourceIds.add(sourceId);
    if (!Number.isSafeInteger(raw.amountCents) || raw.amountCents <= 0 || raw.amountCents > 100_000_000) throw new Error('Each candidate needs a positive amount within the supported range.');
    if (!CYCLES.has(raw.cadence)) throw new Error('Unknown billing cycle.');
    try {
      nextRenewalDate(raw.nextDate, raw.cadence, raw.nextDate);
    } catch {
      throw new Error('Each candidate needs a valid next charge date.');
    }
    return {
      id: `import:${sourceId}`,
      sourceId,
      name,
      amountCents: raw.amountCents,
      cadence: raw.cadence,
      nextDate: raw.nextDate,
      category: shortText(raw.category, 'category', 80, 'Other'),
      paymentMethod: shortText(raw.paymentMethod, 'payment method', 80, 'Not set'),
      status: 'candidate',
    };
  });
}

export function mergeCandidates(existing, incoming) {
  const known = new Set(existing.filter(item => item.sourceId).map(item => item.sourceId));
  return [...existing, ...incoming.filter(item => !known.has(item.sourceId))];
}

export function dismissedRecord(candidate) {
  return { id: candidate.id, sourceId: candidate.sourceId, status: 'dismissed' };
}
