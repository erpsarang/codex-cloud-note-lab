export const NOTES_STORAGE_KEY = "notes";

export function loadNotes(storage) {
  try {
    const availableStorage =
      storage === undefined ? globalThis.localStorage : storage;

    if (!availableStorage) {
      return [];
    }

    const storedNotes = availableStorage.getItem(NOTES_STORAGE_KEY);

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
