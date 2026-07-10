/** Skill visualizer page logic */
(function () {
  const state = {
    maps: [],
    cms: [],
    skills: [],
    selectedCm: null,
    selectedMap: null,
    selectedSkill: null,
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
    const map = state.selectedMap;
    if (!map) {
      host.innerHTML = `<p class="muted">No map selected.</p>`;
      return;
    }

    const track = currentTrackMeta();
    const skill = state.selectedSkill;
    let warning = "";
    let markers = [];
    if (skill) {
      const compat = CourseMap.evaluateRequirements(skill, track);
      if (!compat.ok) warning = `May not work: ${compat.reasons[0]}`;
      if (skill.activation_map?.show_chart === false) warning = warning || "show_chart is false";
      markers = CourseMap.markersFromActivationMap(skill, map);
    }

    try {
      host.innerHTML = CourseMap.buildSvg(map, {
        width: Math.min(1200, host.clientWidth || 1000),
        markers,
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
      state.cms[state.cms.length - 1];
    state.selectedCm = cm || null;
    if (cm?.map_id) {
      const mapped = mapById(cm.map_id);
      if (mapped) state.selectedMap = mapped;
    }
    const mapSelect = document.getElementById("map-select");
    if (mapSelect && state.selectedMap) mapSelect.value = state.selectedMap.name;
    renderMap();
  }

  function selectSkillByName(name) {
    const skill = state.skills.find((s) => s.skill_name === name);
    state.selectedSkill = skill || null;
    renderSkillCard(skill);
    renderMap();
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
    state.skills = Array.isArray(skills) ? skills : [];

    fillSelect(
      document.getElementById("cm-select"),
      state.cms.map((c) => [c.number, `#${c.number} ${c.name}`]),
      state.cms[state.cms.length - 1]?.number
    );
    fillSelect(
      document.getElementById("map-select"),
      [["", "— Use CM map —"], ...state.maps.map((m) => [m.name, m.name])],
      ""
    );

    const skillSelect = document.getElementById("skill-select");
    const names = state.skills.map((s) => s.skill_name).filter(Boolean).sort((a, b) => a.localeCompare(b));
    fillSelect(skillSelect, [["", "— Select skill —"], ...names.map((n) => [n, n])], "");

    selectCm(state.cms[state.cms.length - 1]?.number);

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
    document.getElementById("skill-select")?.addEventListener("change", (e) => {
      selectSkillByName(e.target.value);
    });
    document.getElementById("skill-search")?.addEventListener("input", (e) => {
      const q = e.target.value.trim().toLowerCase();
      const filtered = names.filter((n) => n.toLowerCase().includes(q));
      fillSelect(skillSelect, [["", "— Select skill —"], ...filtered.slice(0, 200).map((n) => [n, n])], skillSelect.value);
    });
    document.getElementById("paste-apply")?.addEventListener("click", () => {
      const raw = document.getElementById("skill-paste").value.trim();
      if (!raw) return;
      try {
        const obj = JSON.parse(raw);
        state.selectedSkill = obj;
        renderSkillCard(obj);
        renderMap();
      } catch (err) {
        alert(`Invalid JSON: ${err.message}`);
      }
    });

    window.addEventListener("resize", () => renderMap());
  }

  document.addEventListener("DOMContentLoaded", init);
})();
