export function addNote(notes, text) {
  const note = text.trim();

  if (!note) {
    return false;
  }

  notes.push(note);
  return true;
}
