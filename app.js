import { addNote, deleteNote } from "./notes.js";

const notes = [];
const form = document.querySelector("#note-form");
const input = document.querySelector("#note-input");
const noteList = document.querySelector("#note-list");

function renderNotes() {
  noteList.replaceChildren();

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
      renderNotes();
    });

    listItem.append(noteText, deleteButton);
    noteList.append(listItem);
  });
}

form.addEventListener("submit", (event) => {
  event.preventDefault();

  if (!addNote(notes, input.value)) {
    return;
  }

  renderNotes();
  input.value = "";
  input.focus();
});
