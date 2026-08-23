import test from "node:test";
import assert from "node:assert/strict";

import { loadNotes, NOTES_STORAGE_KEY, saveNotes } from "../storage.js";

class MemoryStorage {
  constructor(entries = {}) {
    this.entries = new Map(Object.entries(entries));
  }

  getItem(key) {
    return this.entries.get(key) ?? null;
  }

  setItem(key, value) {
    this.entries.set(key, value);
  }
}

test("loads stored notes", () => {
  const storage = new MemoryStorage({
    [NOTES_STORAGE_KEY]: JSON.stringify(["First", "Second"]),
  });

  assert.deepEqual(loadNotes(storage), ["First", "Second"]);
});

test("starts with no notes when stored data is absent or invalid", () => {
  assert.deepEqual(loadNotes(new MemoryStorage()), []);
  assert.deepEqual(loadNotes(new MemoryStorage({ [NOTES_STORAGE_KEY]: "invalid" })), []);
});

test("saves notes as JSON", () => {
  const storage = new MemoryStorage();

  saveNotes(["A note"], storage);

  assert.equal(storage.getItem(NOTES_STORAGE_KEY), '["A note"]');
});

test("continues when retrieving global localStorage throws", (t) => {
  const originalDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "localStorage",
  );

  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get() {
      throw new DOMException("Storage access denied", "SecurityError");
    },
  });

  t.after(() => {
    if (originalDescriptor) {
      Object.defineProperty(globalThis, "localStorage", originalDescriptor);
    } else {
      delete globalThis.localStorage;
    }
  });

  assert.deepEqual(loadNotes(), []);
  assert.doesNotThrow(() => saveNotes(["A note"]));
});
