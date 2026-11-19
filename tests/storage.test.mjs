import test from 'node:test';
import assert from 'node:assert/strict';
import { saveSnapshot } from '../storage.mjs';

test('an old tab cannot overwrite a newer tab subscription change', () => {
  const values = new Map();
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const key = 'subscriptions';
  const first = saveSnapshot(storage, key, null, [{ id: 'a' }]);
  assert.throws(() => saveSnapshot(storage, key, null, [{ id: 'b' }]), /another tab/);
  assert.equal(storage.getItem(key), first);
});
