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

test("moves focus to an adjacent delete button, then the input, after deletion", async () => {
  const form = new FakeElement("form");
  const input = new FakeElement("textarea");
  const noteList = new FakeElement("ul");

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

  delete globalThis.document;
});
