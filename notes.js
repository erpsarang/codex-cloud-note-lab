export const MAX_NOTE_LENGTH = 1000;

export function addNote(notes, text) {
  const note = text.trim();

  if (!note || note.length > MAX_NOTE_LENGTH) {
    return false;
  }

  notes.push(note);
  return true;
}

export function deleteNote(notes, index) {
  if (!Number.isInteger(index) || index < 0 || index >= notes.length) {
    return false;
  }

  notes.splice(index, 1);
  return true;
}
