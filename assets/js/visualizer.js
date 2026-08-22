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
      card.innerHTML = `<p class="muted">Select or paste a skill JSON to inspect.</p>`;
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

  function selectSkill(skill) {
    state.selectedSkill = skill || null;
    const search = document.getElementById("skill-search");
    if (search && skill?.skill_name) search.value = skill.skill_name;
    closeCombo();
    renderSkillCard(skill);
    renderMap();
  }

  function selectSkillByName(name) {
    const skill = state.skills.find((s) => s.skill_name === name);
    selectSkill(skill || null);
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

    document.getElementById("paste-apply")?.addEventListener("click", () => {
      const raw = document.getElementById("skill-paste").value.trim();
      if (!raw) return;
      try {
        const obj = JSON.parse(raw);
        selectSkill(obj);
      } catch (err) {
        alert(`Invalid JSON: ${err.message}`);
      }
    });

    window.addEventListener("resize", () => renderMap());
  }

  document.addEventListener("DOMContentLoaded", init);
})();
