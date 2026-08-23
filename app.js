import { addNote, deleteNote } from "./notes.js";
import { loadNotes, saveNotes } from "./storage.js";

const notes = loadNotes();
const form = document.querySelector("#note-form");
const input = document.querySelector("#note-input");
const inputError = document.querySelector("#note-error");
const storageStatus = document.querySelector("#storage-status");
const noteList = document.querySelector("#note-list");

function updateStorageStatus(saved) {
  storageStatus.hidden = saved;
}

function renderNotes() {
  noteList.replaceChildren();
  const deleteButtons = [];

  notes.forEach((note, index) => {
    const listItem = document.createElement("li");
    const noteText = document.createElement("span");
    const deleteButton = document.createElement("button");

    noteText.textContent = note;
    deleteButton.type = "button";
    deleteButton.textContent = "Delete";
    deleteButton.setAttribute("aria-label", `Delete ${note}`);
    deleteButton.addEventListener("click", () => {
      deleteNote(notes, index);
      updateStorageStatus(saveNotes(notes));
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
  updateStorageStatus(saveNotes(notes));
  renderNotes();
  input.value = "";
  input.focus();
});

renderNotes();
