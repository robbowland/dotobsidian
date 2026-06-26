const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");

const originalLoad = Module._load;

class Plugin {
  constructor() {
    this.app = {
      vault: {},
      workspace: {
        on() {
          return {};
        },
      },
    };
  }

  addCommand(command) {
    this.commands = (this.commands || []).concat(command);
  }

  registerEvent(eventRef) {
    this.events = (this.events || []).concat(eventRef);
  }

  async loadData() {
    return this.data || null;
  }

  async saveData(data) {
    this.savedData = data;
  }
}

class Modal {
  constructor(app) {
    this.app = app;
    this.contentEl = {
      empty() {},
      createEl() {},
    };
  }

  open() {
    this.onOpen();
  }

  close() {
    this.onClose();
  }
}

class Setting {
  constructor() {}

  setName() {
    return this;
  }

  addText(callback) {
    callback({
      inputEl: {
        focus() {},
        addEventListener() {},
      },
      getValue() {
        return "";
      },
    });
    return this;
  }

  addButton(callback) {
    callback({
      setButtonText() {
        return this;
      },
      setCta() {
        return this;
      },
      onClick() {
        return this;
      },
    });
    return this;
  }
}

Module._load = (request, parent, isMain) => {
  if (request === "obsidian") return { Modal, Plugin, Setting };
  if (request.startsWith(".")) {
    throw new Error(`Relative require blocked: ${request}`);
  }
  return originalLoad(request, parent, isMain);
};

const PluginClass = require(path.resolve(__dirname, "main.js"));
Module._load = originalLoad;

function fakeEditor() {
  return {
    text: "",
    cursor: { line: 0, ch: 0 },
    getCursor() {
      return { ...this.cursor };
    },
    replaceSelection(text) {
      this.text =
        this.text.slice(0, this.cursor.ch) + text + this.text.slice(this.cursor.ch);
      this.cursor.ch += text.length;
    },
    setCursor(cursor) {
      this.cursor = { ...cursor };
    },
  };
}

