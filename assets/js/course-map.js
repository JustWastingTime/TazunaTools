/** Client-side course map SVG renderer (ported from TazunaDiscordBot) */
(function () {
  const MAP_COLORS = {
    sky: "#A8D4F8",
    elevationFlat: "#8DB86A",
    elevationUphill: "#E89548",
    elevationDownhill: "#C49AA8",
    layoutBlank: "#B8B2A8",
    layoutStraight: "#A8BDD6",
    layoutCorner: "#EDCA72",
    zoneEarly: "#59B292",
    zoneMid: "#D4BC6A",
    zoneLate: "#F7A5A5",
    zoneSpurt: "#E195AB",
    zoneFallback: "#C9BFB4",
  };

  const COLORS = {
    background: "#1a1b1e",
    title: "#54e98a",
    warning: "#ffb4ab",
    axis: "#869486",
    tick: "#bbcbbb",
    meterText: "#869486",
    segmentBorder: "rgba(255,255,255,0.12)",
    activationLine: "#ff4d6d",
    activationBoxStroke: "#ff5c7a",
  };

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function escapeXml(text) {
    return String(text)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function normalizeSegment(segment, length) {
    const start = clamp(Number(segment.start ?? 0), 0, length);
    const end = clamp(Number(segment.end ?? 0), 0, length);
    if (end <= start) return null;
    return { ...segment, start, end };
  }

  function layoutColor(segment) {
    const label = String(segment?.label ?? "").toLowerCase();
    if (!label) return MAP_COLORS.layoutBlank;
    if (label.includes("corner")) return MAP_COLORS.layoutCorner;
    return MAP_COLORS.layoutStraight;
  }

  function zoneColor(segment) {
    const label = String(segment?.label ?? "").toLowerCase();
    if (label.includes("spurt")) return MAP_COLORS.zoneSpurt;
    if (label.includes("early")) return MAP_COLORS.zoneEarly;
    if (label.includes("mid")) return MAP_COLORS.zoneMid;
    if (label.includes("late")) return MAP_COLORS.zoneLate;
    return MAP_COLORS.zoneFallback;
  }

  function elevationColor(segment) {
    const type = String(segment?.type ?? "").toLowerCase();
    const label = String(segment?.label ?? "").toLowerCase();
    if (type.includes("uphill") || label.includes("uphill")) return MAP_COLORS.elevationUphill;
    if (type.includes("downhill") || label.includes("downhill")) return MAP_COLORS.elevationDownhill;
    return MAP_COLORS.elevationFlat;
  }

  function resolveDelta(segment) {
    const span = Number(segment?.end) - Number(segment?.start);
    if (!Number.isFinite(span) || span <= 0) return 0;
    const change = Number(segment?.change);
    if (Number.isFinite(change)) return (change / 100) * span;
    const type = String(segment?.type ?? "").toLowerCase();
    if (type.includes("uphill")) return span / 100;
    if (type.includes("downhill")) return -span / 100;
    return 0;
  }

  function parseLength(map) {
    if (Number.isFinite(Number(map.length))) return Number(map.length);
    const m = String(map.distance_meters || map.name || "").match(/(\d+)\s*m/i);
    return m ? Number(m[1]) : 0;
  }

  function markersFromActivationMap(skill, mapData) {
    const triggers = skill?.activation_map?.triggers;
    if (!Array.isArray(triggers)) return [];
    const length = parseLength(mapData);
    const markers = [];

    const pushBox = (start, end, color) => {
      const s = clamp(Math.min(start, end), 0, length);
      const e = clamp(Math.max(start, end), 0, length);
      if (e > s) markers.push({ type: "box", start: s, end: e, color: color || COLORS.activationBoxStroke });
    };
    const pushLine = (distance, color) => {
      if (!Number.isFinite(distance)) return;
      markers.push({ type: "line", distance: clamp(distance, 0, length), color: color || COLORS.activationLine });
    };

    const matchSeg = (segment, match) => {
      const label = String(segment?.label ?? "").toLowerCase();
      const m = String(match || "").toLowerCase();
      if (!m) return true;
      if (m === "corner") return label.includes("corner");
      if (m === "straight") return label.includes("straight");
      return label.includes(m);
    };

    for (const trigger of triggers) {
      const color = trigger.color;
      if (trigger.type === "line") {
        if (Number.isFinite(Number(trigger.distance))) {
          pushLine(Number(trigger.distance), color);
          continue;
        }
        const mode = String(trigger.distance_mode || trigger.distanceMode || "absolute").toLowerCase();
        const value = Number(trigger.value);
        if (Number.isFinite(value)) {
          pushLine(mode === "remaining" ? length - value : value, color);
          continue;
        }
        const target = String(trigger.target || "").toLowerCase();
        const source =
          target === "elevation" ? mapData.elevation : target === "zones" ? mapData.zones : mapData.layout;
        const matching = (source || []).filter((s) => matchSeg(s, trigger.match));
        const select = String(trigger.select || "").toLowerCase();
        const selected =
          select === "last"
            ? matching.slice(-1)
            : select === "first"
              ? matching.slice(0, 1)
              : matching;
        if (selected[0]) {
          const pos = String(trigger.line_position || trigger.position || "start").toLowerCase();
          pushLine(pos === "end" ? selected[0].end : selected[0].start, color);
        }
        continue;
      }

      if (trigger.type === "box") {
        let clipStart = 0;
        let clipEnd = length;
        const ratioStart = Number(trigger.clip_start_ratio ?? trigger.start_ratio);
        const ratioEnd = Number(trigger.clip_end_ratio ?? trigger.end_ratio);
        if (Number.isFinite(ratioStart)) clipStart = Math.max(0, ratioStart) * length;
        if (Number.isFinite(ratioEnd)) clipEnd = Math.min(1, ratioEnd) * length;
        if (Number.isFinite(Number(trigger.start)) && Number.isFinite(Number(trigger.end))) {
          pushBox(Math.max(Number(trigger.start), clipStart), Math.min(Number(trigger.end), clipEnd), color);
          continue;
        }
        const target = String(trigger.target || "layout").toLowerCase();
        const source =
          target === "elevation" ? mapData.elevation : target === "zones" ? mapData.zones : mapData.layout;
        let matching = (source || []).filter((s) => matchSeg(s, trigger.match));
        if (Array.isArray(trigger.corner_numbers) && trigger.corner_numbers.length) {
          matching = matching.filter((s) => {
            const n = String(s.label || "").match(/corner\s*(\d+)/i);
            return n && trigger.corner_numbers.map(Number).includes(Number(n[1]));
          });
        }
        const select = String(trigger.select || "").toLowerCase();
        const selected =
          select === "last"
            ? matching.slice(-1)
            : select === "first"
              ? matching.slice(0, 1)
              : matching;
        for (const seg of selected) {
          pushBox(Math.max(seg.start, clipStart), Math.min(seg.end, clipEnd), color);
        }
      }
    }
    return markers;
  }

  function buildSvg(mapData, options = {}) {
    const length = parseLength(mapData);
    if (!length) throw new Error("Map length missing");
    const width = options.width || 1200;
    const rowHeight = 48;
    const margin = { top: 72, right: 36, bottom: 28, left: 36 };
    const trackWidth = width - margin.left - margin.right;
    const trackTop = margin.top;
    const height = options.height || trackTop + rowHeight * 3 + 70;
    const title = mapData.name || `Course ${length}m`;
    const warningText = options.warningText || "";
    const markers = options.markers || [];

    const xFrom = (d) => margin.left + (clamp(d, 0, length) / length) * trackWidth;

    const rows = [
      {
        key: "elevation",
        y: trackTop,
        segments: (mapData.elevation || []).map((s) => normalizeSegment(s, length)).filter(Boolean),
      },
      {
        key: "layout",
        y: trackTop + rowHeight,
        segments: (mapData.layout || []).map((s) => normalizeSegment(s, length)).filter(Boolean),
      },
      {
        key: "zones",
        y: trackTop + rowHeight * 2,
        segments: (mapData.zones || []).map((s) => normalizeSegment(s, length)).filter(Boolean),
      },
    ];

    const parts = [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
      `<rect width="100%" height="100%" fill="${COLORS.background}"/>`,
      `<text x="${width / 2}" y="42" text-anchor="middle" fill="${COLORS.title}" font-size="28" font-family="Geist,sans-serif" font-weight="700">${escapeXml(title)}</text>`,
    ];
    if (warningText) {
      parts.push(
        `<text x="${width / 2}" y="64" text-anchor="middle" fill="${COLORS.warning}" font-size="14" font-family="Geist,sans-serif" font-weight="700">${escapeXml(warningText)}</text>`
      );
    }

    // Elevation as flat colored segments (simplified)
    for (const row of rows) {
      if (row.key === "elevation") {
        const startX = xFrom(0);
        parts.push(
          `<rect x="${startX}" y="${row.y}" width="${trackWidth}" height="${rowHeight}" fill="${MAP_COLORS.sky}" stroke="${COLORS.segmentBorder}"/>`
        );
        for (const seg of row.segments) {
          const x = xFrom(seg.start);
          const w = xFrom(seg.end) - x;
          parts.push(
            `<rect x="${x.toFixed(2)}" y="${row.y + 8}" width="${w.toFixed(2)}" height="${rowHeight - 8}" fill="${elevationColor(seg)}" opacity="0.9"/>`
          );
        }
        continue;
      }
      for (const seg of row.segments) {
        const x = xFrom(seg.start);
        const w = xFrom(seg.end) - x;
        const fill = row.key === "layout" ? layoutColor(seg) : zoneColor(seg);
        const label = seg.label || "";
        parts.push(
          `<rect x="${x.toFixed(2)}" y="${row.y}" width="${w.toFixed(2)}" height="${rowHeight}" fill="${fill}" stroke="${COLORS.segmentBorder}"/>`
        );
        if (label && w > 40) {
          parts.push(
            `<text x="${(x + w / 2).toFixed(2)}" y="${row.y + rowHeight / 2 + 5}" text-anchor="middle" fill="#20262e" font-size="13" font-family="Geist,sans-serif" font-weight="600">${escapeXml(label)}</text>`
          );
        }
      }
    }

    const trackBottom = trackTop + rowHeight * 3;
    for (const marker of markers) {
      if (marker.type === "box") {
        const x = xFrom(marker.start);
        const w = xFrom(marker.end) - x;
        parts.push(
          `<rect x="${x.toFixed(2)}" y="${trackTop}" width="${w.toFixed(2)}" height="${rowHeight * 3}" fill="${marker.color}" fill-opacity="0.18" stroke="${marker.color}" stroke-width="2"/>`
        );
      } else if (marker.type === "line") {
        const x = xFrom(marker.distance);
        parts.push(
          `<line x1="${x.toFixed(2)}" y1="${trackTop}" x2="${x.toFixed(2)}" y2="${trackBottom}" stroke="${marker.color}" stroke-width="2.5"/>`
        );
      }
    }

    const step = length <= 1200 ? 100 : length <= 2000 ? 200 : 300;
    for (let d = 0; d <= length; d += step) {
      const x = xFrom(d);
      parts.push(
        `<line x1="${x}" y1="${trackBottom + 4}" x2="${x}" y2="${trackBottom + 12}" stroke="${COLORS.tick}"/>`,
        `<text x="${x}" y="${trackBottom + 28}" text-anchor="middle" fill="${COLORS.meterText}" font-size="11" font-family="Space Mono,monospace">${d}</text>`
      );
    }

    parts.push("</svg>");
    return parts.join("");
  }

  function evaluateRequirements(skill, track) {
    const req = skill?.activation_map?.requirements;
    if (!req || !track) return { ok: true, reasons: [] };
    const reasons = [];
    const check = (key, actual, map) => {
      const wanted = req[key];
      if (!Array.isArray(wanted) || !wanted.length || actual == null) return;
      const norm = String(actual).toLowerCase();
      const hit = wanted.some((w) => norm.includes(String(w).toLowerCase()) || String(w).toLowerCase().includes(norm));
      if (!hit) reasons.push(`${key}: need ${wanted.join("/")}, got ${actual}`);
    };
    check("terrains", track.terrain);
    check("racetracks", track.racetrack);
    check("directions", track.direction);
    check("grounds", track.ground);
    check("seasons", track.season);
    check("weathers", track.weather);
    if (Array.isArray(req.distance_types) && track.distance_type) {
      const hit = req.distance_types.some(
        (d) => String(track.distance_type).toLowerCase().includes(String(d).toLowerCase())
      );
      if (!hit) reasons.push(`distance_types: need ${req.distance_types.join("/")}, got ${track.distance_type}`);
    }
    return { ok: reasons.length === 0, reasons };
  }

  window.CourseMap = {
    parseLength,
    buildSvg,
    markersFromActivationMap,
    evaluateRequirements,
  };
})();
