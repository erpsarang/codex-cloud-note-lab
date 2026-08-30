export const NOTES_STORAGE_KEY = "notes";

export function parseStoredNotes(storedNotes) {
  if (storedNotes === null) {
    return { ok: true, notes: [] };
  }

  try {
    const notes = JSON.parse(storedNotes);

    return Array.isArray(notes) &&
      notes.every(
        (note) => typeof note === "string" && note.trim().length > 0,
      )
      ? { ok: true, notes: notes.map((note) => note.trim()) }
      : { ok: false, notes: [] };
  } catch {
    return { ok: false, notes: [] };
  }
}

export function loadNotes(storage) {
  try {
    const availableStorage =
      storage === undefined ? globalThis.localStorage : storage;

    if (!availableStorage) {
      return { ok: false, notes: [] };
    }

    const storedNotes = availableStorage.getItem(NOTES_STORAGE_KEY);

    return parseStoredNotes(storedNotes);
  } catch {
    return { ok: false, notes: [] };
  }
}

export function saveNotes(notes, storage) {
  try {
    const availableStorage =
      storage === undefined ? globalThis.localStorage : storage;

    if (!availableStorage) {
      return false;
    }

    availableStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(notes));
    return true;
  } catch {
    // Persistence is best-effort; notes remain available in memory.
    return false;
  }
}
