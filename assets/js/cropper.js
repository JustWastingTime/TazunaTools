/** Image quiz cropper with difficulty presets */
(function () {
  const PRESETS = {
    free: { label: "Free", w: 0, h: 0, lock: false },
    medium: { label: "Medium (stand-medium)", w: 192, h: 192, lock: true },
    hard: { label: "Hard (stand-hard)", w: 128, h: 128, lock: true },
    expert: { label: "Expert (tight)", w: 64, h: 64, lock: true },
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
        const handles = [
          [x, y], [x + w / 2, y], [x + w, y],
          [x, y + h / 2], [x + w, y + h / 2],
          [x, y + h], [x + w / 2, y + h], [x + w, y + h],
        ];
        handles.forEach(([hx, hy]) => {
          ctx.fillStyle = "#121316";
          ctx.fillRect(hx - 5, hy - 5, 10, 10);
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

  function canvasPoint(e) {
    const rect = canvas.getBoundingClientRect();
    const sx = rect.width ? canvas.width / rect.width : 1;
    const sy = rect.height ? canvas.height / rect.height : 1;
    const cx = (e.clientX - rect.left) * sx;
    const cy = (e.clientY - rect.top) * sy;
    return { cx, cy, x: cx / state.scale, y: cy / state.scale };
  }

  function handleAt(box, cx, cy) {
    const x = box.x * state.scale;
    const y = box.y * state.scale;
    const w = box.w * state.scale;
    const h = box.h * state.scale;
    const pad = 10;
    const near = (a, b) => Math.abs(a - b) <= pad;
    const inX = cx >= x - pad && cx <= x + w + pad;
    const inY = cy >= y - pad && cy <= y + h + pad;
    const left = near(cx, x) && inY;
    const right = near(cx, x + w) && inY;
    const top = near(cy, y) && inX;
    const bottom = near(cy, y + h) && inX;
    if (top && left) return "nw";
    if (top && right) return "ne";
    if (bottom && left) return "sw";
    if (bottom && right) return "se";
    if (top) return "n";
    if (bottom) return "s";
    if (left) return "w";
    if (right) return "e";
    return null;
  }

  function hitTest(pt) {
    for (let i = state.boxes.length - 1; i >= 0; i--) {
      const b = state.boxes[i];
      if (pt.x >= b.x && pt.x <= b.x + b.w && pt.y >= b.y && pt.y <= b.y + b.h) return b;
    }
    return null;
  }

  function cursorForHandle(handle) {
    if (handle === "n" || handle === "s") return "ns-resize";
    if (handle === "e" || handle === "w") return "ew-resize";
    if (handle === "ne" || handle === "sw") return "nesw-resize";
    if (handle === "nw" || handle === "se") return "nwse-resize";
    return "grab";
  }

  function clampBox(box) {
    const min = 24;
    box.w = Math.max(min, Math.min(box.w, state.naturalW));
    box.h = Math.max(min, Math.min(box.h, state.naturalH));
    box.x = Math.min(Math.max(0, box.x), state.naturalW - box.w);
    box.y = Math.min(Math.max(0, box.y), state.naturalH - box.h);
  }

  function applyResize(box, handle, imgX, imgY, start) {
    const lock = Boolean(PRESETS[box.preset]?.lock);
    const right = start.x + start.w;
    const bottom = start.y + start.h;
    let x = start.x;
    let y = start.y;
    let w = start.w;
    let h = start.h;

    if (handle.includes("e")) w = imgX - start.x;
    if (handle.includes("s")) h = imgY - start.y;
    if (handle.includes("w")) {
      w = right - imgX;
      x = imgX;
    }
    if (handle.includes("n")) {
      h = bottom - imgY;
      y = imgY;
    }

    if (lock) {
      let size;
      if (handle === "e" || handle === "w") size = w;
      else if (handle === "n" || handle === "s") size = h;
      else size = Math.max(w, h);
      size = Math.max(24, size);
      w = size;
      h = size;
      if (handle.includes("w")) x = right - w;
      else x = start.x;
      if (handle.includes("n")) y = bottom - h;
      else y = start.y;
    }

    box.x = x;
    box.y = y;
    box.w = w;
    box.h = h;
    clampBox(box);
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
      if (!state.img) return;
      e.preventDefault();
      const pt = canvasPoint(e);
      const active = state.boxes.find((b) => b.id === state.activeId);
      const handle = active ? handleAt(active, pt.cx, pt.cy) : null;
      if (handle) {
        state.drag = {
          mode: "resize",
          id: active.id,
          handle,
          startX: active.x,
          startY: active.y,
          startW: active.w,
          startH: active.h,
        };
        return;
      }
      const hit = hitTest(pt);
      if (hit) {
        state.activeId = hit.id;
        const onHandle = handleAt(hit, pt.cx, pt.cy);
        if (onHandle) {
          state.drag = {
            mode: "resize",
            id: hit.id,
            handle: onHandle,
            startX: hit.x,
            startY: hit.y,
            startW: hit.w,
            startH: hit.h,
          };
        } else {
          state.drag = {
            mode: "move",
            id: hit.id,
            ox: pt.x - hit.x,
            oy: pt.y - hit.y,
          };
        }
        redraw();
        renderQueue();
      }
    });
    window.addEventListener("mousemove", (e) => {
      if (!state.img) return;
      const pt = canvasPoint(e);
      if (!state.drag) {
        const active = state.boxes.find((b) => b.id === state.activeId);
        const handle = active ? handleAt(active, pt.cx, pt.cy) : null;
        canvas.style.cursor = handle ? cursorForHandle(handle) : hitTest(pt) ? "grab" : "default";
        return;
      }
      const box = state.boxes.find((b) => b.id === state.drag.id);
      if (!box) return;
      if (state.drag.mode === "resize") {
        applyResize(box, state.drag.handle, pt.x, pt.y, {
          x: state.drag.startX,
          y: state.drag.startY,
          w: state.drag.startW,
          h: state.drag.startH,
        });
      } else {
        box.x = Math.min(Math.max(0, pt.x - state.drag.ox), state.naturalW - box.w);
        box.y = Math.min(Math.max(0, pt.y - state.drag.oy), state.naturalH - box.h);
      }
      canvas.style.cursor = state.drag.mode === "resize" ? cursorForHandle(state.drag.handle) : "grabbing";
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
          `${file.name || "pasted image"} · ${img.naturalWidth}×${img.naturalHeight}`;
        dropZone?.classList.add("hidden");
        canvas.classList.remove("hidden");
        addBox(state.preset);
        URL.revokeObjectURL(url);
      };
      img.src = url;
    }

    function loadFromClipboard(clipboardData) {
      if (!clipboardData) return false;
      const items = clipboardData.items ? Array.from(clipboardData.items) : [];
      const imageItem = items.find((item) => item.type.startsWith("image/"));
      if (imageItem) {
        const file = imageItem.getAsFile();
        if (file) {
          loadFile(file);
          return true;
        }
      }
      const files = clipboardData.files ? Array.from(clipboardData.files) : [];
      const imageFile = files.find((f) => f.type.startsWith("image/"));
      if (imageFile) {
        loadFile(imageFile);
        return true;
      }
      return false;
    }

    fileInput?.addEventListener("change", (e) => loadFile(e.target.files?.[0]));
    window.addEventListener("paste", (e) => {
      const tag = (e.target?.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || e.target?.isContentEditable) return;
      if (loadFromClipboard(e.clipboardData)) e.preventDefault();
    });
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
