import test from "node:test";
import assert from "node:assert/strict";

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.listeners = new Map();
    this.value = "";
  }

  replaceChildren(...children) {
    this.children = children;
  }

  append(...children) {
    this.children.push(...children);
  }

  setAttribute() {}

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  dispatch(type) {
    this.listeners.get(type)?.({ preventDefault() {} });
  }

  focus() {
    document.activeElement = this;
  }
}

class MemoryStorage {
  constructor(notes = null) {
    this.entries = new Map(notes === null ? [] : [["notes", JSON.stringify(notes)]]);
  }

  getItem(key) {
    return this.entries.get(key) ?? null;
  }

  setItem(key, value) {
    this.entries.set(key, value);
  }
}

test("moves focus to an adjacent delete button, then the input, after deletion", async () => {
  const form = new FakeElement("form");
  const input = new FakeElement("textarea");
  const noteList = new FakeElement("ul");
  globalThis.localStorage = new MemoryStorage();

  globalThis.document = {
    activeElement: null,
    querySelector(selector) {
      return {
        "#note-form": form,
        "#note-input": input,
        "#note-list": noteList,
      }[selector];
    },
    createElement(tagName) {
      return new FakeElement(tagName);
    },
  };

  await import("../app.js");

  for (const note of ["First", "Second", "Third"]) {
    input.value = note;
    form.dispatch("submit");
  }

  noteList.children[1].children[1].dispatch("click");
  assert.equal(noteList.children.length, 2);
  assert.equal(document.activeElement, noteList.children[1].children[1]);

  noteList.children[1].children[1].dispatch("click");
  assert.equal(noteList.children.length, 1);
  assert.equal(document.activeElement, noteList.children[0].children[1]);

  noteList.children[0].children[1].dispatch("click");
  assert.equal(noteList.children.length, 0);
  assert.equal(document.activeElement, input);
  assert.equal(localStorage.getItem("notes"), "[]");

  delete globalThis.document;
  delete globalThis.localStorage;
});

test("restores notes on initialization and persists additions and deletions", async () => {
  const form = new FakeElement("form");
  const input = new FakeElement("textarea");
  const noteList = new FakeElement("ul");
  globalThis.localStorage = new MemoryStorage(["Stored note"]);
  globalThis.document = {
    activeElement: null,
    querySelector(selector) {
      return {
        "#note-form": form,
        "#note-input": input,
        "#note-list": noteList,
      }[selector];
    },
    createElement(tagName) {
      return new FakeElement(tagName);
    },
  };

  await import(`../app.js?test=${Date.now()}`);

  assert.equal(noteList.children[0].children[0].textContent, "Stored note");

  input.value = "New note";
  form.dispatch("submit");
  assert.deepEqual(JSON.parse(localStorage.getItem("notes")), ["Stored note", "New note"]);

  noteList.children[0].children[1].dispatch("click");
  assert.deepEqual(JSON.parse(localStorage.getItem("notes")), ["New note"]);

  delete globalThis.document;
  delete globalThis.localStorage;
});

test("keeps additions and deletions working when storage access fails", async () => {
  const form = new FakeElement("form");
  const input = new FakeElement("textarea");
  const noteList = new FakeElement("ul");
  globalThis.localStorage = {
    getItem() {
      throw new Error("Storage access denied");
    },
    setItem() {
      throw new Error("Storage quota exceeded");
    },
  };
  globalThis.document = {
    activeElement: null,
    querySelector(selector) {
      return {
        "#note-form": form,
        "#note-input": input,
        "#note-list": noteList,
      }[selector];
    },
    createElement(tagName) {
      return new FakeElement(tagName);
    },
  };

  await import(`../app.js?storage-failure=${Date.now()}`);

  input.value = "Available in memory";
  form.dispatch("submit");
  assert.equal(noteList.children[0].children[0].textContent, "Available in memory");

  noteList.children[0].children[1].dispatch("click");
  assert.equal(noteList.children.length, 0);
  assert.equal(document.activeElement, input);

  delete globalThis.document;
  delete globalThis.localStorage;
});
