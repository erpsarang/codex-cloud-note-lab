import { addNote } from "./notes.js";

const notes = [];
const form = document.querySelector("#note-form");
const input = document.querySelector("#note-input");
const noteList = document.querySelector("#note-list");

form.addEventListener("submit", (event) => {
  event.preventDefault();

  if (!addNote(notes, input.value)) {
    return;
  }

  const listItem = document.createElement("li");
  listItem.textContent = notes.at(-1);
  noteList.append(listItem);
  input.value = "";
  input.focus();
});
