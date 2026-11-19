import { summarize, yearlyProjectionCents } from './model.mjs';
import { parseCandidateFile, mergeCandidates, dismissedRecord } from './import.mjs';
import { nextRenewalDate } from './renewals.mjs';
import { saveSnapshot } from './storage.mjs';

const STORAGE_KEY = 'subscription-radar-v1';
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const dateFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const $ = id => document.getElementById(id);
const state = { subscriptions: [], storedRaw: null, showAll: false, reviewing: false, editingId: null };

function element(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = text;
  return node;
}

function formatMoney(cents) {
  return money.format(cents / 100);
}

function formatDate(iso) {
  return dateFormat.format(new Date(`${iso}T12:00:00Z`));
}

function localToday() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function billingLabel(cadence) {
  return { weekly: 'week', monthly: 'month', yearly: 'year' }[cadence];
}

function message(text, isError = false) {
  const node = $('message');
  node.textContent = text;
  node.classList.toggle('error', isError);
  node.hidden = false;
}

function load() {
  try {
    state.storedRaw = localStorage.getItem(STORAGE_KEY);
    const parsed = JSON.parse(state.storedRaw || '[]');
    if (!Array.isArray(parsed)) throw new Error('not a list');
    state.subscriptions = parsed;
  } catch {
    state.subscriptions = [];
    message('Saved browser data could not be read. New entries will not replace it until you reload or clear the damaged data.', true);
    $('add-button').disabled = true;
    $('import-button').disabled = true;
  }
}

function save() {
  try {
    state.storedRaw = saveSnapshot(localStorage, STORAGE_KEY, state.storedRaw, state.subscriptions);
    return true;
  } catch (error) {
    message(error.message?.includes('another tab') ? error.message : 'This browser could not save the change. Check your storage settings or available space.', true);
    return false;
  }
}

function setStatus(id, status) {
  const item = state.subscriptions.find(entry => entry.id === id);
  if (!item) return;
  const previous = state.subscriptions;
  state.subscriptions = previous.map(entry => entry.id === id ? status === 'dismissed' ? dismissedRecord(entry) : { ...entry, status } : entry);
  if (!save()) state.subscriptions = previous;
  else message(status === 'confirmed' ? `${item.name} confirmed.` : `${item.name} dismissed.`);
  render();
}

function empty(container, text) {
  container.replaceChildren(element('div', 'empty-state', text));
}

function detailFact(label, value) {
  const box = element('div');
  box.append(element('span', '', label), element('strong', '', value));
  return box;
}

function renderUpcoming(summary) {
  const list = $('upcoming-list');
  list.replaceChildren();
  $('upcoming-aside').textContent = `${summary.confirmedCount} confirmed`;
  if (!summary.upcoming.length) {
    empty(list, 'No confirmed subscriptions yet. Add one manually or import your private list to review detected charges.');
    $('show-all-button').hidden = true;
    return;
  }
  const shown = state.showAll ? summary.upcoming : summary.upcoming.slice(0, 4);
  for (const [index, entry] of shown.entries()) {
    const { subscription, nextDate, daysAway } = entry;
    const details = element('details', `upcoming-row${daysAway <= 7 ? ' soon' : ''}`);
    const summaryNode = element('summary');
    const left = element('span', 'row-left');
    const kicker = daysAway === 0 ? 'Due today' : `In ${daysAway} ${daysAway === 1 ? 'day' : 'days'}`;
    left.append(
      element('span', 'row-kicker', index === 0 ? `Next · ${kicker}` : kicker),
      element('span', 'row-name', subscription.name),
      element('span', 'row-meta', `${subscription.category || 'Other'} · ${formatDate(nextDate)}`),
    );
    const amount = element('span', 'row-amount');
    amount.append(document.createTextNode(formatMoney(subscription.amountCents) + ' '), element('small', '', `/ ${billingLabel(subscription.cadence)}`));
    summaryNode.append(left, amount);
    const body = element('div', 'row-detail');
    const grid = element('div', 'detail-grid');
    grid.append(
      detailFact('Billing amount', `${formatMoney(subscription.amountCents)} / ${billingLabel(subscription.cadence)}`),
      detailFact('Projected yearly cost', formatMoney(yearlyProjectionCents(subscription))),
      detailFact('Payment method', subscription.paymentMethod || 'Not set'),
      detailFact('Next expected charge', formatDate(nextDate)),
    );
    body.append(grid, element('p', 'detail-note', 'Yearly cost assumes the price stays the same. Dates are schedules, not proof of payment.'));
    details.append(summaryNode, body);
    list.append(details);
  }
  const showAll = $('show-all-button');
  showAll.hidden = summary.upcoming.length <= 4;
  showAll.textContent = state.showAll ? 'Show fewer subscriptions' : `Show all ${summary.upcoming.length} subscriptions`;
}

