const { Modal, Plugin, Setting } = require("obsidian");

const PROJECT_MARKER = "- **[P]** [[]]";
const PROJECT_TASK_MARKER = "- **[P.t]** ";
const INBOX_MARKER = "- **[I]** ";
const PROJECTS_FOLDER = "projects";
const DAILY_FOLDER = "daily";
const HOME_PATH = "home.md";
const TODO_STATUS = "todo";
const DEFAULT_SETTINGS = {
  dailyNoteMode: "preview",
};
const HOME_CONTENT = `# Home

This dashboard is a low-friction re-entry point for current work: daily capture, active projects, and tasks that need attention.

## Enter

- Daily note: use \`Cmd+Shift+D\`
- Projects: [[projects/projects.base|Projects]]
- Agenda: [[tasks/views/agenda-default.base|Agenda]]
- Tasks: [[tasks/views/tasks-default.base|Tasks]]

## Inbox

\`\`\`query
"**[I]**" path:daily/
\`\`\`

## Current Projects

![[projects/projects.base]]

## Task Surfacing

![[tasks/views/agenda-default.base]]

## All Tasks

![[tasks/views/tasks-default.base]]

## Related Concepts

- [[projects/projects.base|Projects]]
- [[notes/vault-log|Vault log]]

## Sources Used

- Bach et al., Dashboard Design Patterns, 2022.
- Jones et al., Personal Information Management, 2021.
- Local Obsidian Bases and TaskNotes views.
`;

function insertMarker(editor, marker, cursorOffsetFromEnd = 0) {
  const start = editor.getCursor();
  editor.replaceSelection(marker);
  editor.setCursor({
    line: start.line,
    ch: start.ch + marker.length - cursorOffsetFromEnd,
  });
}

function insertProjectMarker(editor) {
  insertMarker(editor, PROJECT_MARKER, 2);
}

function insertProjectTaskMarker(editor) {
  insertMarker(editor, PROJECT_TASK_MARKER);
}

function insertInboxMarker(editor) {
  insertMarker(editor, INBOX_MARKER);
}

function localDate() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function sanitizeProjectFileName(title) {
  return (
    title
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "project"
  );
}

function projectPathForTitle(title) {
  return `${PROJECTS_FOLDER}/${sanitizeProjectFileName(title)}.md`;
}

function projectLinkForTitle(title) {
  const path = projectPathForTitle(title).replace(/\.md$/, "");
  return `[[${path}|${title}]]`;
}

function projectMarkerForTitle(title) {
  return `- **[P]** ${projectLinkForTitle(title)}`;
}

function yamlString(value) {
  return JSON.stringify(value);
}

function projectContent(title, date = localDate()) {
  return `---
type: project
status: open
opened: ${date}
title: ${yamlString(title)}
aliases:
  - ${yamlString(title)}
cssclasses:
  - project-note
---
# ${title}

> _Context._
`;
}

function taskCursorForProjectContent(content) {
  const taskHeading = content.split("\n").findIndex((line) => line === "## Tasks");
  if (taskHeading !== -1) return { line: taskHeading + 1, ch: 0 };

  const lines = content.split("\n");
  return { line: lines.length - 1, ch: lines[lines.length - 1].length };
}

function isDailyNotePath(path) {
  return path.startsWith(`${DAILY_FOLDER}/`) && /\d{4}-\d{2}-\d{2}\.md$/.test(path);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class ProjectTitleModal extends Modal {
  constructor(app, onSubmit) {
    super(app);
    this.onSubmit = onSubmit;
    this.submitted = false;
  }

  onOpen() {
    let input;
    this.contentEl.empty();
    this.contentEl.createEl("h2", { text: "Create project" });

    new Setting(this.contentEl).setName("Project title").addText((text) => {
      input = text;
      text.inputEl.focus();
      text.inputEl.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          this.submit(text.getValue());
        }
      });
    });

    new Setting(this.contentEl)
      .addButton((button) =>
        button
          .setButtonText("Create")
          .setCta()
          .onClick(() => this.submit(input.getValue())),
      )
      .addButton((button) =>
        button
          .setButtonText("Cancel")
          .onClick(() => this.close()),
      );
  }

  submit(title) {
    this.submitted = true;
    this.onSubmit((title || "").trim());
    this.close();
  }

  onClose() {
    this.contentEl.empty();
    if (!this.submitted) this.onSubmit("");
  }
}

class ProjectCaptureMarkersPlugin extends Plugin {
  async onload() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

    this.addCommand({
      id: "insert-project-marker",
      name: "Insert project marker",
      editorCallback: insertProjectMarker,
    });

    this.addCommand({
      id: "insert-project-task-marker",
      name: "Insert project task marker",
      editorCallback: insertProjectTaskMarker,
    });

    this.addCommand({
      id: "insert-inbox-marker",
      name: "Insert inbox marker",
      editorCallback: insertInboxMarker,
    });

    this.addCommand({
      id: "create-todo-inline-task",
      name: "Create TODO inline task",
      editorCallback: (editor) => this.createInlineTaskWithStatus(editor, TODO_STATUS),
    });

