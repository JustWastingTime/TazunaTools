/** Wheelspin tool with presets + elimination mode */
(function () {
  const FALLBACK = {
    racecourse: ["Tokyo", "Nakayama", "Kyoto", "Hanshin", "Chukyo", "Sapporo", "Hakodate", "Fukushima", "Niigata", "Kokura"],
    track: ["Turf 1200m", "Turf 1600m", "Turf 1800m", "Turf 2000m", "Turf 2400m", "Turf 3200m", "Dirt 1200m", "Dirt 1400m", "Dirt 1600m", "Dirt 1800m"],
    uma: ["Special Week", "Silence Suzuka", "Tokai Teio", "Maruzensky", "Oguri Cap", "Gold Ship", "Vodka", "Daiwa Scarlet", "Kitasan Black"],
    custom: ["Option A", "Option B", "Option C", "Option D"],
  };

  const segmentColors = ["#1f1f23", "#292a2d", "#343538"];
  const textColors = ["#54e98a", "#ffb961", "#ffc1a6", "#bbcbbb"];

  const state = {
    presets: { ...FALLBACK },
    presetKey: "racecourse",
    entries: [...FALLBACK.racecourse],
    eliminated: [],
    rotation: 0,
    spinning: false,
    totalSpins: 0,
    elimination: false,
  };

  let canvas, ctx;

  function drawWheel() {
    const size = canvas.width;
    const center = size / 2;
    const radius = center - 12;
    const n = state.entries.length || 1;
    const arc = (2 * Math.PI) / n;
    ctx.clearRect(0, 0, size, size);

    if (!state.entries.length) {
      ctx.fillStyle = "#1a1b1e";
      ctx.beginPath();
      ctx.arc(center, center, radius, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    state.entries.forEach((label, i) => {
      const angle = i * arc;
      ctx.beginPath();
      ctx.fillStyle = segmentColors[i % segmentColors.length];
      ctx.moveTo(center, center);
      ctx.arc(center, center, radius, angle, angle + arc);
      ctx.fill();
      ctx.strokeStyle = "#121316";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.save();
      ctx.translate(center, center);
      ctx.rotate(angle + arc / 2);
      ctx.textAlign = "right";
      ctx.fillStyle = textColors[i % textColors.length];
      ctx.font = "bold 15px 'Space Mono'";
      const text = label.length > 18 ? `${label.slice(0, 15)}...` : label;
      ctx.fillText(text, radius - 36, 5);
      ctx.restore();
    });

    ctx.strokeStyle = "#343538";
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.arc(center, center, radius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = "#121316";
    ctx.beginPath();
    ctx.arc(center, center, 36, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#54e98a";
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  function renderList() {
    const list = document.getElementById("entry-list");
    list.innerHTML = "";
    state.entries.forEach((entry, index) => {
      const div = document.createElement("div");
      div.className = "entry-row";
      div.innerHTML = `
        <div class="entry-left">
          <span class="swatch" style="background:${textColors[index % textColors.length]}"></span>
          <input class="field entry-edit" data-i="${index}" value="${entry.replaceAll('"', "&quot;")}" />
        </div>
        <button class="btn-icon danger" data-remove="${index}">
          <span class="material-symbols-outlined">close</span>
        </button>`;
      list.appendChild(div);
    });

    const eliminated = document.getElementById("eliminated-list");
    if (eliminated) {
      eliminated.innerHTML = state.eliminated.length
        ? state.eliminated.map((e) => `<span class="pill">${e}</span>`).join(" ")
        : `<span class="muted mono">None yet</span>`;
    }

    const chance = state.entries.length ? (100 / state.entries.length).toFixed(1) : "0.0";
    document.getElementById("odds-percent").textContent = chance;
    drawWheel();
  }

  function spin() {
    if (state.spinning || state.entries.length < 1) return;
    if (state.entries.length === 1) {
      finishSpin(0);
      return;
    }
    state.spinning = true;
    const btn = document.getElementById("spin-button");
    btn.disabled = true;
    document.getElementById("winner-display").classList.add("hidden");

    const rotations = 7 + Math.floor(Math.random() * 5);
    const extra = Math.floor(Math.random() * 360);
    state.rotation += rotations * 360 + extra;
    canvas.style.transform = `rotate(${state.rotation}deg)`;

    setTimeout(() => {
      const actual = ((state.rotation % 360) + 360) % 360;
      const arc = 360 / state.entries.length;
      let winningAngle = (270 - actual) % 360;
      if (winningAngle < 0) winningAngle += 360;
      const index = Math.floor(winningAngle / arc) % state.entries.length;
      finishSpin(index);
      btn.disabled = false;
      state.spinning = false;
    }, 4000);
  }

  function finishSpin(index) {
    const result = state.entries[index];
    document.getElementById("winner-text").textContent = result;
    document.getElementById("winner-display").classList.remove("hidden");
    document.getElementById("last-spin").textContent = result;
    state.totalSpins += 1;
    document.getElementById("total-spins").textContent = String(state.totalSpins);

    if (state.elimination && state.entries.length > 1) {
      state.eliminated.push(result);
      state.entries.splice(index, 1);
      renderList();
    }
  }

  async function init() {
    canvas = document.getElementById("wheel-canvas");
    ctx = canvas.getContext("2d");

    try {
      const lists = await Toolkino.loadJson("lists.json");
      if (Array.isArray(lists.uma) && lists.uma.length) {
        state.presets.uma = lists.uma.slice();
      }
    } catch (_) {
      /* keep fallback */
    }

    try {
      const maps = await Toolkino.loadJson("maps.json");
      if (Array.isArray(maps) && maps.length) {
        const courses = [...new Set(maps.map((m) => m.racetrack).filter(Boolean))].sort();
        const tracks = maps
          .map((m) => m.name || `${m.racetrack} ${m.distance_meters}`)
          .filter(Boolean);
        if (courses.length) state.presets.racecourse = courses;
        if (tracks.length) state.presets.track = tracks;
      }
    } catch (_) {
      /* keep fallback */
    }

    state.entries = [...state.presets[state.presetKey]];
    renderList();

    document.getElementById("spin-button")?.addEventListener("click", spin);
    document.getElementById("wheel-preset")?.addEventListener("change", (e) => {
      state.presetKey = e.target.value;
      state.eliminated = [];
      state.entries = [...(state.presets[state.presetKey] || state.presets.custom)];
      renderList();
    });
    document.getElementById("elimination-toggle")?.addEventListener("change", (e) => {
      state.elimination = e.target.checked;
      document.getElementById("eliminated-wrap")?.classList.toggle("hidden", !state.elimination);
    });
    document.getElementById("add-entry")?.addEventListener("click", () => {
      const input = document.getElementById("new-entry-name");
      const name = input.value.trim();
      if (!name) return;
      state.entries.push(name);
      input.value = "";
      renderList();
    });
    document.getElementById("new-entry-name")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") document.getElementById("add-entry").click();
    });
    document.getElementById("reset-wheel")?.addEventListener("click", () => {
      state.eliminated = [];
      state.entries = [...(state.presets[state.presetKey] || [])];
      renderList();
    });
    document.getElementById("clear-wheel")?.addEventListener("click", () => {
      state.entries = [];
      renderList();
    });
    document.getElementById("entry-list")?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-remove]");
      if (!btn) return;
      state.entries.splice(Number(btn.dataset.remove), 1);
      renderList();
    });
    document.getElementById("entry-list")?.addEventListener("change", (e) => {
      if (!e.target.classList.contains("entry-edit")) return;
      const i = Number(e.target.dataset.i);
      state.entries[i] = e.target.value.trim() || state.entries[i];
      drawWheel();
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
