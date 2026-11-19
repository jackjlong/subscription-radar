export function saveSnapshot(storage, key, expectedRaw, subscriptions) {
  if (storage.getItem(key) !== expectedRaw) throw new Error('Your list changed in another tab. Reload this page before saving more changes.');
  const nextRaw = JSON.stringify(subscriptions);
  storage.setItem(key, nextRaw);
  return nextRaw;
}
