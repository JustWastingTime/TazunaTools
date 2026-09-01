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
      const actual = ((state.rotation % 360) + 360) % 360;
      const arc = 360 / state.entries.length;
      let winningAngle = (270 - actual) % 360;
      if (winningAngle < 0) winningAngle += 360;
      const index = Math.floor(winningAngle / arc) % state.entries.length;
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
