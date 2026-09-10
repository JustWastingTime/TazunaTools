/** Shared shell helpers for Toolkino Minoru */
(function () {
  const NAV = [
    { id: "converter", icon: "translate", label: "Converter" },
    { id: "formatter", icon: "event_note", label: "Event Formatter" },
    { id: "cropper", icon: "crop", label: "Cropper" },
    { id: "wheelspin", icon: "casino", label: "Wheelspin" },
    { id: "splitter", icon: "call_split", label: "Splitter" },
    { id: "visualizer", icon: "query_stats", label: "Skill Visualizer" },
  ];

  function resolveBase() {
    return document.body?.dataset?.root || ".";
  }

  const BOT_ASSET_FILES = {
    "skill.json": "skill.json",
    "maps.json": "maps.json",
    "champsmeet.json": "champsmeet.json",
  };
  const BOT_RAW_BASE = "https://raw.githubusercontent.com/JustWastingTime/TazunaDiscordBot/heads/main/assets";
  const BOT_JSDELIVR_BASE = "https://cdn.jsdelivr.net/gh/JustWastingTime/TazunaDiscordBot@main/assets";

  async function fetchJson(url) {
    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    return res.json();
  }

  window.Toolkino = {
    activePage: document.body?.dataset?.page || "",
    dataSource: {},
    dataUrl(file) {
      const base = document.body?.dataset?.root || resolveBase();
      return `${base}/data/${file}`;
    },
    assetUrl(file) {
      const base = document.body?.dataset?.root || resolveBase();
      return `${base}/assets/${file}`;
    },
    renderSidebar(activeId) {
      const root = document.body?.dataset?.root || resolveBase();
      const links = NAV.map((item) => {
        const href = `${root}/${item.id}/`;
        const active = item.id === activeId ? " active" : "";
        return `<a class="nav-link${active}" href="${href}">
          <span class="material-symbols-outlined">${item.icon}</span>
          <span class="label-caps">${item.label}</span>
        </a>`;
      }).join("");

      return `<aside class="sidebar">
        <div class="sidebar-brand">
          <h1>Toolkino Minoru</h1>
          <p>Personal tools for tazunabot</p>
        </div>
        <nav>${links}</nav>
        <div class="sidebar-footer">
          <a class="nav-link" href="https://github.com" target="_blank" rel="noreferrer">
            <span class="material-symbols-outlined">terminal</span>
            <span class="label-caps">GitHub</span>
          </a>
        </div>
      </aside>`;
    },
    mountShell(activeId) {
      const mount = document.getElementById("sidebar-mount");
      if (mount) mount.outerHTML = this.renderSidebar(activeId);
    },
    async loadJson(file) {
      const asset = BOT_ASSET_FILES[file];
      if (asset) {
        const remotes = [`${BOT_RAW_BASE}/${asset}`, `${BOT_JSDELIVR_BASE}/${asset}`];
        for (const url of remotes) {
          try {
            const data = await fetchJson(url);
            this.dataSource[file] = url.startsWith(BOT_RAW_BASE) ? "github" : "jsdelivr";
            return data;
          } catch (err) {
            console.warn(`Toolkino: remote ${file} failed`, url, err);
          }
        }
      }
      const res = await fetch(this.dataUrl(file));
      if (!res.ok) throw new Error(`Failed to load ${file}`);
      this.dataSource[file] = "local";
      return res.json();
    },
    copyText(text) {
      return navigator.clipboard.writeText(text);
    },
    downloadText(filename, text, type = "application/json") {
      const blob = new Blob([text], { type });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    },
    highlightJson(jsonString) {
      return jsonString.replace(
        /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
        (match) => {
          let cls = "tok-string";
          if (/^"/.test(match)) {
            cls = /:$/.test(match) ? "tok-key" : "tok-string";
          } else if (/true|false/.test(match)) {
            cls = "tok-bool";
          } else if (/null/.test(match)) {
            cls = "tok-null";
          } else {
            cls = "tok-number";
          }
          return `<span class="${cls}">${match}</span>`;
        }
      );
    },
  };
})();
