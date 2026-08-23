export const NOTES_STORAGE_KEY = "notes";

export function loadNotes(storage = globalThis.localStorage) {
  if (!storage) {
    return [];
  }

  try {
    const storedNotes = storage.getItem(NOTES_STORAGE_KEY);

    if (storedNotes === null) {
      return [];
    }

    const notes = JSON.parse(storedNotes);

    return Array.isArray(notes) && notes.every((note) => typeof note === "string")
      ? notes
      : [];
  } catch {
    return [];
  }
}

export function saveNotes(notes, storage = globalThis.localStorage) {
  if (!storage) {
    return;
  }

  try {
    storage.setItem(NOTES_STORAGE_KEY, JSON.stringify(notes));
  } catch {
    // Persistence is best-effort; notes remain available in memory.
  }
}
