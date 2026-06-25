const { Notice, Plugin, PluginSettingTab, Setting } = require("obsidian");

const DEFAULT_SETTINGS = {
  enabled: true,
  fixationLevel: 3,
  minimumWordLength: 1,
  applyToHeadings: true,
  applyToLinks: true,
};

const HEADING_TAGS = new Set(["H1", "H2", "H3", "H4", "H5", "H6"]);
const SKIP_TAGS = new Set(["CODE", "PRE", "STYLE", "SCRIPT", "SVG", "MATH"]);
const SKIP_SELECTOR =
  ".math, .math-inline, .math-block, .katex, .MathJax, .MJX-TEX, mjx-container";

function clampNumber(value, min, max, fallback) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, number));
}

function normalizeSettings(settings) {
  const merged = Object.assign({}, DEFAULT_SETTINGS, settings);

  return {
    enabled: merged.enabled !== false,
    fixationLevel: clampNumber(
      merged.fixationLevel,
      1,
      5,
      DEFAULT_SETTINGS.fixationLevel,
    ),
    minimumWordLength: clampNumber(
      merged.minimumWordLength,
      1,
      12,
      DEFAULT_SETTINGS.minimumWordLength,
    ),
    applyToHeadings: merged.applyToHeadings !== false,
    applyToLinks: merged.applyToLinks !== false,
  };
}

function unwrapExistingBionicSpans(root) {
  for (const span of Array.from(root.querySelectorAll("span.bionic-bold"))) {
    span.replaceWith(document.createTextNode(span.textContent ?? ""));
  }
  root.normalize();
}

function isInsideSkippedElement(textNode, settings) {
  let parent = textNode.parentElement;

  while (parent) {
    if (SKIP_TAGS.has(parent.tagName) || parent.matches?.(SKIP_SELECTOR)) {
      return true;
    }

    if (!settings.applyToHeadings && HEADING_TAGS.has(parent.tagName)) {
      return true;
    }

    if (!settings.applyToLinks && parent.tagName === "A") {
      return true;
    }

    parent = parent.parentElement;
  }

  return false;
}

function isEscaped(text, index) {
  let slashCount = 0;

  for (let i = index - 1; i >= 0 && text[i] === "\\"; i--) {
    slashCount += 1;
  }

  return slashCount % 2 === 1;
}

function findClosingDelimiter(text, delimiter, startIndex) {
  for (let i = startIndex; i < text.length; i++) {
    if (isEscaped(text, i)) {
      continue;
    }

    if (text.startsWith(delimiter, i)) {
      return i;
    }
  }

  return -1;
}

function splitByMathRanges(text) {
  const segments = [];
  let cursor = 0;
  let textStart = 0;

  function pushText(end) {
    if (end > textStart) {
      segments.push({ type: "text", text: text.slice(textStart, end) });
    }
  }

  while (cursor < text.length) {
    let opener = "";
    let closer = "";

    if (
      text[cursor] === "\\" &&
      (text[cursor + 1] === "(" || text[cursor + 1] === "[")
    ) {
      opener = text.slice(cursor, cursor + 2);
      closer = text[cursor + 1] === "(" ? "\\)" : "\\]";
    } else if (text[cursor] === "$" && !isEscaped(text, cursor)) {
      opener = text[cursor + 1] === "$" ? "$$" : "$";
      closer = opener;
    }

    if (!opener) {
      cursor += 1;
      continue;
    }

    const closeIndex = findClosingDelimiter(text, closer, cursor + opener.length);

    if (closeIndex === -1) {
      cursor += opener.length;
      continue;
    }

    pushText(cursor);
    const mathEnd = closeIndex + closer.length;
    segments.push({ type: "math", text: text.slice(cursor, mathEnd) });
    cursor = mathEnd;
    textStart = cursor;
  }

  pushText(text.length);
  return segments;
}

function fixationLength(word, fixationRatio, minimumWordLength) {
  if (word.length <= 0 || word.length < minimumWordLength) {
    return 0;
  }
  if (word.length <= 3) {
    return 1;
  }
  if (word.length === 4) {
    return 2;
  }

  return Math.ceil(word.length * fixationRatio);
}

function appendBionicText(fragment, text, options) {
  const chunks = text.match(/[a-zA-Z\u00C0-\u024F']+|[^a-zA-Z\u00C0-\u024F']+/g);

  if (!chunks) {
    return;
  }

  for (const chunk of chunks) {
    if (!/[a-zA-Z\u00C0-\u024F]/.test(chunk)) {
      fragment.appendChild(document.createTextNode(chunk));
      continue;
    }

    const splitAt = fixationLength(
      chunk,
      options.fixationRatio,
      options.minimumWordLength,
    );

    if (splitAt <= 0) {
      fragment.appendChild(document.createTextNode(chunk));
      continue;
    }

    const fixed = chunk.slice(0, splitAt);
    const rest = chunk.slice(splitAt);
    const span = document.createElement("span");

    span.className = "bionic-bold";
    span.textContent = fixed;
    fragment.appendChild(span);

    if (rest) {
      fragment.appendChild(document.createTextNode(rest));
    }
  }
}

