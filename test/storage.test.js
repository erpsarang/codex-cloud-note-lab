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

test("reports an empty store as a successful load", () => {
  assert.deepEqual(loadNotes(new MemoryStorage()), { ok: true, notes: [] });
});

test("loads stored notes", () => {
  const storage = new MemoryStorage({
    [NOTES_STORAGE_KEY]: JSON.stringify(["First", "Second"]),
  });

  assert.deepEqual(loadNotes(storage), {
    ok: true,
    notes: ["First", "Second"],
  });
});

test("reports invalid JSON as a failed load", () => {
  assert.deepEqual(
    loadNotes(new MemoryStorage({ [NOTES_STORAGE_KEY]: "invalid" })),
    { ok: false, notes: [] },
  );
});

test("reports a non-string-array value as a failed load", () => {
  for (const storedValue of [{ note: "Not an array" }, ["Valid", 42]]) {
    assert.deepEqual(
      loadNotes(
        new MemoryStorage({
          [NOTES_STORAGE_KEY]: JSON.stringify(storedValue),
        }),
      ),
      { ok: false, notes: [] },
    );
  }
});

test("reports a getItem exception as a failed load", () => {
  const storage = {
    getItem() {
      throw new Error("Storage access denied");
    },
  };

  assert.deepEqual(loadNotes(storage), { ok: false, notes: [] });
});

test("saves notes as JSON", () => {
  const storage = new MemoryStorage();

  const saved = saveNotes(["A note"], storage);

  assert.equal(saved, true);
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

  assert.deepEqual(loadNotes(), { ok: false, notes: [] });
  assert.equal(saveNotes(["A note"]), false);
});