function renderCategories(summary) {
  const list = $('category-list');
  list.replaceChildren();
  if (!summary.categoryTotals.length) {
    empty(list, 'Your category breakdown appears after you confirm a subscription.');
    return;
  }
  for (const group of summary.categoryTotals) {
    const button = element('button', 'category-row');
    button.type = 'button';
    button.setAttribute('aria-label', `See ${group.category} subscriptions`);
    const top = element('span', 'category-top');
    top.append(element('span', 'category-name', group.category), element('strong', '', formatMoney(group.monthlyAverageCents)));
    const track = element('span', 'category-track');
    const fill = element('span', 'category-fill');
    fill.style.display = 'block';
    fill.style.width = `${summary.monthlyAverageCents ? Math.max(2, group.monthlyAverageCents / summary.monthlyAverageCents * 100) : 0}%`;
    track.append(fill);
    button.append(top, track);
    button.addEventListener('click', () => openBreakdown('category', group.category));
    list.append(button);
  }
}

function renderSubscriptions(summary) {
  const list = $('subscription-list');
  list.replaceChildren();
  $('subscription-count').textContent = `${summary.confirmedCount} confirmed`;
  const confirmed = state.subscriptions.filter(item => item.status === 'confirmed').sort((a, b) => a.name.localeCompare(b.name));
  if (!confirmed.length) {
    empty(list, 'Your confirmed subscriptions will appear here.');
    return;
  }
  for (const item of confirmed) {
    const row = element('div', 'subscription-item');
    const description = element('div');
    description.append(element('strong', '', item.name), element('span', '', `${formatMoney(item.amountCents)} / ${billingLabel(item.cadence)} · ${item.paymentMethod || 'Payment method not set'}`));
    const actions = element('div', 'subscription-actions');
    const edit = element('button', 'text-button', 'Edit');
    edit.type = 'button';
    edit.setAttribute('aria-label', `Edit ${item.name}`);
    edit.addEventListener('click', () => openEntry(item));
    const remove = element('button', 'text-button', 'Remove');
    remove.type = 'button';
    remove.setAttribute('aria-label', `Remove ${item.name}`);
    remove.addEventListener('click', () => removeSubscription(item));
    actions.append(edit, remove);
    row.append(description, actions);
    list.append(row);
  }
}

function renderReview() {
  const container = $('review-content');
  container.replaceChildren();
  const pending = state.subscriptions.filter(item => item.status === 'candidate');
  const imported = state.subscriptions.filter(item => item.sourceId);
  if (!pending.length) {
    const card = element('section', 'review-card');
    card.append(element('h2', '', 'Review complete'), element('p', 'review-note', 'Every imported candidate has been confirmed or dismissed. You can still add subscriptions manually.'));
    container.append(card);
    return;
  }
  const item = pending[0];
  const reviewed = imported.length - pending.length;
  const card = element('section', 'review-card');
  card.append(element('div', 'review-progress', `${reviewed + 1} of ${imported.length} imported candidates`));
  const progress = element('div', 'review-progress-track');
  const fill = element('div', 'review-progress-fill');
  fill.style.width = `${imported.length ? reviewed / imported.length * 100 : 0}%`;
  progress.append(fill);
  card.append(progress, element('p', 'eyebrow', 'DETECTED RECURRING CHARGE'), element('h2', '', item.name), element('div', 'review-price', `${formatMoney(item.amountCents)} / ${billingLabel(item.cadence)}`));
  const facts = element('div', 'review-facts');
  for (const [label, value] of [
    ['Predicted next charge', formatDate(item.nextDate)], ['Suggested category', item.category || 'Other'],
    ['Paying account', item.paymentMethod || 'Not set'], ['Yearly projection', formatMoney(yearlyProjectionCents(item))],
  ]) {
    const fact = element('div', 'review-fact');
    fact.append(element('span', '', label), element('strong', '', value));
    facts.append(fact);
  }
  card.append(facts, element('p', 'review-note', 'This came from a pattern in past transactions. Check the name, amount, cycle, date, and account before confirming.'));
  const actions = element('div', 'review-actions');
  const confirm = element('button', 'button button-primary', 'Confirm');
  confirm.type = 'button';
  confirm.addEventListener('click', () => setStatus(item.id, 'confirmed'));
  const edit = element('button', 'button button-quiet', 'Edit details');
  edit.type = 'button';
  edit.addEventListener('click', () => openEntry(item));
  const dismiss = element('button', 'button button-quiet', 'Dismiss');
  dismiss.type = 'button';
  dismiss.addEventListener('click', () => setStatus(item.id, 'dismissed'));
  actions.append(confirm, edit, dismiss);
  card.append(actions);
  container.append(card);
}

