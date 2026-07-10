/** Image quiz cropper with difficulty presets */
(function () {
  const PRESETS = {
    free: { label: "Free", w: 0, h: 0, lock: false },
    medium: { label: "Medium (stand-medium)", w: 320, h: 320, lock: true },
    hard: { label: "Hard (stand-hard)", w: 220, h: 220, lock: true },
    expert: { label: "Expert (tight)", w: 140, h: 140, lock: true },
  };

  const state = {
    img: null,
    naturalW: 0,
    naturalH: 0,
    scale: 1,
    boxes: [],
    activeId: null,
    drag: null,
    preset: "hard",
    answers: "",
    prompt: "Who's that uma? It's ...",
  };

  let canvas, ctx, overlay;

  function uid() {
    return `crop_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  }

  function fitScale() {
    if (!state.img || !canvas) return 1;
    const maxW = canvas.parentElement.clientWidth - 32;
    const maxH = canvas.parentElement.clientHeight - 32;
    return Math.min(maxW / state.naturalW, maxH / state.naturalH, 1);
  }

  function redraw() {
    if (!ctx || !state.img) return;
    state.scale = fitScale();
    canvas.width = Math.round(state.naturalW * state.scale);
    canvas.height = Math.round(state.naturalH * state.scale);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(state.img, 0, 0, canvas.width, canvas.height);

    state.boxes.forEach((box) => {
      const x = box.x * state.scale;
      const y = box.y * state.scale;
      const w = box.w * state.scale;
      const h = box.h * state.scale;
      const active = box.id === state.activeId;
      ctx.save();
      ctx.strokeStyle = active ? "#54e98a" : "#869486";
      ctx.lineWidth = active ? 2.5 : 1.5;
      ctx.setLineDash(active ? [] : [6, 4]);
      ctx.strokeRect(x, y, w, h);
      ctx.fillStyle = active ? "rgba(84,233,138,0.12)" : "rgba(0,0,0,0.15)";
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = active ? "#54e98a" : "#343538";
      ctx.fillRect(x, y - 18, Math.max(80, ctx.measureText(box.name).width + 16), 18);
      ctx.fillStyle = active ? "#003919" : "#e3e2e6";
      ctx.font = "bold 11px 'Space Mono', monospace";
      ctx.fillText(box.name, x + 6, y - 5);
      if (active) {
        [[x, y], [x + w, y], [x, y + h], [x + w, y + h]].forEach(([hx, hy]) => {
          ctx.fillStyle = "#54e98a";
          ctx.fillRect(hx - 4, hy - 4, 8, 8);
        });
      }
      ctx.restore();
    });
  }

  function renderQueue() {
    const list = document.getElementById("crop-queue");
    if (!list) return;
    list.innerHTML = "";
    state.boxes.forEach((box) => {
      const el = document.createElement("div");
      el.className = `queue-item${box.id === state.activeId ? " active" : ""}`;
      el.innerHTML = `
        <div class="queue-thumb" data-id="${box.id}"></div>
        <div class="queue-meta">
          <input class="field queue-name" data-id="${box.id}" value="${box.name}" />
          <p class="mono muted">${Math.round(box.w)}×${Math.round(box.h)} · ${box.preset}</p>
        </div>
        <button class="btn-icon danger" data-del="${box.id}" title="Delete">
          <span class="material-symbols-outlined">delete</span>
        </button>`;
      list.appendChild(el);

      const thumb = el.querySelector(".queue-thumb");
      if (state.img) {
        const t = document.createElement("canvas");
        t.width = 160;
        t.height = 90;
        const tctx = t.getContext("2d");
        tctx.fillStyle = "#0d0e11";
        tctx.fillRect(0, 0, 160, 90);
        const scale = Math.min(160 / box.w, 90 / box.h);
        const dw = box.w * scale;
        const dh = box.h * scale;
        tctx.drawImage(state.img, box.x, box.y, box.w, box.h, (160 - dw) / 2, (90 - dh) / 2, dw, dh);
        thumb.appendChild(t);
      }
    });
  }

  function addBox(presetKey = state.preset) {
    if (!state.img) return;
    const preset = PRESETS[presetKey] || PRESETS.free;
    let w = preset.lock ? preset.w : Math.min(320, state.naturalW * 0.35);
    let h = preset.lock ? preset.h : Math.min(320, state.naturalH * 0.35);
    w = Math.min(w, state.naturalW);
    h = Math.min(h, state.naturalH);
    const box = {
      id: uid(),
      name: `CROP_${String(state.boxes.length + 1).padStart(2, "0")}`,
      x: Math.max(0, (state.naturalW - w) / 2),
      y: Math.max(0, (state.naturalH - h) / 2),
      w,
      h,
      preset: presetKey,
    };
    state.boxes.push(box);
    state.activeId = box.id;
    redraw();
    renderQueue();
  }

  function hitTest(mx, my) {
    const x = mx / state.scale;
    const y = my / state.scale;
    for (let i = state.boxes.length - 1; i >= 0; i--) {
      const b = state.boxes[i];
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b;
    }
    return null;
  }

  function exportCrops() {
    if (!state.img || !state.boxes.length) return;
    const zipNote = document.getElementById("export-status");
    const answers = state.answers
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);
    const answerList = answers.length ? answers : ["Answer"];
    while (answerList.length < 5) answerList.push("$uma");

    const entries = [];
    state.boxes.forEach((box, i) => {
      const c = document.createElement("canvas");
      c.width = Math.round(box.w);
      c.height = Math.round(box.h);
      c.getContext("2d").drawImage(state.img, box.x, box.y, box.w, box.h, 0, 0, c.width, c.height);
      c.toBlob((blob) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${box.name || `crop_${i + 1}`}.png`;
        a.click();
        URL.revokeObjectURL(a.href);
      }, "image/png");

      entries.push([
        `https://cdn.fujikiseki.xyz/uma-assets/REPLACE_ME/${box.name}.png`,
        answerList.slice(0, 5),
      ]);
    });

    const quizJson = {
      promptTemplate: state.prompt,
      difficulty: state.preset === "medium" ? "hard" : state.preset === "expert" ? "expert" : "hard",
      entries,
    };
    const jsonText = JSON.stringify(quizJson, null, 2);
    document.getElementById("quiz-json").textContent = jsonText;
    Toolkino.downloadText("umaguesser-entry.json", jsonText);
    if (zipNote) zipNote.textContent = `Exported ${state.boxes.length} PNG(s) + quiz JSON. Replace CDN path after upload.`;
  }

  function bindCanvas() {
    canvas.addEventListener("mousedown", (e) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const hit = hitTest(mx, my);
      if (hit) {
        state.activeId = hit.id;
        state.drag = {
          id: hit.id,
          ox: mx / state.scale - hit.x,
          oy: my / state.scale - hit.y,
        };
        redraw();
        renderQueue();
      }
    });
    window.addEventListener("mousemove", (e) => {
      if (!state.drag) return;
      const box = state.boxes.find((b) => b.id === state.drag.id);
      if (!box) return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      box.x = Math.min(Math.max(0, mx / state.scale - state.drag.ox), state.naturalW - box.w);
      box.y = Math.min(Math.max(0, my / state.scale - state.drag.oy), state.naturalH - box.h);
      redraw();
    });
    window.addEventListener("mouseup", () => {
      if (state.drag) {
        state.drag = null;
        renderQueue();
      }
    });
  }

  function init() {
    canvas = document.getElementById("crop-canvas");
    ctx = canvas.getContext("2d");
    overlay = document.getElementById("workspace");

    const fileInput = document.getElementById("file-input");
    const dropZone = document.getElementById("drop-zone");

    function loadFile(file) {
      if (!file || !file.type.startsWith("image/")) return;
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        state.img = img;
        state.naturalW = img.naturalWidth;
        state.naturalH = img.naturalHeight;
        state.boxes = [];
        document.getElementById("file-meta").textContent =
          `${file.name} · ${img.naturalWidth}×${img.naturalHeight}`;
        dropZone?.classList.add("hidden");
        canvas.classList.remove("hidden");
        addBox(state.preset);
        URL.revokeObjectURL(url);
      };
      img.src = url;
    }

    fileInput?.addEventListener("change", (e) => loadFile(e.target.files?.[0]));
    ["dragenter", "dragover"].forEach((ev) => {
      dropZone?.addEventListener(ev, (e) => {
        e.preventDefault();
        dropZone.classList.add("dragover");
      });
    });
    ["dragleave", "drop"].forEach((ev) => {
      dropZone?.addEventListener(ev, (e) => {
        e.preventDefault();
        dropZone.classList.remove("dragover");
      });
    });
    dropZone?.addEventListener("drop", (e) => loadFile(e.dataTransfer.files?.[0]));

    document.getElementById("preset-select")?.addEventListener("change", (e) => {
      state.preset = e.target.value;
      const box = state.boxes.find((b) => b.id === state.activeId);
      const preset = PRESETS[state.preset];
      if (box && preset?.lock) {
        box.w = Math.min(preset.w, state.naturalW);
        box.h = Math.min(preset.h, state.naturalH);
        box.preset = state.preset;
        box.x = Math.min(box.x, state.naturalW - box.w);
        box.y = Math.min(box.y, state.naturalH - box.h);
        redraw();
        renderQueue();
      }
    });

    document.getElementById("add-box")?.addEventListener("click", () => addBox());
    document.getElementById("export-btn")?.addEventListener("click", exportCrops);
    document.getElementById("answers-input")?.addEventListener("input", (e) => {
      state.answers = e.target.value;
    });
    document.getElementById("prompt-input")?.addEventListener("input", (e) => {
      state.prompt = e.target.value;
    });

    document.getElementById("crop-queue")?.addEventListener("click", (e) => {
      const del = e.target.closest("[data-del]");
      if (del) {
        state.boxes = state.boxes.filter((b) => b.id !== del.dataset.del);
        if (state.activeId === del.dataset.del) state.activeId = state.boxes[0]?.id || null;
        redraw();
        renderQueue();
        return;
      }
      const thumb = e.target.closest("[data-id]");
      if (thumb) {
        state.activeId = thumb.dataset.id;
        redraw();
        renderQueue();
      }
    });
    document.getElementById("crop-queue")?.addEventListener("input", (e) => {
      if (!e.target.classList.contains("queue-name")) return;
      const box = state.boxes.find((b) => b.id === e.target.dataset.id);
      if (box) {
        box.name = e.target.value;
        redraw();
      }
    });

    bindCanvas();
    window.addEventListener("resize", redraw);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
