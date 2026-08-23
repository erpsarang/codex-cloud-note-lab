import test from "node:test";
import assert from "node:assert/strict";

import { addNote } from "../notes.js";

test("adds a trimmed non-empty note", () => {
  const notes = [];

  const added = addNote(notes, "  Buy milk  ");

  assert.equal(added, true);
  assert.deepEqual(notes, ["Buy milk"]);
});

test("does not add empty or whitespace-only notes", () => {
  const notes = [];

  assert.equal(addNote(notes, ""), false);
  assert.equal(addNote(notes, "   \n\t"), false);
  assert.deepEqual(notes, []);
});