function renderSuggestions() {
  for (const [id, field] of [['category-options', 'category'], ['payment-options', 'paymentMethod']]) {
    const list = $(id);
    list.replaceChildren();
    const values = [...new Set(state.subscriptions.filter(item => item.status === 'confirmed').map(item => item[field]).filter(Boolean))].sort();
    for (const value of values) {
      const option = document.createElement('option');
      option.value = value;
      list.append(option);
    }
  }
}

function render() {
  const summary = summarize(state.subscriptions, localToday());
  $('monthly-value').textContent = formatMoney(summary.monthlyAverageCents);
  $('scheduled-value').textContent = formatMoney(summary.scheduledThisMonthCents);
  renderUpcoming(summary);
  renderCategories(summary);
  renderSubscriptions(summary);
  renderSuggestions();
  const candidateCount = state.subscriptions.filter(item => item.status === 'candidate').length;
  $('review-banner').hidden = candidateCount === 0;
  $('review-banner-title').textContent = `${candidateCount} ${candidateCount === 1 ? 'charge needs' : 'charges need'} your review`;
  $('dashboard').hidden = state.reviewing;
  $('review-screen').hidden = !state.reviewing;
  if (state.reviewing) renderReview();
}

function openBreakdown(type, category = '') {
  const summary = summarize(state.subscriptions, localToday());
  const list = $('breakdown-list');
  list.replaceChildren();
  let rows;
  if (type === 'scheduled') {
    $('breakdown-eyebrow').textContent = 'EXPECTED CHARGES';
    $('breakdown-title').textContent = `Scheduled this month · ${formatMoney(summary.scheduledThisMonthCents)}`;
    $('breakdown-intro').textContent = 'Each expected charge in this calendar month. This is a schedule, not a record of what posted.';
    rows = summary.scheduledBreakdown.map(entry => ({ name: entry.subscription.name, sub: `${formatDate(entry.date)} · ${entry.subscription.paymentMethod || 'Payment method not set'}`, amount: entry.amountCents }));
  } else {
    const group = type === 'category' ? summary.categoryTotals.find(item => item.category === category) : null;
    const matching = type === 'category' ? summary.monthlyBreakdown.filter(item => (item.subscription.category?.trim() || 'Other') === category) : summary.monthlyBreakdown;
    $('breakdown-eyebrow').textContent = type === 'category' ? 'CATEGORY BREAKDOWN' : 'MONTHLY COST';
    $('breakdown-title').textContent = type === 'category' ? `${category} · ${formatMoney(group?.monthlyAverageCents || 0)}` : `Monthly average · ${formatMoney(summary.monthlyAverageCents)}`;
    $('breakdown-intro').textContent = 'Each plan’s monthly equivalent. Weekly prices use 52 weeks per year; yearly prices are divided by 12.';
    rows = matching.sort((a, b) => b.displayCents - a.displayCents).map(entry => ({ name: entry.subscription.name, sub: `${formatMoney(entry.subscription.amountCents)} / ${billingLabel(entry.subscription.cadence)}`, amount: entry.displayCents }));
  }
  if (!rows.length) empty(list, 'No confirmed subscriptions are included yet.');
  for (const row of rows) {
    const item = element('div', 'breakdown-item');
    const name = element('span', '', row.name);
    name.append(element('small', '', row.sub));
    item.append(name, element('strong', '', formatMoney(row.amount)));
    list.append(item);
  }
  $('breakdown-dialog').showModal();
}