    this.addCommand({
      id: "create-project",
      name: "Create project",
      editorCallback: (editor) => this.promptAndCreateProject(editor),
    });

    this.addCommand({
      id: "open-daily-note-preserve-mode",
      name: "Open daily note preserving mode",
      callback: () => this.openDailyNotePreservingMode(),
    });

    this.addCommand({
      id: "open-home",
      name: "Open home",
      callback: () => this.openHome(),
    });

    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => this.rememberDailyNoteMode()),
    );
    this.registerEvent(
      this.app.workspace.on("layout-change", () => this.rememberDailyNoteMode()),
    );
  }

  async promptAndCreateProject(editor) {
    const title = await this.requestProjectTitle();
    if (!title) return;

    await this.createProject(editor, title);
  }

  async createInlineTaskWithStatus(editor, status) {
    const tasknotes = this.app.plugins?.plugins?.tasknotes;
    if (!tasknotes?.settings || typeof tasknotes.createInlineTask !== "function") {
      await this.app.commands?.executeCommandById?.("tasknotes:create-inline-task");
      return;
    }

    const previousStatus = tasknotes.settings.defaultTaskStatus;
    tasknotes.settings.defaultTaskStatus = status;
    try {
      await tasknotes.createInlineTask(editor);
    } finally {
      tasknotes.settings.defaultTaskStatus = previousStatus;
    }
  }

  requestProjectTitle() {
    return new Promise((resolve) => new ProjectTitleModal(this.app, resolve).open());
  }

  async ensureProjectsFolder() {
    if (!this.app.vault.getAbstractFileByPath(PROJECTS_FOLDER)) {
      await this.app.vault.createFolder(PROJECTS_FOLDER);
    }
  }

  async createProject(editor, title, date = localDate()) {
    const path = projectPathForTitle(title);
    const content = projectContent(title, date);
    await this.ensureProjectsFolder();
    let file = this.app.vault.getAbstractFileByPath(path);

    if (!file) {
      file = await this.app.vault.create(path, content);
    }

    editor.replaceSelection(projectMarkerForTitle(title));
    const leaf = this.app.workspace.getLeaf(false);
    await leaf.openFile(file);
    leaf.view?.editor?.setCursor(taskCursorForProjectContent(content));
    leaf.view?.editor?.focus();
  }

  activeMarkdownMode() {
    const state = this.app.workspace.activeLeaf?.getViewState?.();
    return state?.type === "markdown" ? state.state?.mode : null;
  }

  rememberDailyNoteMode() {
    if (this.restoringDailyMode) return null;

    const file = this.app.workspace.getActiveFile?.();
    const mode = this.activeMarkdownMode();
    if (!file || !isDailyNotePath(file.path) || !mode) return null;

    this.settings.dailyNoteMode = mode;
    this.saveData(this.settings);
    return mode;
  }

  async openDailyNotePreservingMode() {
    const mode = this.rememberDailyNoteMode() || this.settings.dailyNoteMode;
    this.restoringDailyMode = true;
    try {
      await this.app.commands.executeCommandById("daily-notes");
      await sleep(0);
      await this.setActiveMarkdownMode(mode);
    } finally {
      this.restoringDailyMode = false;
    }
  }

  async setActiveMarkdownMode(mode) {
    const leaf = this.app.workspace.activeLeaf;
    const state = leaf?.getViewState?.();
    if (!mode || state?.type !== "markdown") return;

    await leaf.setViewState({
      ...state,
      state: {
        ...state.state,
        mode,
      },
    });
  }

  async openHome() {
    let file = this.app.vault.getAbstractFileByPath(HOME_PATH);
    if (!file) {
      file = await this.app.vault.create(HOME_PATH, HOME_CONTENT);
    }

    await this.app.workspace.getLeaf(false).openFile(file);
  }
}

ProjectCaptureMarkersPlugin.PROJECT_MARKER = PROJECT_MARKER;
ProjectCaptureMarkersPlugin.PROJECT_TASK_MARKER = PROJECT_TASK_MARKER;
ProjectCaptureMarkersPlugin.INBOX_MARKER = INBOX_MARKER;
ProjectCaptureMarkersPlugin.TODO_STATUS = TODO_STATUS;
ProjectCaptureMarkersPlugin.insertProjectMarker = insertProjectMarker;
ProjectCaptureMarkersPlugin.insertProjectTaskMarker = insertProjectTaskMarker;
ProjectCaptureMarkersPlugin.insertInboxMarker = insertInboxMarker;
ProjectCaptureMarkersPlugin.projectPathForTitle = projectPathForTitle;
ProjectCaptureMarkersPlugin.projectLinkForTitle = projectLinkForTitle;
ProjectCaptureMarkersPlugin.projectContent = projectContent;
ProjectCaptureMarkersPlugin.projectMarkerForTitle = projectMarkerForTitle;
ProjectCaptureMarkersPlugin.taskCursorForProjectContent = taskCursorForProjectContent;

module.exports = ProjectCaptureMarkersPlugin;
