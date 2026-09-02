/** Wheelspin tool with presets + elimination mode */
(function () {
  const FALLBACK = {
    racecourse: ["Tokyo", "Nakayama", "Kyoto", "Hanshin", "Chukyo", "Sapporo", "Hakodate", "Fukushima", "Niigata", "Kokura"],
    track: ["Turf 1200m", "Turf 1600m", "Turf 1800m", "Turf 2000m", "Turf 2400m", "Turf 3200m", "Dirt 1200m", "Dirt 1400m", "Dirt 1600m", "Dirt 1800m"],
    uma: ["Special Week", "Silence Suzuka", "Tokai Teio", "Maruzensky", "Oguri Cap", "Gold Ship", "Vodka", "Daiwa Scarlet", "Kitasan Black"],
    custom: ["Option A", "Option B", "Option C", "Option D"],
    conditions: [
      "Spring Sunny Firm",
      "Spring Sunny Good",
      "Spring Cloudy Firm",
      "Spring Cloudy Good",
      "Spring Rainy Soft",
      "Spring Rainy Heavy",
      "Summer Sunny Firm",
      "Summer Sunny Good",
      "Summer Cloudy Firm",
      "Summer Cloudy Good",
      "Summer Rainy Soft",
      "Summer Rainy Heavy",
      "Fall Sunny Firm",
      "Fall Sunny Good",
      "Fall Cloudy Firm",
      "Fall Cloudy Good",
      "Fall Rainy Soft",
      "Fall Rainy Heavy",
      "Winter Sunny Firm",
      "Winter Sunny Good",
      "Winter Cloudy Firm",
      "Winter Cloudy Good",
      "Winter Rainy Soft",
      "Winter Rainy Heavy",
      "Winter Snowy Good",
      "Winter Snowy Soft",
    ],
  };

  const segmentColors = ["#1f1f23", "#292a2d", "#343538"];
  const textColors = ["#54e98a", "#ffb961", "#ffc1a6", "#bbcbbb"];
  const SEASON_PALETTE = {
    spring: { fills: ["#2a4634", "#355a41"], text: "#b8f0c8" },
    summer: { fills: ["#4a3c18", "#5c4a1c"], text: "#ffe08a" },
    fall: { fills: ["#4a2c18", "#5c381c"], text: "#ffb061" },
    winter: { fills: ["#1c3348", "#24425c"], text: "#9ec9ff" },
    other: { fills: ["#1f1f23", "#292a2d"], text: "#bbcbbb" },
  };

  const state = {
    presets: { ...FALLBACK },
    presetKey: "racecourse",
    entries: [...FALLBACK.racecourse],
    eliminated: [],
    rotation: 0,
    spinning: false,
    totalSpins: 0,
    elimination: false,
    trackCatalog: [],
  };

  let canvas, ctx;
  let audioCtx = null;
  let spinTickTimer = null;
  let muted = localStorage.getItem("wheelspin-muted") === "1";

  function getAudioCtx() {
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      audioCtx = new Ctx();
    }
    if (audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
  }

  function tone(freq, start, duration, type = "square", gain = 0.08) {
    const ctx = getAudioCtx();
    if (!ctx || muted) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(gain, start + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  function playSpinTick(intensity = 1) {
    const ctx = getAudioCtx();
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    // Soft click / ratchet tick
    tone(180 + intensity * 40, t, 0.045, "triangle", 0.045 * intensity);
    tone(520 + intensity * 80, t, 0.03, "square", 0.025 * intensity);
  }

  function startSpinSfx(durationMs = 4000) {
    stopSpinSfx();
    const ctx = getAudioCtx();
    if (!ctx || muted) return;

    const start = performance.now();
    let nextAt = 0;

    function schedule() {
      if (!state.spinning) return;
      const elapsed = performance.now() - start;
      if (elapsed >= durationMs) return;

      // Interval grows as the wheel slows (matches ease-out feel)
      const progress = elapsed / durationMs;
      const interval = 55 + progress * progress * 280;
      const intensity = Math.max(0.35, 1 - progress * 0.55);

      if (elapsed >= nextAt) {
        playSpinTick(intensity);
        nextAt = elapsed + interval;
      }
      spinTickTimer = requestAnimationFrame(schedule);
    }
    spinTickTimer = requestAnimationFrame(schedule);
  }

  function stopSpinSfx() {
    if (spinTickTimer) {
      cancelAnimationFrame(spinTickTimer);
      spinTickTimer = null;
    }
  }

  function playWinSfx() {
    const ctx = getAudioCtx();
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    // Short celebratory arpeggio
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
    notes.forEach((freq, i) => {
      tone(freq, t + i * 0.09, 0.22, "triangle", 0.09);
      tone(freq * 2, t + i * 0.09, 0.16, "sine", 0.035);
    });
    // Soft sparkle trail
    tone(1318.5, t + 0.38, 0.35, "sine", 0.05);
  }

  function syncMuteUi() {
    const btn = document.getElementById("mute-toggle");
    if (!btn) return;
    btn.querySelector(".material-symbols-outlined").textContent = muted ? "volume_off" : "volume_up";
    btn.title = muted ? "Unmute sounds" : "Mute sounds";
    btn.setAttribute("aria-pressed", muted ? "true" : "false");
  }

  function seasonOf(label) {
    const first = String(label || "")
      .trim()
      .split(/\s+/)[0]
      .toLowerCase();
    if (first === "autumn") return "fall";
    if (first === "spring" || first === "summer" || first === "fall" || first === "winter") return first;
    return "other";
  }

  function seasonStyle(label, index) {
    const palette = SEASON_PALETTE[seasonOf(label)] || SEASON_PALETTE.other;
    return {
      fill: palette.fills[index % palette.fills.length],
      text: palette.text,
    };
  }

  function entryWeights() {
    const groups = {};
    state.entries.forEach((label, i) => {
      const key = seasonOf(label);
      (groups[key] ||= []).push(i);
    });
    const keys = Object.keys(groups);
    const share = keys.length ? 1 / keys.length : 1;
    const weights = state.entries.map(() => 0);
    for (const key of keys) {
      const idxs = groups[key];
      const w = share / idxs.length;
      idxs.forEach((i) => {
        weights[i] = w;
      });
    }
    return weights;
  }

  function weightsAreEqual(weights) {
    if (!weights.length) return true;
    const first = weights[0];
    return weights.every((w) => Math.abs(w - first) < 1e-9);
  }

  function sliceLayout() {
    const weights = entryWeights();
    const total = weights.reduce((sum, w) => sum + w, 0) || 1;
    let angle = 0;
    return state.entries.map((label, i) => {
      const arc = (weights[i] / total) * Math.PI * 2;
      const start = angle;
      angle += arc;
      return { start, arc, label, weight: weights[i] / total };
    });
  }

  function indexAtPointer(rotationDeg) {
    const actual = ((rotationDeg % 360) + 360) % 360;
    let deg = (270 - actual) % 360;
    if (deg < 0) deg += 360;
    const rad = (deg * Math.PI) / 180;
    const slices = sliceLayout();
    for (let i = 0; i < slices.length; i++) {
      const end = slices[i].start + slices[i].arc;
      if (rad >= slices[i].start && rad < end - 1e-10) return i;
    }
    return Math.max(0, slices.length - 1);
  }

  function drawWheel() {
    const size = canvas.width;
    const center = size / 2;
    const radius = center - 12;
    ctx.clearRect(0, 0, size, size);

    if (!state.entries.length) {
      ctx.fillStyle = "#1a1b1e";
      ctx.beginPath();
      ctx.arc(center, center, radius, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    const slices = sliceLayout();
    const smallType = slices.length > 16;
    const seasonal = slices.some((slice) => seasonOf(slice.label) !== "other");
    slices.forEach((slice, i) => {
      const style = seasonal
        ? seasonStyle(slice.label, i)
        : { fill: segmentColors[i % segmentColors.length], text: textColors[i % textColors.length] };
      ctx.beginPath();
      ctx.fillStyle = style.fill;
      ctx.moveTo(center, center);
      ctx.arc(center, center, radius, slice.start, slice.start + slice.arc);
      ctx.fill();
      ctx.strokeStyle = "#121316";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.save();
      ctx.translate(center, center);
      ctx.rotate(slice.start + slice.arc / 2);
      ctx.textAlign = "right";
      ctx.fillStyle = style.text;
      ctx.font = smallType ? "bold 11px 'Space Mono'" : "bold 15px 'Space Mono'";
      const max = smallType ? 22 : 18;
      const text = slice.label.length > max ? `${slice.label.slice(0, max - 3)}...` : slice.label;
      ctx.fillText(text, radius - 28, 4);
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
    const seasonal = state.entries.some((entry) => seasonOf(entry) !== "other");
    state.entries.forEach((entry, index) => {
      const swatch = seasonal
        ? seasonStyle(entry, index).text
        : textColors[index % textColors.length];
      const div = document.createElement("div");
      div.className = "entry-row";
      div.innerHTML = `
        <div class="entry-left">
          <span class="swatch" style="background:${swatch}"></span>
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

    const weights = entryWeights();
    const suffix = document.getElementById("odds-suffix");
    if (!state.entries.length) {
      document.getElementById("odds-percent").textContent = "0.0";
      if (suffix) suffix.textContent = "%";
    } else if (weightsAreEqual(weights)) {
      document.getElementById("odds-percent").textContent = (100 / state.entries.length).toFixed(1);
      if (suffix) suffix.textContent = "%";
    } else {
      const seasons = new Set(state.entries.map(seasonOf));
      document.getElementById("odds-percent").textContent = (100 / seasons.size).toFixed(0);
      if (suffix) suffix.textContent = "% / season";
    }
    drawWheel();
  }

  function spin() {
    if (state.spinning || state.entries.length < 1) return;
    getAudioCtx(); // unlock audio on user gesture
    if (state.entries.length === 1) {
      finishSpin(0);
      return;
    }
    state.spinning = true;
    const btn = document.getElementById("spin-button");
    btn.disabled = true;
    document.getElementById("winner-display").classList.add("hidden");

    const spinMs = 4000;
    startSpinSfx(spinMs);

    const rotations = 7 + Math.floor(Math.random() * 5);
    const extra = Math.floor(Math.random() * 360);
    state.rotation += rotations * 360 + extra;
    canvas.style.transform = `rotate(${state.rotation}deg)`;

    setTimeout(() => {
      stopSpinSfx();
      const index = indexAtPointer(state.rotation);
      finishSpin(index);
      btn.disabled = false;
      state.spinning = false;
    }, spinMs);
  }

  function finishSpin(index) {
    const result = state.entries[index];
    document.getElementById("winner-text").textContent = result;
    document.getElementById("winner-display").classList.remove("hidden");
    document.getElementById("last-spin").textContent = result;
    state.totalSpins += 1;
    document.getElementById("total-spins").textContent = String(state.totalSpins);
    playWinSfx();

    if (state.elimination && state.entries.length > 1) {
      state.eliminated.push(result);
      state.entries.splice(index, 1);
      renderList();
    }
  }

  const HIDDEN_RACETRACKS = new Set(["longchamp"]);
  const HIDDEN_TRACKS = new Set([
    "sapporo 1000m (clockwise) (dirt)",
    "hakodate 1000m (clockwise) (dirt)",
    "chukyo 1200m (counterclockwise) (dirt)",
    "hanshin 1200m (clockwise) (dirt)",
    "kokura 1000m (clockwise) (dirt)",
    "sapporo 2400m (clockwise) (dirt)",
    "hakodate 2400m (clockwise) (dirt)",
    "fukushima 2400m (clockwise) (dirt)",
    "nakayama 2400m (clockwise) (dirt)",
    "tokyo 2400m (counterclockwise) (dirt)",
    "chukyo 1900m (counterclockwise) (dirt)",
    "kokura 2400m (clockwise) (dirt)",
    "niigata 2500m (counterclockwise) (dirt)",
    "nakayama 2500m (clockwise) (dirt)",
  ]);

  function isHiddenTrack(map) {
    const racetrack = String(map?.racetrack || "").toLowerCase();
    if (HIDDEN_RACETRACKS.has(racetrack)) return true;
    const name = String(map?.name || `${map?.racetrack || ""} ${map?.distance_meters || ""}`).toLowerCase();
    return HIDDEN_TRACKS.has(name);
  }

  function toMeters(value) {
    const n = parseInt(String(value ?? "").replace(/[^\d]/g, ""), 10);
    return Number.isFinite(n) ? n : 0;
  }

  function distanceTypeFromMeters(meters) {
    if (meters <= 1400) return "sprint";
    if (meters <= 1800) return "mile";
    if (meters <= 2400) return "medium";
    return "long";
  }

  function checkedTrackFilters(kind) {
    return [...document.querySelectorAll(`#track-filters input[data-track-filter="${kind}"]:checked`)].map(
      (el) => el.value
    );
  }

  function filteredTrackNames() {
    const distances = checkedTrackFilters("distance");
    const terrains = checkedTrackFilters("terrain");
    return state.trackCatalog
      .filter((track) => {
        if (distances.length && !distances.includes(track.distanceType)) return false;
        if (terrains.length && !terrains.includes(track.terrain)) return false;
        return true;
      })
      .map((track) => track.name);
  }

  function syncTrackFilterUi() {
    const wrap = document.getElementById("track-filters");
    wrap?.classList.toggle("hidden", state.presetKey !== "track");
  }

  function loadPresetPool() {
    state.eliminated = [];
    if (state.presetKey === "track" && state.trackCatalog.length) {
      state.entries = filteredTrackNames();
    } else {
      state.entries = [...(state.presets[state.presetKey] || state.presets.custom)];
    }
    renderList();
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
        const playable = maps.filter((m) => !isHiddenTrack(m));
        const courses = [...new Set(playable.map((m) => m.racetrack).filter(Boolean))].sort();
        state.trackCatalog = playable
          .map((m) => {
            const name = m.name || `${m.racetrack} ${m.distance_meters}`;
            if (!name) return null;
            const meters = toMeters(m.distance_meters);
            return {
              name,
              terrain: String(m.terrain || "").toLowerCase(),
              distanceType: distanceTypeFromMeters(meters),
            };
          })
          .filter(Boolean);
        const tracks = state.trackCatalog.map((t) => t.name);
        if (courses.length) state.presets.racecourse = courses;
        if (tracks.length) state.presets.track = tracks;
      }
    } catch (_) {
      /* keep fallback */
    }

    loadPresetPool();
    syncTrackFilterUi();
    syncMuteUi();

    document.getElementById("mute-toggle")?.addEventListener("click", () => {
      muted = !muted;
      localStorage.setItem("wheelspin-muted", muted ? "1" : "0");
      if (muted) stopSpinSfx();
      else getAudioCtx();
      syncMuteUi();
    });

    document.getElementById("spin-button")?.addEventListener("click", spin);
    document.getElementById("wheel-preset")?.addEventListener("change", (e) => {
      state.presetKey = e.target.value;
      syncTrackFilterUi();
      loadPresetPool();
    });
    document.getElementById("track-filters")?.addEventListener("change", () => {
      if (state.presetKey === "track") loadPresetPool();
    });
    document.getElementById("elimination-toggle")?.addEventListener("change", (e) => {
      state.elimination = e.target.checked;
      document.getElementById("eliminated-wrap")?.classList.toggle("hidden", !state.elimination);
    });
    function parseEntryLines(text) {
      return String(text || "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
    }

    function addEntries(names) {
      if (!names.length) return;
      state.entries.push(...names);
      renderList();
    }

    document.getElementById("add-entry")?.addEventListener("click", () => {
      const input = document.getElementById("new-entry-name");
      const names = parseEntryLines(input.value);
      if (!names.length) return;
      addEntries(names);
      input.value = "";
    });
    const newEntry = document.getElementById("new-entry-name");
    newEntry?.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        document.getElementById("add-entry").click();
      }
    });
    newEntry?.addEventListener("paste", (e) => {
      const pasted = e.clipboardData?.getData("text") || "";
      const names = parseEntryLines(pasted);
      if (names.length <= 1) return;
      e.preventDefault();
      addEntries(names);
      newEntry.value = "";
    });
    document.getElementById("reset-wheel")?.addEventListener("click", () => {
      loadPresetPool();
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
