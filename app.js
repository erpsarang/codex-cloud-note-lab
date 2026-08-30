import { addNote, deleteNote } from "./notes.js";
import { loadNotes, saveNotes } from "./storage.js";

const loadResult = loadNotes();
const notes = loadResult.notes;
let storageAvailable = loadResult.ok;
const form = document.querySelector("#note-form");
const input = document.querySelector("#note-input");
const inputError = document.querySelector("#note-error");
const storageStatus = document.querySelector("#storage-status");
const emptyState = document.querySelector("#empty-state");
const noteList = document.querySelector("#note-list");

if (!loadResult.ok) {
  storageStatus.textContent = "저장된 메모를 불러오지 못했습니다.";
}

function persistNotes() {
  if (saveNotes(notes)) {
    storageAvailable = true;
    storageStatus.textContent = "";
  } else {
    storageStatus.textContent = "변경 사항이 이 브라우저에 저장되지 않았습니다.";
  }
}

function renderNotes() {
  noteList.replaceChildren();
  emptyState.hidden = !storageAvailable || notes.length > 0;
  const deleteButtons = [];

  notes.forEach((note, index) => {
    const listItem = document.createElement("li");
    const noteText = document.createElement("span");
    const deleteButton = document.createElement("button");

    noteText.textContent = note;
    deleteButton.type = "button";
    deleteButton.textContent = "삭제";
    deleteButton.setAttribute("aria-label", `${note} 삭제`);
    deleteButton.addEventListener("click", () => {
      deleteNote(notes, index);
      persistNotes();
      const remainingDeleteButtons = renderNotes();
      const adjacentButton = remainingDeleteButtons[Math.min(index, notes.length - 1)];

      (adjacentButton ?? input).focus();
    });

    listItem.append(noteText, deleteButton);
    noteList.append(listItem);
    deleteButtons.push(deleteButton);
  });

  return deleteButtons;
}

input.addEventListener("input", () => {
  if (input.value.trim()) {
    inputError.hidden = true;
    input.removeAttribute("aria-invalid");
  }
});

form.addEventListener("submit", (event) => {
  event.preventDefault();

  if (!addNote(notes, input.value)) {
    inputError.hidden = false;
    input.setAttribute("aria-invalid", "true");
    input.focus();
    return;
  }

  inputError.hidden = true;
  input.removeAttribute("aria-invalid");
  persistNotes();
  renderNotes();
  input.value = "";
  input.focus();
});

renderNotes();
