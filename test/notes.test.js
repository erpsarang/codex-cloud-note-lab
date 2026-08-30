import test from "node:test";
import assert from "node:assert/strict";

import { addNote, deleteNote, MAX_NOTE_LENGTH } from "../notes.js";

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

test("adds notes at the maximum length and rejects longer notes", () => {
  const notes = [];
  const maximumLengthNote = "a".repeat(MAX_NOTE_LENGTH);

  assert.equal(addNote(notes, maximumLengthNote), true);
  assert.equal(addNote(notes, `${maximumLengthNote}a`), false);
  assert.deepEqual(notes, [maximumLengthNote]);
});

test("measures note length in UTF-16 code units", () => {
  const notes = [];
  const maximumLengthEmojiNote = "😀".repeat(MAX_NOTE_LENGTH / 2);

  assert.equal(addNote(notes, maximumLengthEmojiNote), true);
  assert.equal(addNote(notes, `${maximumLengthEmojiNote}😀`), false);
  assert.deepEqual(notes, [maximumLengthEmojiNote]);
});

test("deletes only the selected note", () => {
  const notes = ["First note", "Second note"];

  const deleted = deleteNote(notes, 0);

  assert.equal(deleted, true);
  assert.deepEqual(notes, ["Second note"]);
});

test("does not change notes when the selected index does not exist", () => {
  const notes = ["Keep this note"];

  assert.equal(deleteNote(notes, -1), false);
  assert.equal(deleteNote(notes, 1), false);
  assert.deepEqual(notes, ["Keep this note"]);
});
