/** Condition code → English converter */
(function () {
  let RULES = null;
  let FIELD_RANK = new Map();

  const OP_RE = /(>=|<=|==|!=|>|<)/;
  const CM_FIELD = 9;
  const TT_FIELD = 12;

  function normalizeOps(text) {
    return String(text || "")
      .replace(/≥/g, ">=")
      .replace(/≤/g, "<=")
      .replace(/\r/g, "");
  }

  function splitTopLevel(expr, joinerChars) {
    const parts = [];
    let buf = "";
    let depth = 0;
    for (let i = 0; i < expr.length; i++) {
      const ch = expr[i];
      if (ch === "(") depth++;
      if (ch === ")") depth = Math.max(0, depth - 1);
      if (depth === 0 && joinerChars.includes(ch)) {
        if (buf.trim()) parts.push({ text: buf.trim(), joiner: ch });
        buf = "";
        continue;
      }
      buf += ch;
    }
    if (buf.trim()) parts.push({ text: buf.trim(), joiner: null });
    return parts;
  }

  function stripParens(s) {
    let t = s.trim();
    while (t.startsWith("(") && t.endsWith(")")) {
      let depth = 0;
      let balanced = true;
      for (let i = 0; i < t.length; i++) {
        if (t[i] === "(") depth++;
        if (t[i] === ")") depth--;
        if (depth === 0 && i < t.length - 1) {
          balanced = false;
          break;
        }
      }
      if (!balanced || depth !== 0) break;
      t = t.slice(1, -1).trim();
    }
    return t;
  }

  function fieldRank(field) {
    if (!field) return 9000;
    if (FIELD_RANK.has(field)) return FIELD_RANK.get(field);
    return 8000;
  }

  function phaseLabel(value) {
    const map = RULES.fields.phase.values;
    return map[String(value)] || `phase ${value}`;
  }

  function ordinal(n) {
    const num = Number(n);
    const v = num % 100;
    if (v >= 11 && v <= 13) return `${num}th`;
    switch (num % 10) {
      case 1: return `${num}st`;
      case 2: return `${num}nd`;
      case 3: return `${num}rd`;
      default: return `${num}th`;
    }
  }

  function positionRange(op, value, fieldSize) {
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    let start;
    let end;
    if (op === ">=") {
      start = n;
      end = fieldSize;
    } else if (op === ">") {
      start = n + 1;
      end = fieldSize;
    } else if (op === "<=") {
      start = 1;
      end = n;
    } else if (op === "<") {
      start = 1;
      end = n - 1;
    } else if (op === "==") {
      return ordinal(n);
    } else {
      return null;
    }
    start = Math.max(1, Math.min(fieldSize, start));
    end = Math.max(1, Math.min(fieldSize, end));
    if (start > end) return null;
    if (start === end) return ordinal(start);
    return `${ordinal(start)} to ${ordinal(end)}`;
  }

  function extractPlacementHints(raw) {
    const text = normalizeOps(raw);
    const patterns = [
      {
        re: /\(\s*CM\s*(>=|<=|==|!=|>|<)\s*(-?\d+)\s*\|\s*(?:LoH|LOH|TT)\s*(>=|<=|==|!=|>|<)\s*(-?\d+)\s*\)/gi,
        map: (cmOp, cmVal, ttOp, ttVal) => ({
          cm: { op: cmOp, value: Number(cmVal) },
          tt: { op: ttOp, value: Number(ttVal) },
        }),
      },
      {
        re: /\(\s*(?:LoH|LOH|TT)\s*(>=|<=|==|!=|>|<)\s*(-?\d+)\s*\|\s*CM\s*(>=|<=|==|!=|>|<)\s*(-?\d+)\s*\)/gi,
        map: (ttOp, ttVal, cmOp, cmVal) => ({
          cm: { op: cmOp, value: Number(cmVal) },
          tt: { op: ttOp, value: Number(ttVal) },
        }),
      },
    ];

    let hints = null;
    let cleaned = text;
    for (const { re, map } of patterns) {
      cleaned = cleaned.replace(re, (...args) => {
        hints = map(args[1], args[2], args[3], args[4]);
        return "";
      });
      if (hints) break;
    }
    return { hints, cleaned };
  }

  function formatPlacementHint(hints) {
    if (!hints?.cm || !hints?.tt) return null;
    const cm = positionRange(hints.cm.op, hints.cm.value, CM_FIELD);
    const tt = positionRange(hints.tt.op, hints.tt.value, TT_FIELD);
    if (!cm || !tt) return null;
    return `${cm} (CM), ${tt} (TT)`;
  }

  function formatField(field, op, value, placementHints) {
    const def = RULES.fields[field];
    if (!def) return `${field} ${op} ${value}`;

    if (def.special === "order_rate" || field === "order") {
      if (placementHints) {
        const fromHint = formatPlacementHint(placementHints);
        if (fromHint) return fromHint;
      }
      if (def.special === "order_rate") {
        const note = RULES.order_rate_notes?.[op]?.[String(value)];
        if (note) return note;
        const rate = Number(value);
        if (Number.isFinite(rate)) {
          const cmThreshold = Math.max(1, Math.ceil((rate / 100) * CM_FIELD));
          const ttThreshold = Math.max(1, Math.ceil((rate / 100) * TT_FIELD));
          const derived = formatPlacementHint({
            cm: { op, value: cmThreshold },
            tt: { op, value: ttThreshold },
          });
          if (derived) return derived;
        }
        return `Order rate ${op} ${value}`;
      }
    }

    if (def.ops && typeof def.ops[op] === "object" && def.ops[op][String(value)] != null) {
      return def.ops[op][String(value)];
    }

    if (field === "phase") {
      if (op === ">=") return `${phaseLabel(value)} and beyond`;
      if (op === "<=" && String(value) === "1") return "Early race or mid race";
      if (op === "<=") return `Up to ${phaseLabel(value)}`;
      if (op === "==") return phaseLabel(value);
      if (op === "!=") return `Not ${phaseLabel(value)}`;
    }

    if (def.ops && typeof def.ops[op] === "string") {
      return def.ops[op]
        .replaceAll("{value}", value)
        .replaceAll("{op}", op)
        .replaceAll("{prev}", String(Number(value) - 1))
        .replaceAll("{inv}", String(100 - Number(value)));
    }

    if (def.values && def.values[String(value)] != null && (op === "==" || op == null)) {
      return def.values[String(value)];
    }

    if (def.values && def.values[String(value)] != null && op === "!=") {
      return `Not ${def.values[String(value)]}`;
    }

    if (def.label) {
      return def.label
        .replaceAll("{value}", value)
        .replaceAll("{op}", op)
        .replaceAll("{prev}", String(Number(value) - 1))
        .replaceAll("{inv}", String(100 - Number(value)));
    }

    if (def.bare && (value == null || value === "" || value === "1")) return def.bare;

    return `${field} ${op} ${value}`;
  }

  function parseAtomRaw(raw) {
    const text = stripParens(raw);
    if (!text) return null;

    if (!OP_RE.test(text) && RULES.fields[text]) {
      return { field: text, op: null, value: null, raw: text };
    }

    const m = text.match(/^([a-zA-Z0-9_]+)\s*(>=|<=|==|!=|>|<)\s*(-?\d+(?:\.\d+)?)$/);
    if (!m) return { field: null, op: null, value: null, raw: text };
    return { field: m[1], op: m[2], value: m[3], raw: text };
  }

  function entryFromAtom(raw, placementHints) {
    const parsed = parseAtomRaw(raw);
    if (!parsed) return null;
    const text =
      parsed.field != null
        ? formatField(parsed.field, parsed.op, parsed.value, placementHints)
        : parsed.raw;
    if (!text) return null;
    return {
      field: parsed.field,
      text,
      rank: fieldRank(parsed.field),
    };
  }

  function tryCompounds(atoms) {
    for (const compound of RULES.compounds || []) {
      const needed = compound.match.map((x) => x.replace(/\s+/g, ""));
      const normalized = atoms.map((a) => a.replace(/\s+/g, ""));
      if (needed.every((n) => normalized.includes(n))) {
        return compound;
      }
    }
    return null;
  }

  function translateExpr(expr, placementHints) {
    const cleaned = stripParens(
      normalizeOps(expr).replace(/\n+/g, "&").replace(/\s+/g, "").replace(/&+/g, "&")
    );
    if (!cleaned) return [];

    const andParts = splitTopLevel(cleaned, ["&"]);
    const flatAtoms = andParts.map((p) => stripParens(p.text));
    const hasOr = flatAtoms.some((a) => a.includes("@") || a.includes("|") || a.includes("("));

    if (!hasOr) {
      const compound = tryCompounds(flatAtoms);
      if (compound && flatAtoms.length === 2) {
        return [
          {
            field: "is_finalcorner",
            text: compound.text,
            rank: fieldRank("is_finalcorner"),
          },
        ];
      }
    }

    const entries = [];
    for (const part of andParts) {
      const chunk = stripParens(part.text);
      if (chunk.includes("@") || chunk.includes("|") || (chunk.includes("(") && chunk.includes(")"))) {
        const orParts = splitTopLevel(chunk, ["@", "|"]);
        if (orParts.length > 1) {
          const parsed = orParts.map((p) => entryFromAtom(p.text, placementHints)).filter(Boolean);
          if (!parsed.length) continue;
          const rank = Math.min(...parsed.map((p) => p.rank));
          entries.push({
            field: parsed[0].field,
            text: parsed.map((p) => p.text).join(" OR "),
            rank,
          });
          continue;
        }
      }
      const entry = entryFromAtom(chunk, placementHints);
      if (entry) entries.push(entry);
    }

    // Upgrade final corner compounds when both present as separate lines
    const idxFinal = entries.findIndex((e) => e.text === "Final corner and beyond");
    const idxCorner = entries.findIndex((e) => e.text === "Any corner" || e.text === "Not a corner");
    if (idxFinal >= 0 && idxCorner >= 0) {
      const cornerLine = entries[idxCorner].text;
      entries[idxFinal].text = cornerLine === "Not a corner" ? "Final non-corner" : "Final corner";
      entries[idxFinal].field = "is_finalcorner";
      entries[idxFinal].rank = fieldRank("is_finalcorner");
      entries.splice(idxCorner, 1);
    }

    return entries;
  }

  function sortEntries(entries) {
    return [...entries].sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      return String(a.text).localeCompare(String(b.text));
    });
  }

  function formatOutput(entries) {
    const lines = sortEntries(entries).map((e) => e.text).filter(Boolean);
    if (!lines.length) return { lines: [], text: "" };
    // skill.json style: quoted strings with trailing commas
    const text = lines.map((l) => `${JSON.stringify(l)},`).join("\n");
    return { lines, text };
  }

  function convert(input) {
    const { hints, cleaned: rawWithoutHints } = extractPlacementHints(input);
    const code = normalizeOps(rawWithoutHints)
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .join("\n");

    const blocks = code.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
    if (blocks.length <= 1) {
      const joined = code.replace(/\n/g, "&").replace(/&+/g, "&");
      return formatOutput(translateExpr(joined, hints));
    }

    const allEntries = [];
    blocks.forEach((block) => {
      allEntries.push(...translateExpr(block.replace(/\n/g, "&").replace(/&+/g, "&"), hints));
    });
    return formatOutput(allEntries);
  }

  async function init() {
    RULES = await Toolkino.loadJson("conditions.json");
    FIELD_RANK = new Map((RULES.fieldOrder || []).map((name, i) => [name, i]));

    const input = document.getElementById("condition-input");
    const output = document.getElementById("condition-output");
    const convertBtn = document.getElementById("convert-btn");
    const clearBtn = document.getElementById("clear-btn");
    const copyBtn = document.getElementById("copy-btn");

    function run() {
      const result = convert(input.value);
      if (!input.value.trim()) {
        output.innerHTML = `<span class="muted">// Awaiting input...</span>`;
        return;
      }
      output.textContent = result.text || "No conditions parsed.";
    }

    convertBtn?.addEventListener("click", run);
    clearBtn?.addEventListener("click", () => {
      input.value = "";
      output.innerHTML = `<span class="muted">// Awaiting input...</span>`;
    });
    copyBtn?.addEventListener("click", async () => {
      const text = output.textContent;
      if (!text || text.includes("Awaiting")) return;
      await Toolkino.copyText(text);
      copyBtn.querySelector(".material-symbols-outlined").textContent = "check";
      setTimeout(() => {
        copyBtn.querySelector(".material-symbols-outlined").textContent = "content_copy";
      }, 1200);
    });

    input?.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") run();
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
