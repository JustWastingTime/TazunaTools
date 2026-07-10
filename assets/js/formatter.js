/** Event text → supporter.json event object */
(function () {
  const CHAIN_MARK = /^[（(]?[❯>]+[）)]?\s*$/;
  const CHOICE_MARK = /^[（(]?(Top|Bottom|Left|Right|Option\s*\d+|\d+)[）)]?\s*(.*)$/i;

  function isRewardLine(line) {
    return /(?:\+|-)\d+|hint|bond|energy|mood|skill points|event chain ended|fans/i.test(line);
  }

  function joinRewards(lines) {
    return lines
      .map((l) => l.trim())
      .filter(Boolean)
      .join(", ");
  }

  function detectType(lines) {
    if (lines.some((l) => CHAIN_MARK.test(l.trim()))) return "chain";
    return "event";
  }

  function parseSingleEvent(text) {
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length);

    if (!lines.length) return null;

    const type = detectType(lines);
    const body = lines.filter((l) => !CHAIN_MARK.test(l));

    // Choice-style: (Top) / (Bottom)
    const choiceIndexes = [];
    body.forEach((line, i) => {
      const m = line.match(CHOICE_MARK);
      if (m && (m[1] || /^(Top|Bottom|Left|Right)$/i.test(line.replace(/[()（）]/g, "")))) {
        choiceIndexes.push(i);
      }
    });

    if (choiceIndexes.length >= 2) {
      const nameParts = body.slice(0, choiceIndexes[0]);
      let name = nameParts.join(" ").trim();
      const results = [];
      for (let c = 0; c < choiceIndexes.length; c++) {
        const start = choiceIndexes[c];
        const end = c + 1 < choiceIndexes.length ? choiceIndexes[c + 1] : body.length;
        const header = body[start].match(CHOICE_MARK);
        const headerRest = (header?.[2] || "").trim();
        const rewardLines = body.slice(start + 1, end);
        if (headerRest && !isRewardLine(headerRest) && !name) {
          // title on first choice line
        }
        const rewards = [];
        if (headerRest && isRewardLine(headerRest)) rewards.push(headerRest);
        rewardLines.forEach((r) => rewards.push(r));
        results.push(joinRewards(rewards));
      }
      if (!name) {
        // Use text before rewards on first block if any non-choice title existed
        name = "Untitled Event";
      }
      return { name, type, results };
    }

    // Standard: title then reward lines
    let name = "";
    const rewards = [];
    for (const line of body) {
      if (!name && !isRewardLine(line)) {
        name = line.replace(/^[（(]?[❯>]+[）)]?\s*/, "").trim();
        continue;
      }
      if (!name) {
        name = line;
        continue;
      }
      rewards.push(line);
    }

    if (!name) return null;
    return {
      name,
      type,
      results: [joinRewards(rewards) || ""],
    };
  }

  function parseEvents(input) {
    const raw = String(input || "").trim();
    if (!raw) return [];

    // Split on blank lines or new chain markers
    const chunks = [];
    let current = [];
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) {
        if (current.length) {
          chunks.push(current.join("\n"));
          current = [];
        }
        continue;
      }
      if (CHAIN_MARK.test(trimmed) && current.length) {
        chunks.push(current.join("\n"));
        current = [trimmed];
        continue;
      }
      current.push(trimmed);
    }
    if (current.length) chunks.push(current.join("\n"));

    return chunks.map(parseSingleEvent).filter(Boolean);
  }

  function init() {
    const input = document.getElementById("event-input");
    const output = document.getElementById("json-output");
    const pill = document.getElementById("validation-pill");
    const formatBtn = document.getElementById("format-btn");
    const clearBtn = document.getElementById("clear-btn");
    const copyBtn = document.getElementById("copy-btn");
    const downloadBtn = document.getElementById("download-btn");

    let lastJson = "";

    function run() {
      const events = parseEvents(input.value);
      if (!events.length) {
        output.innerHTML = `<span class="tok-error">Error: could not parse event text.</span>`;
        pill?.classList.add("hidden");
        downloadBtn && (downloadBtn.disabled = true);
        lastJson = "";
        return;
      }
      const payload = events.length === 1 ? events[0] : events;
      lastJson = JSON.stringify(payload, null, 2);
      output.innerHTML = Toolkino.highlightJson(lastJson);
      pill?.classList.remove("hidden");
      downloadBtn && (downloadBtn.disabled = false);
    }

    formatBtn?.addEventListener("click", run);
    clearBtn?.addEventListener("click", () => {
      input.value = "";
      output.innerHTML = `<span class="muted">// Awaiting input...</span>`;
      pill?.classList.add("hidden");
      downloadBtn && (downloadBtn.disabled = true);
      lastJson = "";
    });
    copyBtn?.addEventListener("click", async () => {
      if (!lastJson) return;
      await Toolkino.copyText(lastJson);
      copyBtn.querySelector(".material-symbols-outlined").textContent = "check";
      setTimeout(() => {
        copyBtn.querySelector(".material-symbols-outlined").textContent = "content_copy";
      }, 1200);
    });
    downloadBtn?.addEventListener("click", () => {
      if (!lastJson) return;
      Toolkino.downloadText("event.json", lastJson);
    });
    input?.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") run();
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
