/** Skill visualizer page logic */
(function () {
  const LIST_LIMIT = 80;
  const TYPE_KEYS = ["accel", "velocity", "recovery", "speed", "stamina", "power", "guts", "gate"];

  const state = {
    maps: [],
    cms: [],
    skills: [],
    selectedCm: null,
    selectedMap: null,
    selectedSkill: null,
    query: "",
    highlight: 0,
    listOpen: false,
  };

  function mapById(id) {
    if (!id) return null;
    return state.maps.find(
      (m) => m.name === id || m.id === id || m.slug === id || `${m.racetrack} ${m.distance_meters}` === id
    );
  }

  function fillSelect(el, options, selected) {
    el.innerHTML = options
      .map(
        ([value, label]) =>
          `<option value="${String(value).replaceAll('"', "&quot;")}"${value === selected ? " selected" : ""}>${label}</option>`
      )
      .join("");
  }

  function extractUnixTimestamps(value) {
    const list = [];
    for (const m of String(value ?? "").matchAll(/<t:(\d+):/g)) {
      const n = Number(m[1]);
      if (Number.isFinite(n)) list.push(n);
    }
    return list;
  }

  function pickDefaultCm(cms, nowSec = Math.floor(Date.now() / 1000)) {
    if (!Array.isArray(cms) || !cms.length) return null;
    const dated = cms
      .map((cm) => {
        const stamps = extractUnixTimestamps(cm.date);
        if (!stamps.length) return null;
        return { cm, start: Math.min(...stamps), end: Math.max(...stamps) };
      })
      .filter(Boolean)
      .sort((a, b) => a.start - b.start);

    const running = dated.find((item) => item.start <= nowSec && nowSec <= item.end);
    if (running) return running.cm;
    const upcoming = dated.find((item) => item.start >= nowSec);
    if (upcoming) return upcoming.cm;
    if (dated.length) {
      const last = dated[dated.length - 1].cm;
      const next = cms.find((cm) => Number(cm.number) === Number(last.number) + 1);
      return next || last;
    }
    return cms[cms.length - 1];
  }

  function currentTrackMeta() {
    if (state.selectedCm?.track) return state.selectedCm.track;
    const map = state.selectedMap;
    if (!map) return null;
    return {
      racetrack: map.racetrack,
      terrain: map.terrain,
      distance_type: map.distance_type,
      distance_meters: map.distance_meters,
      direction: map.direction,
      ground: map.ground,
      season: map.season,
      weather: map.weather,
    };
  }

  function checkedFilters(kind) {
    return [...document.querySelectorAll(`#skill-filters input[data-filter="${kind}"]:checked`)].map((el) => el.value);
  }

  function skillType(skill) {
    const cat = String(skill.category || "").toLowerCase();
    return TYPE_KEYS.find((key) => cat.includes(key)) || "other";
  }

  function skillMatches(skill) {
    if (!skill?.skill_name) return false;
    const rarities = checkedFilters("rarity");
    const types = checkedFilters("type");
    if (rarities.length && !rarities.includes(String(skill.rarity || "").toLowerCase())) return false;
    if (types.length && !types.includes(skillType(skill))) return false;

    const q = state.query.trim().toLowerCase();
    if (!q) return true;
    const hay = [
      skill.skill_name,
      skill.category,
      skill.rarity,
      ...(skill.aliases || []),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  }

  function filteredSkills() {
    return state.skills.filter(skillMatches).sort((a, b) => a.skill_name.localeCompare(b.skill_name));
  }

  function typeLabel(skill) {
    const rarity = skill.rarity || "";
    const type = skillType(skill);
    return [rarity, type].filter(Boolean).join(" · ");
  }

  function renderComboList() {
    const list = document.getElementById("skill-combo-list");
    if (!list) return;
    const matches = filteredSkills();
    const shown = matches.slice(0, LIST_LIMIT);
    if (!shown.length) {
      list.innerHTML = `<div class="skill-combo-empty">No skills match those filters.</div>`;
      return;
    }
    if (state.highlight >= shown.length) state.highlight = 0;
    list.innerHTML =
      shown
        .map((skill, i) => {
          const active = i === state.highlight ? " active" : "";
          const selected = skill.skill_name === state.selectedSkill?.skill_name ? " aria-selected=\"true\"" : "";
          return `<div class="skill-combo-item${active}" role="option"${selected} data-name="${String(skill.skill_name).replaceAll('"', "&quot;")}">
            <span>${skill.skill_name}</span>
            <span class="meta">${typeLabel(skill)}</span>
          </div>`;
        })
        .join("") +
      (matches.length > LIST_LIMIT
        ? `<div class="skill-combo-more">${matches.length - LIST_LIMIT} more — keep typing to narrow</div>`
        : "");
  }

  function openCombo() {
    const list = document.getElementById("skill-combo-list");
    state.listOpen = true;
    list?.classList.remove("hidden");
    renderComboList();
  }

  function closeCombo() {
    document.getElementById("skill-combo-list")?.classList.add("hidden");
    state.listOpen = false;
  }

  function renderSkillCard(skill) {
    const card = document.getElementById("skill-card");
    if (!skill) {
      card.innerHTML = `<p class="muted">Select a skill or apply an activation trigger to inspect.</p>`;
      return;
    }
    const pre = (skill.preconditions || []).map((c) => `<li>${c}</li>`).join("") || "<li>None</li>";
    const effects = (skill.effect || [])
      .map((branch, i) => {
        const conds = (branch.conditions || []).map((c) => `<li>${c}</li>`).join("") || "<li>—</li>";
        return `<div class="effect-branch">
          <h4>Branch ${i + 1}</h4>
          <p>${branch.description || ""}</p>
          ${branch.inherited ? `<p class="muted mono">Inherited: ${branch.inherited}</p>` : ""}
          <ul>${conds}</ul>
        </div>`;
      })
      .join("");
    card.innerHTML = `
      <div class="skill-card-head">
        <h3>${skill.skill_name || skill.name || "Unnamed skill"}</h3>
        <span class="pill">${skill.category || "skill"}</span>
      </div>
      <p>${skill.description || ""}</p>
      <h4 class="label-caps">Preconditions</h4>
      <ul>${pre}</ul>
      <h4 class="label-caps">Effects</h4>
      ${effects}
      <pre class="mono raw-json">${JSON.stringify(skill.activation_map || {}, null, 2)}</pre>`;
  }

  function renderMap() {
    const host = document.getElementById("map-host");
    const meta = document.getElementById("map-meta");
    const map = CourseMap.normalizeMap(state.selectedMap);
    if (!map) {
      host.innerHTML = `<p class="muted">No map selected.</p>`;
      return;
    }

    const track = currentTrackMeta();
    const skill = state.selectedSkill;
    let warning = "";
    let markers = [];
    if (skill) {
      const overlay = CourseMap.resolveSkillActivationOverlay(skill, { track }, map);
      if (overlay.doesNotWork) {
        warning = `May not work: ${overlay.reasons[0] || "track mismatch"}`;
      } else if (overlay.shouldShowChart) {
        markers = overlay.markers;
      } else if (skill.activation_map?.show_chart === false) {
        warning = "This skill has no course activation window";
      }
    }

    try {
      host.innerHTML = CourseMap.buildSvg(map, {
        width: Math.min(1500, Math.max(900, host.clientWidth || 1000)),
        skillMarkers: markers,
        warningText: warning,
      });
    } catch (err) {
      host.innerHTML = `<p class="tok-error">${err.message}</p>`;
    }

    const chips = [
      map.distance_meters || `${CourseMap.parseLength(map)}m`,
      map.direction || track?.direction,
      map.terrain || track?.terrain,
    ].filter(Boolean);
    meta.innerHTML = chips.map((c) => `<span class="pill">${c}</span>`).join("");
    document.getElementById("map-title").textContent = map.name || "Course map";
  }

  function selectCm(numberOrName) {
    const cm =
      state.cms.find((c) => String(c.number) === String(numberOrName) || c.name === numberOrName) ||
      pickDefaultCm(state.cms);
    state.selectedCm = cm || null;
    if (cm?.map_id) {
      const mapped = mapById(cm.map_id);
      if (mapped) state.selectedMap = mapped;
    }
    const mapSelect = document.getElementById("map-select");
    if (mapSelect && state.selectedMap) mapSelect.value = state.selectedMap.name;
    const cmSelect = document.getElementById("cm-select");
    if (cmSelect && cm) cmSelect.value = cm.number;
    renderMap();
  }

  function selectSkill(skill, options = {}) {
    state.selectedSkill = skill || null;
    const search = document.getElementById("skill-search");
    if (search && skill?.skill_name) search.value = skill.skill_name;
    closeCombo();
    renderSkillCard(skill);
    renderMap();
    if (!options.fromTester && skill?.activation_map?.triggers) {
      setTesterTriggers(skill.activation_map.triggers, { apply: false });
    }
  }

  function selectSkillByName(name) {
    const skill = state.skills.find((s) => s.skill_name === name);
    selectSkill(skill || null);
  }

  const MATCH_OPTIONS = ["corner", "not_a_corner", "straight", "uphill", "downhill", "mid"];
  const PHASE_OPTIONS = [
    ["", "None"],
    ["early", "Early"],
    ["mid", "Mid"],
    ["late", "Late"],
    ["spurt", "Spurt"],
    ["first_half", "First half"],
    ["second_half", "Second half"],
    ["late_and_beyond", "Late and beyond"],
    ["final_corner_and_beyond", "Final corner and beyond"],
    ["final_corner_and_beyond,late_and_beyond", "Final corner and late and beyond"],
  ];
  const TRIGGER_KEY_ORDER = [
    "type",
    "phase",
    "target",
    "match",
    "select",
    "exclude_select",
    "labels",
    "corner_numbers",
    "require_tags",
    "clip_within_segment_start_ratio",
    "clip_within_segment_end_ratio",
    "clip_start_ratio",
    "clip_end_ratio",
    "clip_start",
    "clip_end",
    "remaining_gte",
    "remaining_lte",
    "remaining_start",
    "remaining_end",
    "start",
    "end",
    "distance_mode",
    "distance",
    "value",
    "line_position",
    "trigger_behavior",
    "disable_auto_phase_clip",
    "color",
  ];
  const DEFAULT_TRIGGER = {
    type: "box",
    phase: "late_and_beyond",
    target: "layout",
    match: "corner",
    select: "last",
    clip_within_segment_start_ratio: 0.5,
    trigger_behavior: "asap",
  };

  function optionHtml(value, label, selected) {
    const sel = String(selected) === String(value) ? " selected" : "";
    return `<option value="${String(value).replaceAll('"', "&quot;")}"${sel}>${label}</option>`;
  }

  function phaseSelectValue(phase) {
    if (Array.isArray(phase)) return phase.join(",");
    return phase == null ? "" : String(phase);
  }

  function encodePhase(value) {
    if (!value) return undefined;
    if (value.includes(",")) return value.split(",").map((v) => v.trim()).filter(Boolean);
    return value;
  }

  function parseList(value, numeric) {
    if (Array.isArray(value)) {
      return value.map((v) => (numeric ? Number(v) : String(v))).filter((v) => (numeric ? Number.isFinite(v) : v));
    }
    const parts = String(value || "")
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
    if (!parts.length) return undefined;
    if (!numeric) return parts;
    const nums = parts.map(Number).filter(Number.isFinite);
    return nums.length ? nums : undefined;
  }

  function triggerField(id, label, control, attrs = "") {
    return `<label class="trigger-field${attrs ? ` ${attrs}` : ""}" for="${id}">
      <span>${label}</span>
      ${control}
    </label>`;
  }

  function triggerCardHtml(index, trigger = {}) {
    const id = (key) => `trig-${index}-${key}`;
    const type = trigger.type === "line" ? "line" : "box";
    const matchKnown = MATCH_OPTIONS.includes(String(trigger.match || ""));
    const matchValue = trigger.match ? (matchKnown ? trigger.match : "__custom__") : "";
    const phaseValue = phaseSelectValue(trigger.phase ?? trigger.phases);
    const knownPhase = PHASE_OPTIONS.some(([v]) => v === phaseValue);
    const phaseSelect = knownPhase ? phaseValue : phaseValue ? "__custom__" : "";
    const advancedOpen =
      Boolean(
        trigger.exclude_select ||
          trigger.labels?.length ||
          trigger.corner_numbers?.length ||
          trigger.require_tags?.length ||
          trigger.clip_start_ratio != null ||
          trigger.clip_end_ratio != null ||
          trigger.clip_start != null ||
          trigger.clip_end != null ||
          trigger.start != null ||
          trigger.end != null ||
          trigger.remaining_start != null ||
          trigger.remaining_end != null ||
          trigger.remaining_gte != null ||
          trigger.remaining_lte != null ||
          trigger.distance_mode ||
          trigger.color ||
          trigger.disable_auto_phase_clip
      );
    const num = (key) => (trigger[key] == null || trigger[key] === "" ? "" : trigger[key]);
    const list = (key) => (Array.isArray(trigger[key]) ? trigger[key].join(", ") : trigger[key] || "");

    return `<article class="trigger-card" data-trigger-card>
      <div class="trigger-card-head">
        <h4>Trigger ${index + 1}</h4>
        <button type="button" class="btn btn-ghost tester-remove" data-remove-trigger>Remove</button>
      </div>
      <div class="trigger-form">
        ${triggerField(
          id("type"),
          "Type",
          `<select class="select" id="${id("type")}" data-field="type">
            ${optionHtml("box", "Box", type)}
            ${optionHtml("line", "Line", type)}
          </select>`
        )}
        ${triggerField(
          id("trigger_behavior"),
          "Behavior",
          `<select class="select" id="${id("trigger_behavior")}" data-field="trigger_behavior" data-for="box">
            ${optionHtml("", "None", trigger.trigger_behavior ?? "")}
            ${optionHtml("asap", "ASAP", trigger.trigger_behavior)}
            ${optionHtml("random", "Random", trigger.trigger_behavior)}
            ${optionHtml("precondition", "Precondition", trigger.trigger_behavior)}
          </select>`,
          "js-for-box"
        )}
        ${triggerField(
          id("phase"),
          "Phase",
          `<select class="select" id="${id("phase")}" data-field="phase">
            ${PHASE_OPTIONS.map(([v, l]) => optionHtml(v, l, phaseSelect)).join("")}
            ${optionHtml("__custom__", "Custom…", phaseSelect)}
          </select>`
        )}
        ${triggerField(
          id("phase_custom"),
          "Custom phase",
          `<input class="field" id="${id("phase_custom")}" data-field="phase_custom" value="${String(knownPhase ? "" : phaseValue).replaceAll('"', "&quot;")}" placeholder="late_and_beyond" />`,
          "js-phase-custom"
        )}
        ${triggerField(
          id("target"),
          "Target",
          `<select class="select" id="${id("target")}" data-field="target">
            ${optionHtml("", "None", trigger.target ?? "")}
            ${optionHtml("layout", "Layout", trigger.target)}
            ${optionHtml("zones", "Zones", trigger.target)}
            ${optionHtml("elevation", "Elevation", trigger.target)}
          </select>`
        )}
        ${triggerField(
          id("match"),
          "Match",
          `<select class="select" id="${id("match")}" data-field="match">
            ${optionHtml("", "None", matchValue)}
            ${MATCH_OPTIONS.map((v) => optionHtml(v, v.replaceAll("_", " "), matchValue)).join("")}
            ${optionHtml("__custom__", "Custom…", matchValue)}
          </select>`
        )}
        ${triggerField(
          id("match_custom"),
          "Custom match",
          `<input class="field" id="${id("match_custom")}" data-field="match_custom" value="${matchKnown ? "" : String(trigger.match || "").replaceAll('"', "&quot;")}" placeholder="opening leg" />`,
          "js-match-custom"
        )}
        ${triggerField(
          id("select"),
          "Select",
          `<select class="select" id="${id("select")}" data-field="select">
            ${optionHtml("", "All matches", trigger.select ?? "")}
            ${optionHtml("first", "First", trigger.select)}
            ${optionHtml("last", "Last", trigger.select)}
          </select>`
        )}
        ${triggerField(
          id("clip_within_segment_start_ratio"),
          "Segment start ratio",
          `<input class="field" id="${id("clip_within_segment_start_ratio")}" data-field="clip_within_segment_start_ratio" type="number" inputmode="decimal" min="0" max="1" step="0.05" value="${num("clip_within_segment_start_ratio")}" placeholder="0–1" />`,
          "js-for-box"
        )}
        ${triggerField(
          id("clip_within_segment_end_ratio"),
          "Segment end ratio",
          `<input class="field" id="${id("clip_within_segment_end_ratio")}" data-field="clip_within_segment_end_ratio" type="number" inputmode="decimal" min="0" max="1" step="0.05" value="${num("clip_within_segment_end_ratio")}" placeholder="0–1" />`,
          "js-for-box"
        )}
        ${triggerField(
          id("distance"),
          "Distance (m)",
          `<input class="field" id="${id("distance")}" data-field="distance" type="number" inputmode="decimal" value="${num("distance")}" placeholder="absolute meters" />`,
          "js-for-line"
        )}
        ${triggerField(
          id("value"),
          "Remaining (m)",
          `<input class="field" id="${id("value")}" data-field="value" type="number" inputmode="decimal" value="${num("value")}" placeholder="meters remaining" />`,
          "js-for-line"
        )}
        ${triggerField(
          id("distance_mode"),
          "Distance mode",
          `<select class="select" id="${id("distance_mode")}" data-field="distance_mode">
            ${optionHtml("", "None", trigger.distance_mode ?? "")}
            ${optionHtml("absolute", "Absolute", trigger.distance_mode)}
            ${optionHtml("remaining", "Remaining", trigger.distance_mode)}
          </select>`,
          "js-for-line"
        )}
        ${triggerField(
          id("line_position"),
          "Line position",
          `<select class="select" id="${id("line_position")}" data-field="line_position">
            ${optionHtml("", "Default", trigger.line_position ?? "")}
            ${optionHtml("start", "Start", trigger.line_position)}
            ${optionHtml("end", "End", trigger.line_position)}
          </select>`,
          "js-for-line"
        )}
        <details class="trigger-advanced"${advancedOpen ? " open" : ""}>
          <summary>More fields</summary>
          <div class="trigger-advanced-grid">
            ${triggerField(
              id("exclude_select"),
              "Exclude",
              `<select class="select" id="${id("exclude_select")}" data-field="exclude_select">
                ${optionHtml("", "None", trigger.exclude_select ?? "")}
                ${optionHtml("first", "First", trigger.exclude_select)}
                ${optionHtml("last", "Last", trigger.exclude_select)}
              </select>`
            )}
            ${triggerField(
              id("labels"),
              "Labels",
              `<input class="field" id="${id("labels")}" data-field="labels" value="${String(list("labels")).replaceAll('"', "&quot;")}" placeholder="mid, middle leg" />`
            )}
            ${triggerField(
              id("corner_numbers"),
              "Corner numbers",
              `<input class="field" id="${id("corner_numbers")}" data-field="corner_numbers" value="${String(list("corner_numbers")).replaceAll('"', "&quot;")}" placeholder="3" />`
            )}
            ${triggerField(
              id("require_tags"),
              "Require tags",
              `<input class="field" id="${id("require_tags")}" data-field="require_tags" value="${String(list("require_tags")).replaceAll('"', "&quot;")}" placeholder="backstretch" />`
            )}
            ${triggerField(
              id("clip_start_ratio"),
              "Clip start ratio",
              `<input class="field" id="${id("clip_start_ratio")}" data-field="clip_start_ratio" type="number" inputmode="decimal" step="0.05" value="${num("clip_start_ratio")}" />`
            )}
            ${triggerField(
              id("clip_end_ratio"),
              "Clip end ratio",
              `<input class="field" id="${id("clip_end_ratio")}" data-field="clip_end_ratio" type="number" inputmode="decimal" step="0.05" value="${num("clip_end_ratio")}" />`
            )}
            ${triggerField(
              id("clip_start"),
              "Clip start (m)",
              `<input class="field" id="${id("clip_start")}" data-field="clip_start" type="number" inputmode="decimal" value="${num("clip_start")}" />`
            )}
            ${triggerField(
              id("clip_end"),
              "Clip end (m)",
              `<input class="field" id="${id("clip_end")}" data-field="clip_end" type="number" inputmode="decimal" value="${num("clip_end")}" />`
            )}
            ${triggerField(
              id("start"),
              "Range start",
              `<input class="field" id="${id("start")}" data-field="start" type="number" inputmode="decimal" value="${num("start")}" />`
            )}
            ${triggerField(
              id("end"),
              "Range end",
              `<input class="field" id="${id("end")}" data-field="end" type="number" inputmode="decimal" value="${num("end")}" />`
            )}
            ${triggerField(
              id("distance_mode_box"),
              "Distance mode",
              `<select class="select" id="${id("distance_mode_box")}" data-field="distance_mode">
                ${optionHtml("", "None", trigger.distance_mode ?? "")}
                ${optionHtml("absolute", "Absolute", trigger.distance_mode)}
                ${optionHtml("remaining", "Remaining", trigger.distance_mode)}
              </select>`
            )}
            ${triggerField(
              id("remaining_start"),
              "Remaining start",
              `<input class="field" id="${id("remaining_start")}" data-field="remaining_start" type="number" inputmode="decimal" value="${num("remaining_start")}" />`
            )}
            ${triggerField(
              id("remaining_end"),
              "Remaining end",
              `<input class="field" id="${id("remaining_end")}" data-field="remaining_end" type="number" inputmode="decimal" value="${num("remaining_end")}" />`
            )}
            ${triggerField(
              id("remaining_gte"),
              "Remaining ≥",
              `<input class="field" id="${id("remaining_gte")}" data-field="remaining_gte" type="number" inputmode="decimal" value="${num("remaining_gte")}" />`
            )}
            ${triggerField(
              id("remaining_lte"),
              "Remaining ≤",
              `<input class="field" id="${id("remaining_lte")}" data-field="remaining_lte" type="number" inputmode="decimal" value="${num("remaining_lte")}" />`
            )}
            ${triggerField(
              id("color"),
              "Color",
              `<input class="field" id="${id("color")}" data-field="color" value="${String(trigger.color || "").replaceAll('"', "&quot;")}" placeholder="#d11f2a" />`
            )}
            <label class="trigger-field" for="${id("disable_auto_phase_clip")}">
              <span>Auto phase clip</span>
              <span class="trigger-check">
                <input id="${id("disable_auto_phase_clip")}" data-field="disable_auto_phase_clip" type="checkbox"${trigger.disable_auto_phase_clip ? " checked" : ""} />
                Disable
              </span>
            </label>
          </div>
        </details>
      </div>
    </article>`;
  }

  function syncTriggerCard(card) {
    const type = card.querySelector('[data-field="type"]')?.value || "box";
    card.querySelectorAll(".js-for-box").forEach((el) => {
      el.hidden = type !== "box";
    });
    card.querySelectorAll(".js-for-line").forEach((el) => {
      el.hidden = type !== "line";
    });
    const matchCustom = card.querySelector('[data-field="match"]')?.value === "__custom__";
    const matchWrap = card.querySelector(".js-match-custom");
    if (matchWrap) matchWrap.hidden = !matchCustom;
    const phaseCustom = card.querySelector('[data-field="phase"]')?.value === "__custom__";
    const phaseWrap = card.querySelector(".js-phase-custom");
    if (phaseWrap) phaseWrap.hidden = !phaseCustom;
  }

  function fieldEl(card, key) {
    return [...card.querySelectorAll(`[data-field="${key}"]`)].find((el) => !el.hidden && !el.closest("[hidden]"));
  }

  function readText(card, key) {
    const el = fieldEl(card, key);
    if (!el || el.disabled) return undefined;
    const value = String(el.value ?? "").trim();
    return value ? value : undefined;
  }

  function readNumber(card, key) {
    const value = readText(card, key);
    if (value == null) return undefined;
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  }

  function orderedTrigger(raw) {
    const out = {};
    for (const key of TRIGGER_KEY_ORDER) {
      if (raw[key] !== undefined) out[key] = raw[key];
    }
    for (const [key, value] of Object.entries(raw)) {
      if (out[key] === undefined && value !== undefined) out[key] = value;
    }
    return out;
  }

  function readTriggerCard(card) {
    const type = readText(card, "type") || "box";
    const trigger = { type };
    const behavior = readText(card, "trigger_behavior");
    if (type === "box" && behavior) trigger.trigger_behavior = behavior;

    const phaseSel = readText(card, "phase");
    if (phaseSel === "__custom__") {
      const custom = encodePhase(readText(card, "phase_custom") || "");
      if (custom) trigger.phase = custom;
    } else if (phaseSel) {
      trigger.phase = encodePhase(phaseSel);
    }

    const target = readText(card, "target");
    if (target) trigger.target = target;

    const matchSel = readText(card, "match");
    if (matchSel === "__custom__") {
      const custom = readText(card, "match_custom");
      if (custom) trigger.match = custom;
    } else if (matchSel) {
      trigger.match = matchSel;
    }

    const select = readText(card, "select");
    if (select) trigger.select = select;

    if (type === "box") {
      const localStart = readNumber(card, "clip_within_segment_start_ratio");
      const localEnd = readNumber(card, "clip_within_segment_end_ratio");
      if (localStart != null) trigger.clip_within_segment_start_ratio = localStart;
      if (localEnd != null) trigger.clip_within_segment_end_ratio = localEnd;
    } else {
      const distance = readNumber(card, "distance");
      const value = readNumber(card, "value");
      const mode = readText(card, "distance_mode");
      const linePos = readText(card, "line_position");
      if (distance != null) trigger.distance = distance;
      if (value != null) trigger.value = value;
      if (mode) trigger.distance_mode = mode;
      else if (value != null && distance == null) trigger.distance_mode = "remaining";
      if (linePos) trigger.line_position = linePos;
    }

    const exclude = readText(card, "exclude_select");
    if (exclude) trigger.exclude_select = exclude;
    const labels = parseList(readText(card, "labels"));
    if (labels) trigger.labels = labels;
    const corners = parseList(readText(card, "corner_numbers"), true);
    if (corners) trigger.corner_numbers = corners;
    const tags = parseList(readText(card, "require_tags"));
    if (tags) trigger.require_tags = tags;

    const mode = readText(card, "distance_mode");
    if (mode) trigger.distance_mode = mode;

    for (const key of [
      "clip_start_ratio",
      "clip_end_ratio",
      "clip_start",
      "clip_end",
      "start",
      "end",
      "remaining_start",
      "remaining_end",
      "remaining_gte",
      "remaining_lte",
    ]) {
      const n = readNumber(card, key);
      if (n != null) trigger[key] = n;
    }
    const color = readText(card, "color");
    if (color) trigger.color = color;
    if (card.querySelector('[data-field="disable_auto_phase_clip"]')?.checked) {
      trigger.disable_auto_phase_clip = true;
    }
    return orderedTrigger(trigger);
  }

  function testerJsonPreview(triggers) {
    return JSON.stringify(triggers.length === 1 ? triggers[0] : triggers, null, 2);
  }

  function collectTesterTriggers() {
    return [...document.querySelectorAll("[data-trigger-card]")].map(readTriggerCard);
  }

  function setTesterStatus(text) {
    const el = document.getElementById("tester-status");
    if (el) el.textContent = text;
  }

  function applyTesterToMap() {
    const triggers = collectTesterTriggers();
    const jsonEl = document.getElementById("tester-json");
    if (jsonEl) jsonEl.textContent = testerJsonPreview(triggers);
    selectSkill(testerSkill(triggers), { fromTester: true });
  }

  function bindTriggerCard(card) {
    syncTriggerCard(card);
    card.addEventListener("input", () => {
      syncTriggerCard(card);
      applyTesterToMap();
    });
    card.addEventListener("change", () => {
      syncTriggerCard(card);
      applyTesterToMap();
    });
    card.querySelector("[data-remove-trigger]")?.addEventListener("click", () => {
      const list = document.getElementById("tester-list");
      if ([...list.querySelectorAll("[data-trigger-card]")].length <= 1) {
        setTesterTriggers([DEFAULT_TRIGGER]);
        return;
      }
      card.remove();
      refreshTriggerHeadings();
      applyTesterToMap();
    });
  }

  function refreshTriggerHeadings() {
    document.querySelectorAll("[data-trigger-card] h4").forEach((el, i) => {
      el.textContent = `Trigger ${i + 1}`;
    });
  }

  function setTesterTriggers(triggers, options = {}) {
    const list = document.getElementById("tester-list");
    if (!list) return;
    const items = triggers?.length ? triggers : [DEFAULT_TRIGGER];
    list.innerHTML = items.map((trigger, i) => triggerCardHtml(i, trigger)).join("");
    list.querySelectorAll("[data-trigger-card]").forEach(bindTriggerCard);
    const jsonEl = document.getElementById("tester-json");
    if (jsonEl) jsonEl.textContent = testerJsonPreview(items.map((t) => orderedTrigger({ type: "box", ...t })));
    if (options.apply !== false) applyTesterToMap();
    else if (jsonEl) jsonEl.textContent = testerJsonPreview(collectTesterTriggers());
  }

  function extractJsonValues(text) {
    const values = [];
    const source = String(text || "");
    let i = 0;
    while (i < source.length) {
      while (i < source.length && /[\s,]/.test(source[i])) i++;
      if (i >= source.length) break;
      if (source[i] !== "{" && source[i] !== "[") {
        throw new Error("Expected a JSON object or array");
      }
      const start = i;
      let depth = 0;
      let inString = false;
      let escaped = false;
      for (; i < source.length; i++) {
        const ch = source[i];
        if (inString) {
          if (escaped) escaped = false;
          else if (ch === "\\") escaped = true;
          else if (ch === '"') inString = false;
          continue;
        }
        if (ch === '"') {
          inString = true;
          continue;
        }
        if (ch === "{" || ch === "[") depth++;
        else if (ch === "}" || ch === "]") {
          depth--;
          if (depth === 0) {
            i++;
            values.push(JSON.parse(source.slice(start, i)));
            break;
          }
        }
      }
      if (depth !== 0) throw new Error("Unclosed JSON value");
    }
    if (!values.length) throw new Error("No JSON found");
    return values;
  }

  function parsePastedJson(raw) {
    try {
      return JSON.parse(raw);
    } catch (_) {
      const values = extractJsonValues(raw);
      return values.length === 1 ? values[0] : values;
    }
  }

  function isTrigger(obj) {
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return false;
    const type = String(obj.type || "").toLowerCase();
    return (
      type === "box" ||
      type === "line" ||
      obj.target != null ||
      obj.match != null ||
      obj.phase != null ||
      obj.phases != null ||
      obj.labels != null
    );
  }

  function testerSkill(triggers) {
    return {
      skill_name: "Activation tester",
      category: "tester",
      description: `${triggers.length} trigger${triggers.length === 1 ? "" : "s"} applied to the current map.`,
      activation_map: {
        show_chart: true,
        triggers,
      },
    };
  }

  function skillFromPaste(parsed) {
    if (Array.isArray(parsed)) {
      const triggers = parsed.filter(isTrigger);
      if (!triggers.length) throw new Error("Array did not contain trigger objects.");
      return testerSkill(triggers);
    }
    if (parsed.activation_map && typeof parsed.activation_map === "object") return parsed;
    if (Array.isArray(parsed.triggers)) return testerSkill(parsed.triggers);
    if (isTrigger(parsed)) return testerSkill([parsed]);
    if (parsed.skill_name) return parsed;
    throw new Error("Paste a trigger object, a list of triggers, or a full skill.");
  }

  function applyPastedTriggers() {
    const raw = document.getElementById("skill-paste").value.trim();
    if (!raw) return;
    try {
      const parsed = parsePastedJson(raw);
      const skill = skillFromPaste(parsed);
      const triggers = skill.activation_map?.triggers;
      if (!Array.isArray(triggers) || !triggers.length) throw new Error("No triggers found in JSON.");
      setTesterTriggers(triggers);
      setTesterStatus("Loaded JSON into the form.");
    } catch (err) {
      setTesterStatus(err.message || "Invalid JSON");
      alert(err.message || "Invalid JSON");
    }
  }

  async function init() {
    Toolkino.mountShell("visualizer");

    const [maps, cms, skills] = await Promise.all([
      Toolkino.loadJson("maps.json"),
      Toolkino.loadJson("champsmeet.json"),
      Toolkino.loadJson("skill.json"),
    ]);
    state.maps = Array.isArray(maps) ? maps : [];
    state.cms = Array.isArray(cms) ? cms : [];
    state.skills = Array.isArray(skills) ? skills.filter((s) => s.skill_name) : [];

    const defaultCm = pickDefaultCm(state.cms);
    fillSelect(
      document.getElementById("cm-select"),
      state.cms.map((c) => [c.number, `#${c.number} ${c.name}`]),
      defaultCm?.number
    );
    fillSelect(
      document.getElementById("map-select"),
      [["", "— Use CM map —"], ...state.maps.map((m) => [m.name, m.name])],
      ""
    );

    selectCm(defaultCm?.number);
    setTesterTriggers([DEFAULT_TRIGGER]);

    document.getElementById("tester-add")?.addEventListener("click", () => {
      const current = collectTesterTriggers();
      current.push({ type: "box" });
      setTesterTriggers(current);
    });
    document.getElementById("tester-copy")?.addEventListener("click", async () => {
      const text = document.getElementById("tester-json")?.textContent || "";
      try {
        await navigator.clipboard.writeText(text);
        setTesterStatus("Copied JSON.");
      } catch {
        setTesterStatus("Copy failed.");
      }
    });

    document.getElementById("cm-select")?.addEventListener("change", (e) => {
      document.getElementById("map-select").value = "";
      selectCm(e.target.value);
    });
    document.getElementById("map-select")?.addEventListener("change", (e) => {
      if (!e.target.value) {
        selectCm(document.getElementById("cm-select").value);
        return;
      }
      state.selectedMap = mapById(e.target.value);
      renderMap();
    });

    const search = document.getElementById("skill-search");
    const list = document.getElementById("skill-combo-list");
    search?.addEventListener("focus", () => {
      state.query = search.value === state.selectedSkill?.skill_name ? "" : search.value;
      openCombo();
    });
    search?.addEventListener("input", () => {
      state.query = search.value;
      state.highlight = 0;
      openCombo();
    });
    search?.addEventListener("keydown", (e) => {
      const matches = filteredSkills().slice(0, LIST_LIMIT);
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (!state.listOpen) openCombo();
        state.highlight = Math.min(matches.length - 1, state.highlight + 1);
        renderComboList();
        list?.querySelector(".skill-combo-item.active")?.scrollIntoView({ block: "nearest" });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        state.highlight = Math.max(0, state.highlight - 1);
        renderComboList();
        list?.querySelector(".skill-combo-item.active")?.scrollIntoView({ block: "nearest" });
      } else if (e.key === "Enter") {
        e.preventDefault();
        const skill = matches[state.highlight];
        if (skill) selectSkill(skill);
      } else if (e.key === "Escape") {
        closeCombo();
      }
    });
    list?.addEventListener("mousedown", (e) => {
      const item = e.target.closest("[data-name]");
      if (!item) return;
      e.preventDefault();
      selectSkillByName(item.dataset.name);
    });
    document.addEventListener("click", (e) => {
      if (!e.target.closest("#skill-combo")) closeCombo();
    });
    document.getElementById("skill-filters")?.addEventListener("change", () => {
      state.highlight = 0;
      if (state.listOpen || document.activeElement === search) openCombo();
      else renderComboList();
    });

    document.getElementById("paste-apply")?.addEventListener("click", applyPastedTriggers);
    document.getElementById("skill-paste")?.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        applyPastedTriggers();
      }
    });

    window.addEventListener("resize", () => renderMap());
  }

  document.addEventListener("DOMContentLoaded", init);
})();
