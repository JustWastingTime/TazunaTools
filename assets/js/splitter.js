/** Randomly split a pasted name list into X groups */
(function () {
  const GROUP_COLORS = ["#54e98a", "#ffb961", "#9ec9ff", "#ffc1a6", "#c4b5fd", "#f0abfc"];
  let lastGroups = [];

  function parseNames(text) {
    return String(text || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  function shuffle(list) {
    const items = list.slice();
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  }

  function splitInto(names, groupCount) {
    const count = Math.max(1, Math.min(50, Math.floor(groupCount) || 1));
    const shuffled = shuffle(names);
    const groups = Array.from({ length: count }, () => []);
    shuffled.forEach((name, i) => {
      groups[i % count].push(name);
    });
    return groups;
  }

  function formatGroups(groups) {
    return groups
      .map((members, i) => `Group ${i + 1}\n${members.join("\n") || "(empty)"}`)
      .join("\n\n");
  }

  function renderCount() {
    const n = parseNames(document.getElementById("name-input").value).length;
    const pill = document.getElementById("name-count");
    if (pill) pill.textContent = `${n} name${n === 1 ? "" : "s"}`;
  }

  function renderGroups(groups) {
    const host = document.getElementById("split-results");
    lastGroups = groups;
    const copyAll = document.getElementById("copy-all-btn");
    if (!groups.length) {
      host.innerHTML = `<p class="muted">Set a group count and hit Split.</p>`;
      copyAll.disabled = true;
      return;
    }
    copyAll.disabled = false;
    host.innerHTML = groups
      .map((members, i) => {
        const color = GROUP_COLORS[i % GROUP_COLORS.length];
        const list = members.length
          ? members.map((name) => `<li>${name.replaceAll("<", "&lt;")}</li>`).join("")
          : `<li class="muted">(empty)</li>`;
        return `<div class="split-group">
          <div class="split-group-head">
            <strong style="color:${color}">Group ${i + 1}</strong>
            <span class="mono muted">${members.length}</span>
            <button class="btn-icon" data-copy="${i}" title="Copy group">
              <span class="material-symbols-outlined">content_copy</span>
            </button>
          </div>
          <ul>${list}</ul>
        </div>`;
      })
      .join("");
  }

  function runSplit() {
    const names = parseNames(document.getElementById("name-input").value);
    const countInput = document.getElementById("group-count");
    let count = Number(countInput.value);
    if (!Number.isFinite(count) || count < 1) count = 1;
    count = Math.min(50, Math.floor(count));
    countInput.value = String(count);
    if (!names.length) {
      renderGroups([]);
      document.getElementById("split-results").innerHTML = `<p class="tok-error">Paste at least one name.</p>`;
      return;
    }
    renderGroups(splitInto(names, count));
  }

  function init() {
    const input = document.getElementById("name-input");
    input?.addEventListener("input", renderCount);
    document.getElementById("split-btn")?.addEventListener("click", runSplit);
    document.getElementById("group-count")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") runSplit();
    });
    document.getElementById("copy-all-btn")?.addEventListener("click", async () => {
      if (!lastGroups.length) return;
      await Toolkino.copyText(formatGroups(lastGroups));
    });
    document.getElementById("split-results")?.addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-copy]");
      if (!btn) return;
      const group = lastGroups[Number(btn.dataset.copy)];
      if (!group) return;
      await Toolkino.copyText(group.join("\n"));
      btn.querySelector(".material-symbols-outlined").textContent = "check";
      setTimeout(() => {
        btn.querySelector(".material-symbols-outlined").textContent = "content_copy";
      }, 1000);
    });
    renderCount();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