async function main() {
  const plugin = new PluginClass();
  await plugin.onload();
  assert.deepEqual(
    plugin.commands.map((command) => command.id),
    [
      "insert-project-marker",
      "insert-project-task-marker",
      "insert-inbox-marker",
      "create-inbox-inline-task",
      "create-todo-inline-task",
      "create-project",
      "open-daily-note-preserve-mode",
      "open-home",
    ],
  );

  {
    const editor = fakeEditor();
    PluginClass.insertProjectMarker(editor);
    assert.equal(editor.text, PluginClass.PROJECT_MARKER);
    assert.deepEqual(editor.cursor, {
      line: 0,
      ch: PluginClass.PROJECT_MARKER.length - 2,
    });
  }

  {
    const editor = fakeEditor();
    PluginClass.insertProjectTaskMarker(editor);
    assert.equal(editor.text, PluginClass.PROJECT_TASK_MARKER);
    assert.deepEqual(editor.cursor, {
      line: 0,
      ch: PluginClass.PROJECT_TASK_MARKER.length,
    });
  }

  {
    const editor = fakeEditor();
    PluginClass.insertInboxMarker(editor);
    assert.equal(editor.text, PluginClass.INBOX_MARKER);
    assert.deepEqual(editor.cursor, {
      line: 0,
      ch: PluginClass.INBOX_MARKER.length,
    });
  }

  for (const [requestedStatus, originalStatus, expectedStatus] of [
    [PluginClass.INBOX_STATUS, "todo", "inbox"],
    [PluginClass.TODO_STATUS, "inbox", "todo"],
  ]) {
    const editor = fakeEditor();
    const calls = [];
    const tasknotes = {
      settings: { defaultTaskStatus: originalStatus },
      async createInlineTask(arg) {
        calls.push(["createInlineTask", arg === editor, this.settings.defaultTaskStatus]);
      },
    };
    const instance = new PluginClass();
    instance.app = {
      plugins: { plugins: { tasknotes } },
    };

    await instance.createInlineTaskWithStatus(editor, requestedStatus);

    assert.deepEqual(calls, [["createInlineTask", true, expectedStatus]]);
    assert.equal(tasknotes.settings.defaultTaskStatus, originalStatus);
  }

  assert.equal(PluginClass.projectPathForTitle("New Project"), "projects/new-project.md");
  assert.equal(
    PluginClass.projectPathForTitle("HTTP/API: Cleanup?"),
    "projects/http-api-cleanup.md",
  );
  assert.equal(
    PluginClass.projectLinkForTitle("New Project"),
    "[[projects/new-project|New Project]]",
  );
  assert.equal(
    PluginClass.projectLinkForTitle("HTTP/API: Cleanup?"),
    "[[projects/http-api-cleanup|HTTP/API: Cleanup?]]",
  );
  assert.equal(PluginClass.projectPathForTitle("!!!"), "projects/project.md");

  {
    const content = PluginClass.projectContent("New Project", "2026-06-18");
    assert.match(
      content,
      /^---\ntype: project\nstatus: open\nopened: 2026-06-18\ntitle: "New Project"\naliases:\n  - "New Project"\ncssclasses:\n  - project-note\n---/m,
    );
    assert.doesNotMatch(content, /\narea:|\ndeadline:|\ntags:/);
    assert.doesNotMatch(content, /\n## Tasks|\n## Notes|\n## Related Concepts|\n## Sources Used/);
    assert.match(content, /---\n# New Project\n\n> _Context._\n/);
  }

  {
    const editor = fakeEditor();
    const calls = [];
    const projectEditor = {
      cursor: null,
      focused: false,
      setCursor(cursor) {
        this.cursor = cursor;
      },
      focus() {
        this.focused = true;
      },
    };
    const app = {
      vault: {
        getAbstractFileByPath(path) {
          calls.push(["get", path]);
          return null;
        },
        async createFolder(path) {
          calls.push(["createFolder", path]);
        },
        async create(path, content) {
          calls.push(["create", path, content]);
          return { path };
        },
      },
      workspace: {
        getLeaf() {
          return {
            view: { editor: projectEditor },
            async openFile(file) {
              calls.push(["open", file.path]);
            },
          };
        },
      },
    };
    const instance = new PluginClass();
    instance.app = app;

    await instance.createProject(editor, "New Project", "2026-06-18");

    assert.equal(editor.text, "- **[P]** [[projects/new-project|New Project]]");
    assert.deepEqual(calls.map((call) => call.slice(0, 2)), [
      ["get", "projects"],
      ["createFolder", "projects"],
      ["get", "projects/new-project.md"],
      ["create", "projects/new-project.md"],
      ["open", "projects/new-project.md"],
    ]);
    assert.deepEqual(projectEditor.cursor, { line: 13, ch: 0 });
    assert.equal(projectEditor.focused, true);
  }

  {
    const editor = fakeEditor();
    const instance = new PluginClass();
    let createdTitle = null;
    instance.requestProjectTitle = async () => "Prompted Project";
    instance.createProject = async (_editor, title) => {
      createdTitle = title;
    };

    await instance.promptAndCreateProject(editor);

    assert.equal(createdTitle, "Prompted Project");
  }

  {
    const calls = [];
    const leaf = {
      getViewState() {
        return {
          type: "markdown",
          state: { file: "daily/2026-06-18.md", mode: "source" },
        };
      },
      async setViewState(state) {
        calls.push(["setViewState", state.state.mode]);
      },
    };
    const instance = new PluginClass();
    instance.settings = { dailyNoteMode: "preview" };
    instance.app = {
      commands: {
        async executeCommandById(commandId) {
          calls.push(["execute", commandId]);
        },
      },
      workspace: {
        activeLeaf: leaf,
        getActiveFile() {
          return { path: "notes/elsewhere.md" };
        },
      },
    };

    await instance.openDailyNotePreservingMode();

    assert.deepEqual(calls, [
      ["execute", "daily-notes"],
      ["setViewState", "preview"],
    ]);
  }

  {
    const calls = [];
    const instance = new PluginClass();
    instance.settings = {};
    instance.app = {
      vault: {
        getAbstractFileByPath(path) {
          calls.push(["get", path]);
          return null;
        },
        async create(path, content) {
          calls.push(["create", path, content.includes("## Inbox")]);
          return { path };
        },
      },
      workspace: {
        getLeaf() {
          return {
            async openFile(file) {
              calls.push(["open", file.path]);
            },
          };
        },
      },
    };

    await instance.openHome();

    assert.deepEqual(calls, [
      ["get", "home.md"],
      ["create", "home.md", true],
      ["open", "home.md"],
    ]);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
