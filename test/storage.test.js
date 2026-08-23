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

  assert.equal(saveNotes(["A note"], storage), true);

  assert.equal(storage.getItem(NOTES_STORAGE_KEY), '["A note"]');
});

test("reports when storage is unavailable or writing fails", () => {
  assert.equal(saveNotes(["A note"], null), false);
  assert.equal(
    saveNotes(["A note"], {
      setItem() {
        throw new Error("Storage quota exceeded");
      },
    }),
    false,
  );
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
  assert.equal(saveNotes(["A note"]), false);
});