function openEntry(item = null) {
  state.editingId = item?.id || null;
  $('entry-form').reset();
  $('entry-title').textContent = item?.status === 'candidate' ? 'Correct and confirm' : item ? 'Edit subscription' : 'Add subscription';
  $('entry-save').textContent = item?.status === 'candidate' ? 'Confirm changes' : item ? 'Save changes' : 'Add subscription';
  $('entry-name').value = item?.name || '';
  $('entry-amount').value = item ? (item.amountCents / 100).toFixed(2) : '';
  $('entry-cadence').value = item?.cadence || 'monthly';
  $('entry-date').value = item?.nextDate || localToday();
  $('entry-category').value = item?.category || '';
  $('entry-payment').value = item?.paymentMethod || '';
  $('entry-dialog').showModal();
  $('entry-name').focus();
}

function removeSubscription(item) {
  if (!window.confirm(`Remove ${item.name} from your list?`)) return;
  const previous = state.subscriptions;
  state.subscriptions = item.sourceId ? previous.map(entry => entry.id === item.id ? dismissedRecord(entry) : entry) : previous.filter(entry => entry.id !== item.id);
  if (!save()) state.subscriptions = previous;
  render();
}

function saveEntry(event) {
  event.preventDefault();
  const name = $('entry-name').value.trim();
  const amountCents = Math.round(Number($('entry-amount').value) * 100);
  const cadence = $('entry-cadence').value;
  const nextDate = $('entry-date').value;
  const category = $('entry-category').value.trim() || 'Other';
  const paymentMethod = $('entry-payment').value.trim() || 'Not set';
  if (!name || !Number.isSafeInteger(amountCents) || amountCents <= 0 || amountCents > 100_000_000) {
    message('Enter a name and an amount from $0.01 to $1,000,000.', true);
    return;
  }
  try { nextRenewalDate(nextDate, cadence, nextDate); } catch { message('Enter a valid next charge date.', true); return; }
  const existing = state.subscriptions.find(item => item.id === state.editingId);
  const updated = { ...(existing || {}), id: existing?.id || crypto.randomUUID(), name, amountCents, cadence, nextDate, category, paymentMethod, status: 'confirmed' };
  const previous = state.subscriptions;
  state.subscriptions = existing ? previous.map(item => item.id === existing.id ? updated : item) : [...previous, updated];
  if (!save()) { state.subscriptions = previous; return; }
  $('entry-dialog').close();
  message(existing?.status === 'candidate' ? `${name} confirmed.` : existing ? `${name} updated.` : `${name} added.`);
  render();
}

async function importFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    if (file.size > 1_000_000) throw new Error('Choose a candidate file under 1 MB.');
    const incoming = parseCandidateFile(await file.text());
    const previous = state.subscriptions;
    state.subscriptions = mergeCandidates(previous, incoming);
    const added = state.subscriptions.length - previous.length;
    if (added && !save()) { state.subscriptions = previous; return; }
    state.reviewing = state.subscriptions.some(item => item.status === 'candidate');
    message(added ? `${added} detected ${added === 1 ? 'charge is' : 'charges are'} ready for review. Nothing was added to your totals.` : 'No new candidates were added. Your earlier review decisions remain in place.');
    render();
  } catch (error) {
    message(error.message || 'The import could not be read.', true);
  } finally {
    event.target.value = '';
  }
}

function wireEvents() {
  $('add-button').addEventListener('click', () => openEntry());
  $('import-button').addEventListener('click', () => $('import-file').click());
  $('import-file').addEventListener('change', importFile);
  $('review-button').addEventListener('click', () => { state.reviewing = true; render(); });
  $('back-button').addEventListener('click', () => { state.reviewing = false; render(); });
  $('show-all-button').addEventListener('click', () => { state.showAll = !state.showAll; render(); });
  $('monthly-card').addEventListener('click', () => openBreakdown('monthly'));
  $('scheduled-card').addEventListener('click', () => openBreakdown('scheduled'));
  $('entry-form').addEventListener('submit', saveEntry);
  $('entry-close').addEventListener('click', () => $('entry-dialog').close());
  $('entry-cancel').addEventListener('click', () => $('entry-dialog').close());
  $('breakdown-close').addEventListener('click', () => $('breakdown-dialog').close());
}

load();
wireEvents();
render();
