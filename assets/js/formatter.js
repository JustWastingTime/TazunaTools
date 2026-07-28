/** Event text → supporter.json event object */
(function () {
  const CHAIN_MARK = /^[（(]?[❯>]+[）)]?\s*$/;
  // Bare choice labels: Top / Bottom / Bot / Middle / Mid / Left / Right
  const CHOICE_MARK = /^(?:[（(])?(Top|Bottom|Bot|Middle|Mid|Left|Right|Option\s*\d+)(?:[）)])?$/i;
  const RANDOM_EITHER = /^randomly\s+either$/i;
  const OR_SEP = /^or$/i;

  function isRewardLine(line) {
    return /(?:\+|-)\d+|hint|bond|energy|mood|skill points|event chain ended|fans/i.test(line);
  }

  function isChoiceLabel(line) {
    return CHOICE_MARK.test(String(line || "").trim());
  }

  function isRandomEither(line) {
    return RANDOM_EITHER.test(String(line || "").trim());
  }

  function isOrSeparator(line) {
    return OR_SEP.test(String(line || "").trim());
  }

  function isStructureLine(line) {
    const t = String(line || "").trim();
    return isChoiceLabel(t) || isRandomEither(t) || isOrSeparator(t) || CHAIN_MARK.test(t);
  }

  /** "Biwa Hayahide bond +5" → "Bond +5" */
  function normalizeReward(line) {
    let text = String(line || "").trim();
    if (!text) return "";

    const namedBond = text.match(/^(.+?)\s+bond\s*([+-]?\d+)\s*$/i);
    if (namedBond) {
      const delta = namedBond[2].startsWith("+") || namedBond[2].startsWith("-")
        ? namedBond[2]
        : `+${namedBond[2]}`;
      return `Bond ${delta}`;
    }

    const bareBond = text.match(/^bond\s*([+-]?\d+)\s*$/i);
    if (bareBond) {
      const delta = bareBond[1].startsWith("+") || bareBond[1].startsWith("-")
        ? bareBond[1]
        : `+${bareBond[1]}`;
      return `Bond ${delta}`;
    }

    return text;
  }

  function isBondReward(text) {
    return /^Bond\s*[+-]?\d+/i.test(text);
  }

  function isHintReward(text) {
    return /\bhint\b/i.test(text);
  }

  /**
   * Join a single reward branch.
   * Preserve order, but if Bond and hint both appear, emit all Bonds before all hints
   * at the first bond/hint position (so "Event chain ended" stays after).
   */
  function joinBranch(lines) {
    const normalized = lines.map(normalizeReward).filter(Boolean);
    if (!normalized.length) return "";

    const bonds = normalized.filter(isBondReward);
    const hints = normalized.filter(isHintReward);
    if (!bonds.length || !hints.length) {
      return normalized.join(", ");
    }

    const out = [];
    let emittedBondHint = false;
    for (const item of normalized) {
      if (isBondReward(item) || isHintReward(item)) {
        if (!emittedBondHint) {
          out.push(...bonds, ...hints);
          emittedBondHint = true;
        }
        continue;
      }
      out.push(item);
    }
    return out.join(", ");
  }

  /**
   * Format reward lines. "Randomly either" / "or" become a single string with ", OR ".
   */
  function joinRewards(lines) {
    const cleaned = lines
      .map((l) => String(l || "").trim())
      .filter((l) => l && !isChoiceLabel(l));

    const hasRandom = cleaned.some(isRandomEither);
    const orIndexes = [];
    cleaned.forEach((line, i) => {
      if (isOrSeparator(line)) orIndexes.push(i);
    });

    if (hasRandom || orIndexes.length) {
      // Drop "Randomly either"; split on bare "or"
      const withoutHeader = cleaned.filter((l) => !isRandomEither(l));
      const branches = [];
      let current = [];
      for (const line of withoutHeader) {
        if (isOrSeparator(line)) {
          branches.push(current);
          current = [];
          continue;
        }
        current.push(line);
      }
      branches.push(current);

      return branches
        .map(joinBranch)
        .filter(Boolean)
        .join(", OR ");
    }

    return joinBranch(cleaned);
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

    const choiceIndexes = [];
    body.forEach((line, i) => {
      if (isChoiceLabel(line)) choiceIndexes.push(i);
    });

    if (choiceIndexes.length >= 1) {
      const nameParts = body.slice(0, choiceIndexes[0]).filter((l) => !isStructureLine(l));
      let name = nameParts.join(" ").trim();
      const results = [];

      for (let c = 0; c < choiceIndexes.length; c++) {
        const start = choiceIndexes[c];
        const end = c + 1 < choiceIndexes.length ? choiceIndexes[c + 1] : body.length;
        const rewardLines = body.slice(start + 1, end);
        results.push(joinRewards(rewardLines));
      }

      if (!name) name = "Untitled Event";
      return { name, type, results: results.filter((r) => r.length) };
    }

    // Standard: title then reward lines
    let name = "";
    const rewards = [];
    for (const line of body) {
      if (isStructureLine(line) && !isRandomEither(line) && !isOrSeparator(line)) continue;
      if (!name && !isRewardLine(line) && !isRandomEither(line) && !isOrSeparator(line)) {
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
