import { addNote, deleteNote, MAX_NOTE_LENGTH } from "./notes.js";
import { loadNotes, saveNotes } from "./storage.js";

const loadResult = loadNotes();
const notes = loadResult.notes;
const form = document.querySelector("#note-form");
const input = document.querySelector("#note-input");
const inputError = document.querySelector("#note-error");
const storageStatus = document.querySelector("#storage-status");
const emptyState = document.querySelector("#empty-state");
const noteList = document.querySelector("#note-list");

const EMPTY_NOTE_ERROR = "메모 내용을 입력하세요.";
const LONG_NOTE_ERROR = `메모는 ${MAX_NOTE_LENGTH}자 이하로 입력하세요.`;

function showInputError(message) {
  inputError.textContent = message;
  inputError.hidden = false;
  input.setAttribute("aria-invalid", "true");
}

if (!loadResult.ok) {
  storageStatus.textContent = "저장된 메모를 불러오지 못했습니다.";
}

function persistNotes() {
  storageStatus.textContent = saveNotes(notes)
    ? ""
    : "변경 사항이 이 브라우저에 저장되지 않았습니다.";
}

function renderNotes() {
  noteList.replaceChildren();
  emptyState.hidden = !loadResult.ok || notes.length > 0;
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
  const note = input.value.trim();

  if (note.length > MAX_NOTE_LENGTH) {
    showInputError(LONG_NOTE_ERROR);
  } else if (note) {
    inputError.hidden = true;
    input.removeAttribute("aria-invalid");
  }
});

form.addEventListener("submit", (event) => {
  event.preventDefault();

  if (!addNote(notes, input.value)) {
    showInputError(
      input.value.trim().length > MAX_NOTE_LENGTH
        ? LONG_NOTE_ERROR
        : EMPTY_NOTE_ERROR,
    );
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