function fixationRatioForLevel(fixationLevel) {
  return 0.2 + fixationLevel * 0.1;
}

function processorOptions(settingsOrRatio) {
  if (typeof settingsOrRatio === "number") {
    return Object.assign({}, DEFAULT_SETTINGS, {
      fixationRatio: settingsOrRatio,
    });
  }

  const settings = normalizeSettings(settingsOrRatio);

  return Object.assign({}, settings, {
    fixationRatio: fixationRatioForLevel(settings.fixationLevel),
  });
}

function applyBionicReading(root, settingsOrRatio) {
  const options = processorOptions(settingsOrRatio);
  unwrapExistingBionicSpans(root);

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  let textNode;

  while ((textNode = walker.nextNode())) {
    textNodes.push(textNode);
  }

  for (const node of textNodes) {
    if (isInsideSkippedElement(node, options)) {
      continue;
    }

    const text = node.textContent;

    if (!text?.trim()) {
      continue;
    }

    const fragment = document.createDocumentFragment();
    const segments = splitByMathRanges(text);

    for (const segment of segments) {
      if (segment.type === "math") {
        fragment.appendChild(document.createTextNode(segment.text));
      } else {
        appendBionicText(fragment, segment.text, options);
      }
    }

    node.parentNode?.replaceChild(fragment, node);
  }
}

class BionicReadingSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Enable bionic reading")
      .setDesc("Toggle the bionic reading effect in rendered Markdown.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enabled)
          .onChange(async (value) => {
            await this.plugin.updateSettings({ enabled: value });
          }),
      );

    new Setting(containerEl)
      .setName("Fixation strength")
      .setDesc("Controls how many letters per word are bolded.")
      .addSlider((slider) =>
        slider
          .setLimits(1, 5, 1)
          .setValue(this.plugin.settings.fixationLevel)
          .setDynamicTooltip()
          .onChange(async (value) => {
            await this.plugin.updateSettings({ fixationLevel: value });
          }),
      );

    new Setting(containerEl)
      .setName("Minimum word length")
      .setDesc("Leave words shorter than this unchanged.")
      .addSlider((slider) =>
        slider
          .setLimits(1, 12, 1)
          .setValue(this.plugin.settings.minimumWordLength)
          .setDynamicTooltip()
          .onChange(async (value) => {
            await this.plugin.updateSettings({ minimumWordLength: value });
          }),
      );

    new Setting(containerEl)
      .setName("Apply to headings")
      .setDesc("Bold the first letters inside rendered Markdown headings.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.applyToHeadings)
          .onChange(async (value) => {
            await this.plugin.updateSettings({ applyToHeadings: value });
          }),
      );

    new Setting(containerEl)
      .setName("Apply to links")
      .setDesc("Bold the first letters inside rendered Markdown links.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.applyToLinks)
          .onChange(async (value) => {
            await this.plugin.updateSettings({ applyToLinks: value });
          }),
      );
  }
}

class BionicReadingPlugin extends Plugin {
  constructor(...args) {
    super(...args);
    this.settings = DEFAULT_SETTINGS;
  }

  async onload() {
    await this.loadSettings();

    this.addCommand({
      id: "toggle-bionic-reading",
      name: "Toggle bionic reading",
      callback: async () => {
        await this.updateSettings({ enabled: !this.settings.enabled });
        new Notice(
          `Bionic reading ${this.settings.enabled ? "enabled" : "disabled"}.`,
        );
      },
    });

    this.addSettingTab(new BionicReadingSettingTab(this.app, this));

    this.registerMarkdownPostProcessor((element) => {
      if (!this.settings.enabled) {
        unwrapExistingBionicSpans(element);
        return;
      }

      applyBionicReading(element, this.settings);
    });
  }

  async loadSettings() {
    this.settings = normalizeSettings(await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async updateSettings(settings) {
    this.settings = normalizeSettings(Object.assign({}, this.settings, settings));
    await this.saveSettings();
    this.refreshOpenMarkdownViews();
  }

  refreshOpenMarkdownViews() {
    if (typeof document !== "undefined") {
      for (const element of Array.from(
        document.querySelectorAll(".markdown-preview-view, .markdown-rendered"),
      )) {
        unwrapExistingBionicSpans(element);

        if (this.settings.enabled) {
          applyBionicReading(element, this.settings);
        }
      }
    }

    this.app.workspace.iterateAllLeaves?.((leaf) => {
      const view = leaf.view;

      if (view?.getViewType?.() !== "markdown") {
        return;
      }

      view.previewMode?.rerender?.(true);
      view.currentMode?.rerender?.(true);
    });
  }
}

Object.defineProperty(module.exports, "__esModule", { value: true });
module.exports.default = BionicReadingPlugin;
module.exports.DEFAULT_SETTINGS = DEFAULT_SETTINGS;
module.exports.applyBionicReading = applyBionicReading;
module.exports.fixationLength = fixationLength;
module.exports.normalizeSettings = normalizeSettings;
module.exports.processorOptions = processorOptions;
module.exports.splitByMathRanges = splitByMathRanges;
