import test from "node:test";
import assert from "node:assert/strict";

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.listeners = new Map();
    this.value = "";
    this.hidden = false;
  }

  replaceChildren(...children) {
    this.children = children;
  }

  append(...children) {
    this.children.push(...children);
  }

  setAttribute() {}

  removeAttribute() {}

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
  const inputError = new FakeElement("p");
  const storageStatus = new FakeElement("p");
  const noteList = new FakeElement("ul");
  globalThis.localStorage = new MemoryStorage();

  globalThis.document = {
    activeElement: null,
    querySelector(selector) {
      return {
        "#note-form": form,
        "#note-input": input,
        "#note-error": inputError,
        "#storage-status": storageStatus,
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
  const inputError = new FakeElement("p");
  const storageStatus = new FakeElement("p");
  const noteList = new FakeElement("ul");
  globalThis.localStorage = new MemoryStorage(["Stored note"]);
  globalThis.document = {
    activeElement: null,
    querySelector(selector) {
      return {
        "#note-form": form,
        "#note-input": input,
        "#note-error": inputError,
        "#storage-status": storageStatus,
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

test("does not show a load error for an empty store", async () => {
  const form = new FakeElement("form");
  const input = new FakeElement("textarea");
  const inputError = new FakeElement("p");
  const storageStatus = new FakeElement("p");
  const noteList = new FakeElement("ul");
  globalThis.localStorage = new MemoryStorage();
  globalThis.document = {
    activeElement: null,
    querySelector(selector) {
      return {
        "#note-form": form,
        "#note-input": input,
        "#note-error": inputError,
        "#storage-status": storageStatus,
        "#note-list": noteList,
      }[selector];
    },
    createElement(tagName) {
      return new FakeElement(tagName);
    },
  };

  await import(`../app.js?empty-storage=${Date.now()}`);

  assert.equal(noteList.children.length, 0);
  assert.equal(storageStatus.textContent ?? "", "");

  delete globalThis.document;
  delete globalThis.localStorage;
});

test("reports an initial load failure without stopping initialization", async () => {
  const form = new FakeElement("form");
  const input = new FakeElement("textarea");
  const inputError = new FakeElement("p");
  const storageStatus = new FakeElement("p");
  const noteList = new FakeElement("ul");
  globalThis.localStorage = {
    getItem() {
      throw new Error("Storage access denied");
    },
    setItem() {},
  };
  globalThis.document = {
    activeElement: null,
    querySelector(selector) {
      return {
        "#note-form": form,
        "#note-input": input,
        "#note-error": inputError,
        "#storage-status": storageStatus,
        "#note-list": noteList,
      }[selector];
    },
    createElement(tagName) {
      return new FakeElement(tagName);
    },
  };

  await import(`../app.js?load-failure=${Date.now()}`);

  assert.equal(storageStatus.textContent, "저장된 메모를 불러오지 못했습니다.");
  assert.equal(noteList.children.length, 0);
  assert.equal(form.listeners.has("submit"), true);

  delete globalThis.document;
  delete globalThis.localStorage;
});

test("keeps additions and deletions working when storage access fails", async () => {
  const form = new FakeElement("form");
  const input = new FakeElement("textarea");
  const inputError = new FakeElement("p");
  const storageStatus = new FakeElement("p");
  const noteList = new FakeElement("ul");
  let storageShouldFail = true;
  globalThis.localStorage = {
    getItem() {
      throw new Error("Storage access denied");
    },
    setItem() {
      if (storageShouldFail) {
        throw new Error("Storage quota exceeded");
      }
    },
  };
  globalThis.document = {
    activeElement: null,
    querySelector(selector) {
      return {
        "#note-form": form,
        "#note-input": input,
        "#note-error": inputError,
        "#storage-status": storageStatus,
        "#note-list": noteList,
      }[selector];
    },
    createElement(tagName) {
      return new FakeElement(tagName);
    },
  };

  await import(`../app.js?storage-failure=${Date.now()}`);

  assert.equal(storageStatus.textContent, "저장된 메모를 불러오지 못했습니다.");

  input.value = "Available in memory";
  form.dispatch("submit");
  assert.equal(noteList.children[0].children[0].textContent, "Available in memory");
  assert.equal(
    storageStatus.textContent,
    "변경 사항이 이 브라우저에 저장되지 않았습니다.",
  );
  assert.equal(storageStatus.hidden, false);

  storageShouldFail = false;
  noteList.children[0].children[1].dispatch("click");
  assert.equal(noteList.children.length, 0);
  assert.equal(document.activeElement, input);
  assert.equal(storageStatus.textContent, "");
  assert.equal(storageStatus.hidden, false);

  delete globalThis.document;
  delete globalThis.localStorage;
});

test("shows validation feedback for empty and whitespace-only notes", async () => {
  const form = new FakeElement("form");
  const input = new FakeElement("textarea");
  const inputError = new FakeElement("p");
  const storageStatus = new FakeElement("p");
  const noteList = new FakeElement("ul");
  inputError.hidden = true;
  globalThis.localStorage = new MemoryStorage();
  globalThis.document = {
    activeElement: null,
    querySelector(selector) {
      return {
        "#note-form": form,
        "#note-input": input,
        "#note-error": inputError,
        "#storage-status": storageStatus,
        "#note-list": noteList,
      }[selector];
    },
    createElement(tagName) {
      return new FakeElement(tagName);
    },
  };

  await import(`../app.js?validation=${Date.now()}`);

  for (const invalidValue of ["", " \t\n "]) {
    input.value = invalidValue;
    document.activeElement = null;
    form.dispatch("submit");

    assert.equal(inputError.hidden, false);
    assert.equal(document.activeElement, input);
    assert.equal(noteList.children.length, 0);
  }

  input.value = "Valid note";
  form.dispatch("submit");
  assert.equal(inputError.hidden, true);
  assert.equal(noteList.children[0].children[0].textContent, "Valid note");

  delete globalThis.document;
  delete globalThis.localStorage;
});
