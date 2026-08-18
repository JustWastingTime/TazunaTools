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
    positionKeepLine: "#934761",
  };

  const FONT = "Geist, Rubik, sans-serif";

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function lower(value) {
    return String(value ?? "").toLowerCase();
  }

  function escapeXml(text) {
    return String(text)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&apos;");
  }

  function toMeters(distanceValue) {
    if (typeof distanceValue === "number") return distanceValue;
    const parsed = parseInt(String(distanceValue ?? "").replace(/[^\d]/g, ""), 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function parseLength(map) {
    return (
      toMeters(map?.length) ||
      toMeters(map?.distance_meters) ||
      toMeters(String(map?.name || "").match(/(\d+)\s*m/i)?.[0]) ||
      0
    );
  }

  function inferDistanceTypeFromMeters(distanceValue) {
    const meters = toMeters(distanceValue);
    if (!meters || meters <= 0) return null;
    if (meters <= 1400) return "Sprint";
    if (meters <= 1800) return "Mile";
    if (meters <= 2400) return "Medium";
    return "Long";
  }

  function normalizeDirection(value) {
    const v = lower(value);
    if (v.includes("left") || v.includes("counterclockwise")) return "counterclockwise";
    if (v.includes("right") || v.includes("clockwise")) return "clockwise";
    return value ?? "";
  }

  function normalizeStatThresholds(rawMap) {
    const source =
      rawMap?.stat_thresholds ??
      rawMap?.statThresholds ??
      rawMap?.stat_tresholds ??
      rawMap?.stat_treshold ??
      rawMap?.stat_threshold ??
      "";
    if (Array.isArray(source)) return source.map((v) => String(v).trim()).filter(Boolean);
    const text = String(source ?? "").trim();
    if (!text) return [];
    return text
      .split(/(?:\s*&\s*|\s*,\s*|\s*\/\s*|\s+\+\s+)/g)
      .map((v) => v.trim())
      .filter(Boolean);
  }

  function normalizeDistancePoints(points, length) {
    const values = Array.isArray(points) ? points : [points];
    return [
      ...new Set(
        values
          .map((value) => Number(value))
          .filter((value) => Number.isFinite(value) && value >= 0 && value <= length)
      ),
    ].sort((a, b) => a - b);
  }

  function normalizeSegment(segment, length) {
    const start = clamp(Number(segment.start ?? 0), 0, length);
    const end = clamp(Number(segment.end ?? 0), 0, length);
    if (end <= start) return null;
    return { ...segment, start, end };
  }

  function normalizeMap(rawMap) {
    if (!rawMap || typeof rawMap !== "object") return null;
    const length = parseLength(rawMap);
    if (!length) return null;
    const elevation = (rawMap.elevation || []).map((s) => normalizeSegment(s, length)).filter(Boolean);
    const layout = (rawMap.layout || []).map((s) => normalizeSegment(s, length)).filter(Boolean);
    const zones = (rawMap.zones || []).map((s) => normalizeSegment(s, length)).filter(Boolean);
    const elevationScale = Number(
      rawMap.elevation_scale ?? rawMap.elevationScale ?? rawMap.elevation_range ?? rawMap.elevationRange
    );
    return {
      ...rawMap,
      length,
      elevation,
      layout,
      zones,
      positionKeepEnds: normalizeDistancePoints(
        rawMap.position_keep_ends ?? rawMap.positionKeepEnds ?? rawMap.position_keep_end,
        length
      ),
      statThresholds: normalizeStatThresholds(rawMap),
      elevationScale: Number.isFinite(elevationScale) && elevationScale > 0 ? elevationScale : null,
    };
  }

  function layoutColor(segment) {
    const label = lower(segment?.label);
    if (!label) return MAP_COLORS.layoutBlank;
    if (label.includes("corner")) return MAP_COLORS.layoutCorner;
    return MAP_COLORS.layoutStraight;
  }

  function zoneColor(segment) {
    const label = lower(segment?.label);
    if (label.includes("spurt")) return MAP_COLORS.zoneSpurt;
    if (label.includes("early")) return MAP_COLORS.zoneEarly;
    if (label.includes("mid")) return MAP_COLORS.zoneMid;
    if (label.includes("late")) return MAP_COLORS.zoneLate;
    return MAP_COLORS.zoneFallback;
  }

  function elevationColor(segment) {
    const type = lower(segment?.type);
    const label = lower(segment?.label);
    if (type.includes("uphill") || label.includes("uphill")) return MAP_COLORS.elevationUphill;
    if (type.includes("downhill") || label.includes("downhill")) return MAP_COLORS.elevationDownhill;
    return MAP_COLORS.elevationFlat;
  }

  function resolveDelta(segment) {
    const span = Number(segment?.end) - Number(segment?.start);
    if (!Number.isFinite(span) || span <= 0) return 0;
    const change = Number(segment?.change);
    if (Number.isFinite(change)) return (change / 100) * span;
    const type = lower(segment?.type);
    if (type.includes("uphill")) return span / 100;
    if (type.includes("downhill")) return -span / 100;
    return 0;
  }

  function isLayoutCornerSegment(segment) {
    return lower(segment?.label).includes("corner");
  }

  function layoutSegmentMatches(segment, match) {
    const normalizedMatch = lower(match);
    if (!normalizedMatch) return true;
    if (normalizedMatch === "not_a_corner" || normalizedMatch === "not_corner" || normalizedMatch === "not corner") {
      return !isLayoutCornerSegment(segment);
    }
    return lower(segment?.label).includes(normalizedMatch);
  }

  function collectSkillConditionText(skill, includeDescriptions = false) {
    const sources = [];
    if (Array.isArray(skill.preconditions)) sources.push(...skill.preconditions);
    if (Array.isArray(skill.effect)) {
      for (const effect of skill.effect) {
        if (Array.isArray(effect.conditions)) sources.push(...effect.conditions);
        if (includeDescriptions && effect.description) sources.push(effect.description);
      }
    }
    if (includeDescriptions && skill.description) sources.push(skill.description);
    return sources.map((v) => lower(v)).filter(Boolean);
  }

  function pushUniqueBox(markers, start, end, color = "#d11f2a", triggerBehavior) {
    const exists = markers.some(
      (m) =>
        m.type === "box" &&
        m.start === start &&
        m.end === end &&
        (m.color ?? "#d11f2a") === (color ?? "#d11f2a") &&
        (m.trigger_behavior ?? "") === (triggerBehavior ?? "")
    );
    if (!exists) {
      const marker = { type: "box", start, end, color, fillOpacity: 0.16 };
      if (triggerBehavior) marker.trigger_behavior = triggerBehavior;
      markers.push(marker);
    }
  }

  function pushUniqueLine(markers, distance, color = "#d11f2a") {
    const normalized = Math.max(0, Math.round(distance));
    const exists = markers.some((m) => m.type === "line" && m.distance === normalized);
    if (!exists) markers.push({ type: "line", distance: normalized, color });
  }

  function findZoneByLabel(mapData, candidates) {
    if (!mapData?.zones) return null;
    return (
      mapData.zones.find((segment) => {
        const label = lower(segment.label);
        return candidates.some((candidate) => label.includes(candidate));
      }) ?? null
    );
  }

  function phaseWindowFromName(mapData, phaseName) {
    const phase = lower(phaseName);
    const earlyZone = findZoneByLabel(mapData, ["opening", "early"]);
    const midZone = findZoneByLabel(mapData, ["middle", "mid"]);
    const lateZone = findZoneByLabel(mapData, ["late", "final"]);
    const spurtZone = findZoneByLabel(mapData, ["spurt"]);
    const cornerSegments = (mapData.layout ?? []).filter((segment) => lower(segment.label).includes("corner"));
    const finalCorner = cornerSegments.length ? cornerSegments[cornerSegments.length - 1] : null;

    if (phase === "early") return earlyZone ? { start: earlyZone.start, end: earlyZone.end } : null;
    if (phase === "mid" || phase === "middle") return midZone ? { start: midZone.start, end: midZone.end } : null;
    if (phase === "late") return lateZone ? { start: lateZone.start, end: lateZone.end } : null;
    if (phase === "spurt") return spurtZone ? { start: spurtZone.start, end: spurtZone.end } : null;
    if (phase === "first_half") return { start: 0, end: mapData.length * 0.5 };
    if (phase === "late_and_beyond") {
      const start = lateZone?.start ?? spurtZone?.start ?? mapData.length * 0.75;
      return { start, end: mapData.length };
    }
    if (phase === "final_corner_and_beyond") {
      const start = finalCorner?.start ?? (lateZone?.start ?? mapData.length * 0.75);
      return { start, end: mapData.length };
    }
    if (phase === "second_half") return { start: mapData.length * 0.5, end: mapData.length };
    return null;
  }

  function resolvePhaseClipFromSpec(mapData, phaseSpec) {
    const names = Array.isArray(phaseSpec) ? phaseSpec : phaseSpec ? [phaseSpec] : [];
    if (!names.length) return null;
    let start = 0;
    let end = mapData.length;
    let matched = false;
    for (const name of names) {
      const window = phaseWindowFromName(mapData, name);
      if (!window) continue;
      matched = true;
      start = Math.max(start, window.start);
      end = Math.min(end, window.end);
    }
    if (!matched || end <= start) return null;
    return { start, end };
  }

  function inferPhaseWindowFromTexts(texts, mapData) {
    if (!texts.length) return null;
    const earlyZone = findZoneByLabel(mapData, ["opening", "early"]);
    const midZone = findZoneByLabel(mapData, ["middle", "mid"]);
    const lateZone = findZoneByLabel(mapData, ["late", "final"]);
    const spurtZone = findZoneByLabel(mapData, ["spurt"]);
    const cornerSegments = (mapData.layout ?? []).filter((segment) => lower(segment.label).includes("corner"));
    const finalCorner = cornerSegments.length ? cornerSegments[cornerSegments.length - 1] : null;

    const hasFinalCornerBeyond = texts.some((t) => t.includes("final corner and beyond"));
    const hasLateAndBeyond = texts.some((t) => t.includes("late race and beyond"));
    if (hasFinalCornerBeyond && hasLateAndBeyond) {
      return resolvePhaseClipFromSpec(mapData, ["final_corner_and_beyond", "late_and_beyond"]);
    }
    if (hasFinalCornerBeyond) {
      const start = finalCorner?.start ?? (lateZone?.start ?? mapData.length * 0.75);
      return { start, end: mapData.length, forceFullRange: true };
    }
    if (hasLateAndBeyond) {
      const start = lateZone?.start ?? spurtZone?.start ?? mapData.length * 0.75;
      return { start, end: mapData.length };
    }
    if (texts.some((t) => t.includes("last spurt")) || texts.some((t) => t.includes("spurt mode"))) {
      const start = lateZone?.start ?? (spurtZone?.start ?? mapData.length * 0.75);
      return { start, end: mapData.length };
    }
    if (texts.some((t) => t.includes("second half of the race"))) {
      return { start: mapData.length * 0.5, end: mapData.length };
    }
    if (texts.some((t) => t.includes("early race or mid race"))) {
      if (earlyZone && midZone) return { start: earlyZone.start, end: midZone.end };
      if (earlyZone) return { start: earlyZone.start, end: earlyZone.end };
      if (midZone) return { start: midZone.start, end: midZone.end };
    }
    if (texts.some((t) => t.includes("late race")) && lateZone) return { start: lateZone.start, end: lateZone.end };
    if (texts.some((t) => t.includes("mid race")) && midZone) return { start: midZone.start, end: midZone.end };
    if (texts.some((t) => t.includes("early race")) && earlyZone) return { start: earlyZone.start, end: earlyZone.end };
    return null;
  }

  function inferAutoPhaseWindow(skill, mapData) {
    return inferPhaseWindowFromTexts(collectSkillConditionText(skill, false), mapData);
  }

  function inferMarkersFromConditionSet(conditionTexts, mapData) {
    const texts = (conditionTexts ?? []).map((t) => lower(t)).filter(Boolean);
    if (!texts.length) return [];
    const markers = [];
    const phaseWindow = inferPhaseWindowFromTexts(texts, mapData);
    const clipStart = phaseWindow?.start ?? 0;
    const clipEnd = phaseWindow?.end ?? mapData.length;
    const triggerBehavior = texts.some((t) => t.includes("random point")) ? "random" : "asap";
    const addClippedBox = (start, end) => {
      const clippedStart = Math.max(start, clipStart);
      const clippedEnd = Math.min(end, clipEnd);
      if (clippedEnd > clippedStart) pushUniqueBox(markers, clippedStart, clippedEnd, "#d11f2a", triggerBehavior);
    };

    const cornerSegments = (mapData.layout ?? []).filter((s) => lower(s.label).includes("corner"));
    const straightSegments = (mapData.layout ?? []).filter((s) => lower(s.label).includes("straight"));
    const finalCorner = cornerSegments.length ? cornerSegments[cornerSegments.length - 1] : null;
    const finalStraight = straightSegments.length ? straightSegments[straightSegments.length - 1] : null;
    const mentionsCorner = texts.some((t) => t.includes("corner"));
    const mentionsFinalCorner = texts.some((t) => t.includes("final corner"));
    const mentionsNotFinalCorner = texts.some((t) => t.includes("not final corner"));
    const mentionsNotACorner = texts.some((t) => t.includes("not a corner"));
    const mentionsStraight = texts.some((t) => t.includes("straight"));
    const mentionsFinalStraight = texts.some((t) => t.includes("final straight"));

    if (phaseWindow?.forceFullRange && (mentionsCorner || mentionsStraight || mentionsNotACorner)) {
      addClippedBox(clipStart, clipEnd);
    } else {
      if (mentionsCorner) {
        let selected = cornerSegments;
        if (mentionsFinalCorner && !mentionsNotFinalCorner) selected = finalCorner ? [finalCorner] : [];
        if (mentionsNotFinalCorner && selected.length > 0) selected = selected.slice(0, Math.max(0, selected.length - 1));
        for (const segment of selected) addClippedBox(segment.start, segment.end);
      }
      if (mentionsNotACorner) {
        for (const segment of (mapData.layout ?? []).filter((s) => !isLayoutCornerSegment(s))) {
          addClippedBox(segment.start, segment.end);
        }
      } else if (mentionsStraight) {
        const selected = mentionsFinalStraight ? (finalStraight ? [finalStraight] : []) : straightSegments;
        for (const segment of selected) addClippedBox(segment.start, segment.end);
      }
    }

    for (const text of texts) {
      if (text.includes("opening leg") || text.includes("early leg")) {
        for (const segment of mapData.zones) {
          if (lower(segment.label).includes("opening") || lower(segment.label).includes("early")) {
            addClippedBox(segment.start, segment.end);
          }
        }
      }
      if (text.includes("middle leg") || text.includes("mid leg")) {
        for (const segment of mapData.zones) {
          if (lower(segment.label).includes("middle") || lower(segment.label).includes("mid")) {
            addClippedBox(segment.start, segment.end);
          }
        }
      }
      if (text.includes("final leg") || text.includes("late leg") || text.includes("late race")) {
        for (const segment of mapData.zones) {
          if (lower(segment.label).includes("final") || lower(segment.label).includes("late")) {
            addClippedBox(segment.start, segment.end);
          }
        }
      }
      if (text.includes("last spurt")) {
        for (const segment of mapData.zones) {
          if (lower(segment.label).includes("spurt")) addClippedBox(segment.start, segment.end);
        }
      }
      if (text.includes("uphill")) {
        for (const segment of mapData.elevation) {
          if (segment.type === "uphill" || lower(segment.label).includes("uphill")) addClippedBox(segment.start, segment.end);
        }
      }
      if (text.includes("downhill")) {
        for (const segment of mapData.elevation) {
          if (segment.type === "downhill" || lower(segment.label).includes("downhill")) {
            addClippedBox(segment.start, segment.end);
          }
        }
      }
      const remainingMatch = text.match(/(\d+)\s*m(?:eters?)?\s*remaining/);
      if (remainingMatch) pushUniqueLine(markers, mapData.length - Number(remainingMatch[1]));
      const afterMatch = text.match(/after\s*(\d+)\s*m(?:eters?)?/);
      if (afterMatch) pushUniqueLine(markers, Number(afterMatch[1]));
    }
    return markers;
  }

  function inferSkillMarkers(skill, mapData) {
    if (!skill || !mapData) return [];
    const markers = [];
    const merge = (branchMarkers) => {
      for (const marker of branchMarkers) {
        if (marker.type === "box") pushUniqueBox(markers, marker.start, marker.end, marker.color, marker.trigger_behavior);
        if (marker.type === "line") pushUniqueLine(markers, marker.distance, marker.color);
      }
    };
    if (Array.isArray(skill.effect) && skill.effect.length > 0) {
      for (const effect of skill.effect) {
        merge(inferMarkersFromConditionSet(Array.isArray(effect?.conditions) ? effect.conditions : [], mapData));
      }
    } else {
      merge(inferMarkersFromConditionSet(collectSkillConditionText(skill, true), mapData));
    }
    return markers;
  }

  function markersFromActivationMap(skill, mapData, options = {}) {
    const activationMap = skill?.activation_map;
    if (!activationMap || !Array.isArray(activationMap.triggers)) return [];
    const markers = [];
    const allowAutoPhaseInference = options.allowAutoPhaseInference !== false;
    const autoPhaseWindow = allowAutoPhaseInference ? inferAutoPhaseWindow(skill, mapData) : null;

    for (const trigger of activationMap.triggers) {
      const color = trigger.color ?? "#d11f2a";
      if (trigger.type === "line") {
        if (Number.isFinite(Number(trigger.distance))) {
          pushUniqueLine(markers, Number(trigger.distance), color);
          continue;
        }
        const target = lower(trigger.target ?? "");
        const match = lower(trigger.match ?? "");
        const selectMode = lower(trigger.select ?? "");
        const linePosition = lower(trigger.line_position ?? trigger.position ?? "start");
        if (target === "layout" || target === "elevation" || target === "zones") {
          const source = target === "elevation" ? mapData.elevation : target === "zones" ? mapData.zones : mapData.layout;
          const matching = (source || []).filter((segment) => layoutSegmentMatches(segment, match));
          const selected =
            selectMode === "last"
              ? matching.length
                ? [matching[matching.length - 1]]
                : []
              : selectMode === "first"
                ? matching.length
                  ? [matching[0]]
                  : []
                : matching;
          if (selected.length > 0) {
            const segment = selected[0];
            pushUniqueLine(markers, linePosition === "end" ? segment.end : segment.start, color);
            continue;
          }
        }
        const mode = lower(trigger.distance_mode ?? trigger.distanceMode ?? "absolute");
        const value = Number(trigger.value);
        if (!Number.isFinite(value)) continue;
        pushUniqueLine(markers, mode === "remaining" ? mapData.length - value : value, color);
        continue;
      }

      if (trigger.type !== "box") continue;

      const triggerBehavior = trigger.trigger_behavior ?? trigger.behavior;
      const ratioStart = Number(trigger.clip_start_ratio ?? trigger.start_ratio);
      const ratioEnd = Number(trigger.clip_end_ratio ?? trigger.end_ratio);
      const absoluteStart = Number(trigger.clip_start ?? trigger.start_m ?? trigger.range_start);
      const absoluteEnd = Number(trigger.clip_end ?? trigger.end_m ?? trigger.range_end);
      const remainingGte = Number(trigger.remaining_gte ?? trigger.min_remaining ?? trigger.remaining_min);
      const remainingLte = Number(trigger.remaining_lte ?? trigger.max_remaining ?? trigger.remaining_max);

      let clipStart = 0;
      let clipEnd = mapData.length;
      if (Number.isFinite(ratioStart)) clipStart = Math.max(0, ratioStart) * mapData.length;
      if (Number.isFinite(ratioEnd)) clipEnd = Math.min(1, ratioEnd) * mapData.length;
      if (Number.isFinite(absoluteStart)) clipStart = absoluteStart;
      if (Number.isFinite(absoluteEnd)) clipEnd = absoluteEnd;
      if (Number.isFinite(remainingGte)) clipEnd = Math.min(clipEnd, mapData.length - remainingGte);
      if (Number.isFinite(remainingLte)) clipStart = Math.max(clipStart, mapData.length - remainingLte);

      const explicitPhaseWindow = resolvePhaseClipFromSpec(mapData, trigger.phases ?? trigger.phase);
      if (explicitPhaseWindow) {
        clipStart = Math.max(clipStart, explicitPhaseWindow.start);
        clipEnd = Math.min(clipEnd, explicitPhaseWindow.end);
      }
      const hasExplicitPhase = Boolean(trigger.phases ?? trigger.phase);
      const useAutoPhaseClip =
        !hasExplicitPhase && trigger.disable_auto_phase_clip !== true && trigger.apply_auto_phase_clip !== false;
      if (autoPhaseWindow && useAutoPhaseClip) {
        clipStart = Math.max(clipStart, autoPhaseWindow.start);
        clipEnd = Math.min(clipEnd, autoPhaseWindow.end);
      }

      const pushClippedBox = (start, end) => {
        const clippedStart = Math.max(start, clipStart);
        const clippedEnd = Math.min(end, clipEnd);
        if (clippedEnd > clippedStart) pushUniqueBox(markers, clippedStart, clippedEnd, color, triggerBehavior);
      };

      const directRangeMode = lower(trigger.distance_mode ?? trigger.distanceMode ?? "absolute");
      const rawStart = Number(
        trigger.start ?? trigger.start_m ?? trigger.range_start ?? trigger.value_start ?? trigger.value_from ?? trigger.remaining_start
      );
      const rawEnd = Number(
        trigger.end ??
          trigger.end_m ??
          trigger.range_end ??
          trigger.value_end ??
          trigger.value_to ??
          trigger.remaining_end ??
          trigger.value
      );
      if (Number.isFinite(rawStart) && Number.isFinite(rawEnd)) {
        const startDistance = directRangeMode === "remaining" ? mapData.length - rawStart : rawStart;
        const endDistance = directRangeMode === "remaining" ? mapData.length - rawEnd : rawEnd;
        pushClippedBox(Math.min(startDistance, endDistance), Math.max(startDistance, endDistance));
        continue;
      }

      const target = lower(trigger.target ?? "layout");
      const source = target === "elevation" ? mapData.elevation : target === "zones" ? mapData.zones : mapData.layout;
      const match = lower(trigger.match ?? "");
      const labels = Array.isArray(trigger.labels) ? trigger.labels.map((v) => lower(v)) : [];
      const cornerNumbers = Array.isArray(trigger.corner_numbers) ? trigger.corner_numbers.map((v) => Number(v)) : [];
      const selectMode = lower(trigger.select ?? "");
      const excludeSelectMode = lower(trigger.exclude_select ?? "");
      const requireTags = Array.isArray(trigger.require_tags)
        ? trigger.require_tags.map((v) => lower(v))
        : trigger.require_tag
          ? [lower(trigger.require_tag)]
          : [];
      const localStartRatio = Number(trigger.clip_within_segment_start_ratio ?? trigger.local_start_ratio);
      const localEndRatio = Number(trigger.clip_within_segment_end_ratio ?? trigger.local_end_ratio);
      const applyLocalClip = Number.isFinite(localStartRatio) || Number.isFinite(localEndRatio);

      const matchingSegments = [];
      for (const segment of source || []) {
        const label = lower(segment.label);
        let ok = false;
        if (match) ok = layoutSegmentMatches(segment, match);
        if (!ok && labels.length && labels.some((v) => label.includes(v))) ok = true;
        if (!ok && cornerNumbers.length && cornerNumbers.some((n) => label.includes(`corner ${n}`))) ok = true;
        if (!ok && !match && !labels.length && !cornerNumbers.length) ok = true;
        if (ok && requireTags.length) {
          const segTags = Array.isArray(segment.tags) ? segment.tags.map((v) => lower(v)) : [];
          if (!requireTags.every((t) => segTags.includes(t))) ok = false;
        }
        if (ok) matchingSegments.push(segment);
      }

      const selectedSegments =
        selectMode === "last"
          ? matchingSegments.length
            ? [matchingSegments[matchingSegments.length - 1]]
            : []
          : selectMode === "first"
            ? matchingSegments.length
              ? [matchingSegments[0]]
              : []
            : matchingSegments;
      const filteredSegments =
        excludeSelectMode === "last"
          ? selectedSegments.slice(0, Math.max(0, selectedSegments.length - 1))
          : excludeSelectMode === "first"
            ? selectedSegments.slice(1)
            : selectedSegments;

      const hasExplicitSelection = Boolean(
        match || labels.length || cornerNumbers.length || selectMode || excludeSelectMode || requireTags.length
      );

      if (
        hasExplicitPhase &&
        !hasExplicitSelection &&
        !Number.isFinite(ratioStart) &&
        !Number.isFinite(ratioEnd) &&
        trigger.target == null
      ) {
        if (applyLocalClip) {
          const phaseLength = clipEnd - clipStart;
          const localStart = Number.isFinite(localStartRatio)
            ? clipStart + Math.max(0, localStartRatio) * phaseLength
            : clipStart;
          const localEnd = Number.isFinite(localEndRatio)
            ? clipStart + Math.min(1, localEndRatio) * phaseLength
            : clipEnd;
          pushClippedBox(localStart, localEnd);
        } else {
          pushClippedBox(clipStart, clipEnd);
        }
        continue;
      }

      if (autoPhaseWindow?.forceFullRange && filteredSegments.length > 0 && useAutoPhaseClip && !hasExplicitSelection) {
        pushUniqueBox(markers, clipStart, clipEnd, color, triggerBehavior);
        continue;
      }

      for (const segment of filteredSegments) {
        if (!applyLocalClip) {
          pushClippedBox(segment.start, segment.end);
          continue;
        }
        const segmentLength = segment.end - segment.start;
        const localStart = Number.isFinite(localStartRatio)
          ? segment.start + Math.max(0, localStartRatio) * segmentLength
          : segment.start;
        const localEnd = Number.isFinite(localEndRatio)
          ? segment.start + Math.min(1, localEndRatio) * segmentLength
          : segment.end;
        pushClippedBox(localStart, localEnd);
      }
    }
    return markers;
  }

  function inferTextTrackRequirements(skill) {
    const texts = collectSkillConditionText(skill, false);
    const requirements = { distanceTypes: new Set(), terrains: new Set(), directions: new Set() };
    for (const text of texts) {
      for (const match of text.match(/\b(sprint|mile|medium|long)\b/g) ?? []) requirements.distanceTypes.add(match);
      for (const match of text.match(/\b(turf|dirt)\b/g) ?? []) requirements.terrains.add(match);
      if (text.includes("counterclockwise") || text.includes("left-handed") || text.includes("left handed")) {
        requirements.directions.add("counterclockwise");
      }
      if (text.includes("clockwise") || text.includes("right-handed") || text.includes("right handed")) {
        requirements.directions.add("clockwise");
      }
    }
    return requirements;
  }

  function requirementsFromActivationMap(activationMap) {
    const req = activationMap?.requirements;
    if (!req) return null;
    return {
      distanceTypes: new Set((req.distance_types ?? req.distanceTypes ?? []).map((v) => lower(v))),
      terrains: new Set((req.terrains ?? req.terrain ?? []).map((v) => lower(v))),
      directions: new Set((req.directions ?? req.direction ?? []).map((v) => lower(v))),
      racetracks: new Set((req.racetracks ?? req.racetrack ?? []).map((v) => lower(v))),
      grounds: new Set((req.grounds ?? req.ground ?? []).map((v) => lower(v))),
      seasons: new Set((req.seasons ?? req.season ?? []).map((v) => lower(v))),
      weathers: new Set((req.weathers ?? req.weather ?? []).map((v) => lower(v))),
    };
  }

  function evaluateTrackCompatibility(cmTrack, requirements) {
    if (!requirements) return { doesNotWork: false, reasons: [] };
    const track = {
      distanceType: lower(cmTrack?.distance_type ?? inferDistanceTypeFromMeters(cmTrack?.distance_meters)),
      terrain: lower(cmTrack?.terrain),
      direction: normalizeDirection(cmTrack?.direction),
      racetrack: lower(cmTrack?.racetrack),
      ground: lower(cmTrack?.ground),
      season: lower(cmTrack?.season),
      weather: lower(cmTrack?.weather),
    };
    const reasons = [];
    if (requirements.distanceTypes?.size && !requirements.distanceTypes.has(track.distanceType)) reasons.push("distance type mismatch");
    if (requirements.terrains?.size && !requirements.terrains.has(track.terrain)) reasons.push("terrain mismatch");
    if (requirements.directions?.size && !requirements.directions.has(track.direction)) reasons.push("direction mismatch");
    if (requirements.racetracks?.size && !requirements.racetracks.has(track.racetrack)) reasons.push("racetrack mismatch");
    if (requirements.grounds?.size && !requirements.grounds.has(track.ground)) reasons.push("ground mismatch");
    if (requirements.seasons?.size && !requirements.seasons.has(track.season)) reasons.push("season mismatch");
    if (requirements.weathers?.size && !requirements.weathers.has(track.weather)) reasons.push("weather mismatch");
    return { doesNotWork: reasons.length > 0, reasons };
  }

  function resolveSkillActivationOverlay(skill, cm, mapData) {
    if (!skill || !mapData) {
      return { shouldShowChart: false, markers: [], doesNotWork: false, reasons: [] };
    }
    const activationMap = skill.activation_map;
    const hasActivationMapConfig = Boolean(activationMap && typeof activationMap === "object");
    const explicitRequirements = requirementsFromActivationMap(activationMap);
    const fallbackRequirements = hasActivationMapConfig ? null : inferTextTrackRequirements(skill);
    const requirements = explicitRequirements ?? fallbackRequirements;
    const compatibility = evaluateTrackCompatibility(cm?.track, requirements);
    const hasExplicitActivationMap = Boolean(activationMap && Array.isArray(activationMap.triggers));
    const explicitMarkers = hasExplicitActivationMap
      ? markersFromActivationMap(skill, mapData, { allowAutoPhaseInference: false })
      : [];
    const markers = hasExplicitActivationMap
      ? explicitMarkers
      : hasActivationMapConfig
        ? []
        : inferSkillMarkers(skill, mapData);
    const rawConditionTexts = collectSkillConditionText(skill, false);
    const isRandomPointSkill = rawConditionTexts.some((text) => text.includes("random point"));
    const defaultBehavior = isRandomPointSkill ? "random" : "asap";
    const normalizedMarkers = markers.map((marker) =>
      marker.type === "box" && !marker.trigger_behavior ? { ...marker, trigger_behavior: defaultBehavior } : marker
    );
    const hasActivationWindow = markers.length > 0;

    if (compatibility.doesNotWork) {
      if (!hasActivationWindow) {
        return { shouldShowChart: false, markers: [], doesNotWork: false, reasons: [], usedActivationMap: Boolean(activationMap) };
      }
      return { shouldShowChart: true, markers: [], doesNotWork: true, reasons: compatibility.reasons, usedActivationMap: Boolean(activationMap) };
    }

    const explicitShow = activationMap?.show_chart;
    const shouldShowChart = explicitShow === false ? false : explicitShow === true ? true : hasActivationWindow;
    return {
      shouldShowChart,
      markers: normalizedMarkers,
      doesNotWork: false,
      reasons: [],
      usedActivationMap: Boolean(activationMap),
    };
  }

  function mergeTouchingBoxMarkers(markers, length) {
    const tolerance = 0.0001;
    const normalized = markers
      .map((marker) => {
        const start = clamp(Number(marker.start ?? 0), 0, length);
        const end = clamp(Number(marker.end ?? 0), 0, length);
        if (end <= start) return null;
        return { ...marker, type: "box", start, end };
      })
      .filter(Boolean)
      .sort((a, b) => a.start - b.start);

    const merged = [];
    for (const marker of normalized) {
      const prev = merged[merged.length - 1];
      const prevColor = prev?.color ?? COLORS.activationBoxStroke;
      const markerColor = marker?.color ?? COLORS.activationBoxStroke;
      const prevBehavior = String(prev?.trigger_behavior ?? prev?.behavior ?? "random").toLowerCase();
      const markerBehavior = String(marker?.trigger_behavior ?? marker?.behavior ?? "random").toLowerCase();
      const sameStyle = prev && prevColor === markerColor && prevBehavior === markerBehavior;
      if (prev && sameStyle && marker.start <= prev.end + tolerance) {
        prev.end = Math.max(prev.end, marker.end);
        prev.fillOpacity = Math.max(Number(prev.fillOpacity ?? 0.1), Number(marker.fillOpacity ?? 0.1));
        continue;
      }
      merged.push({ ...marker });
    }
    return merged;
  }

  function buildElevationProfile(segments, rowY, rowHeight, elevationScale = null) {
    let elevation = 0;
    const boundaries = [{ distance: segments[0]?.start ?? 0, elevation: 0 }];
    for (const segment of segments) {
      elevation += resolveDelta(segment);
      boundaries.push({ distance: segment.end, elevation });
    }
    const elevationAtDistance = (distance) => {
      for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];
        if (distance >= segment.start && distance <= segment.end) {
          const startElevation = boundaries[i].elevation;
          const endElevation = boundaries[i + 1].elevation;
          const span = segment.end - segment.start;
          if (span <= 0 || startElevation === endElevation) return startElevation;
          return startElevation + (endElevation - startElevation) * ((distance - segment.start) / span);
        }
      }
      return boundaries[boundaries.length - 1]?.elevation ?? 0;
    };
    const sampleElevations = boundaries.map((point) => point.elevation);
    const minElevation = Math.min(...sampleElevations);
    const maxElevation = Math.max(...sampleElevations);
    const baselineY = rowY + rowHeight * 0.56;
    const amplitude = rowHeight * 0.4;
    const scale = Number(elevationScale);
    const yFromElevation = (value) => {
      if (Number.isFinite(scale) && scale > 0) return baselineY - (value / scale) * amplitude;
      const center = (minElevation + maxElevation) / 2;
      const halfRange = Math.max((maxElevation - minElevation) / 2, 0.5);
      return baselineY - ((value - center) / halfRange) * amplitude;
    };
    return { yAtDistance: (distance) => yFromElevation(elevationAtDistance(distance)) };
  }

  function computeTickStep(length) {
    if (length <= 1200) return 100;
    if (length <= 2000) return 200;
    if (length <= 3000) return 300;
    return 400;
  }

  function buildSvg(mapData, options = {}) {
    const length = Number(mapData.length) || parseLength(mapData);
    if (!length) throw new Error("Map length missing");
    const width = options.width || 1200;
    const rowHeight = 54;
    const margin = { top: 92, right: 48, bottom: 18, left: 48 };
    const trackWidth = width - margin.left - margin.right;
    const trackTop = margin.top;
    const title = mapData.name || `Course ${length}m`;
    const warningText = options.warningText || "";
    const markers = options.skillMarkers || options.markers || [];
    const statThresholds = mapData.statThresholds || normalizeStatThresholds(mapData);
    const statThresholdText = statThresholds.length ? `Stat Thresholds: ${[...new Set(statThresholds)].join(" & ")}` : "";
    const rowBottom = trackTop + rowHeight * 3;
    const axisY = rowBottom + 32;
    const statThresholdY = axisY + 42;
    const height = options.height || (statThresholdText ? statThresholdY + 22 : axisY + 34);
    const xFrom = (d) => margin.left + (clamp(d, 0, length) / length) * trackWidth;

    const rows = [
      { key: "elevation", y: trackTop, segments: (mapData.elevation || []).map((s) => normalizeSegment(s, length)).filter(Boolean) },
      { key: "layout", y: trackTop + rowHeight, segments: (mapData.layout || []).map((s) => normalizeSegment(s, length)).filter(Boolean) },
      { key: "zones", y: trackTop + rowHeight * 2, segments: (mapData.zones || []).map((s) => normalizeSegment(s, length)).filter(Boolean) },
    ];

    const parts = [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
      `<defs>
        <pattern id="randomStripe" patternUnits="userSpaceOnUse" width="10" height="10" patternTransform="rotate(35)">
          <line x1="0" y1="0" x2="0" y2="10" stroke="#639de6" stroke-opacity="0.62" stroke-width="3"/>
        </pattern>
        <pattern id="asapHatch" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="8" stroke="#ff6f8a" stroke-opacity="0.35" stroke-width="2"/>
        </pattern>
        <pattern id="preconditionHatch" patternUnits="userSpaceOnUse" width="10" height="10" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="10" stroke="#e8cf7a" stroke-opacity="0.4" stroke-width="2"/>
        </pattern>
      </defs>`,
      `<rect width="100%" height="100%" fill="${COLORS.background}"/>`,
      `<text x="${width / 2}" y="46" text-anchor="middle" fill="${COLORS.title}" font-size="28" font-family="${FONT}" font-weight="700">${escapeXml(title)}</text>`,
    ];
    if (warningText) {
      parts.push(
        `<text x="${width / 2}" y="72" text-anchor="middle" fill="${COLORS.warning}" font-size="14" font-family="${FONT}" font-weight="700">${escapeXml(warningText)}</text>`
      );
    }

    const boundaryLabels = [];
    for (const row of rows) {
      if (row.key === "elevation" && row.segments.length) {
        const startX = xFrom(row.segments[0].start);
        const endX = xFrom(row.segments[row.segments.length - 1].end);
        const { yAtDistance } = buildElevationProfile(row.segments, row.y, rowHeight, mapData.elevationScale);
        parts.push(
          `<rect x="${startX.toFixed(2)}" y="${row.y}" width="${(endX - startX).toFixed(2)}" height="${rowHeight}" fill="${MAP_COLORS.sky}" stroke="${COLORS.segmentBorder}"/>`
        );
        for (const segment of row.segments) {
          const x1 = xFrom(segment.start);
          const x2 = xFrom(segment.end);
          const y1 = yAtDistance(segment.start);
          const y2 = yAtDistance(segment.end);
          const fill = elevationColor(segment);
          const points = `${x1.toFixed(2)},${row.y + rowHeight} ${x2.toFixed(2)},${row.y + rowHeight} ${x2.toFixed(2)},${y2.toFixed(2)} ${x1.toFixed(2)},${y1.toFixed(2)}`;
          parts.push(`<polygon points="${points}" fill="${fill}" stroke="${COLORS.segmentBorder}" stroke-width="0.8"/>`);
        }
        for (const segment of row.segments) {
          if (segment.end >= row.segments[row.segments.length - 1].end) continue;
          boundaryLabels.push({ x: xFrom(segment.end), y: row.y + rowHeight, text: `${segment.end}m` });
        }
        continue;
      }

      for (const seg of row.segments) {
        const x = xFrom(seg.start);
        const w = xFrom(seg.end) - x;
        const fill = row.key === "layout" ? layoutColor(seg) : zoneColor(seg);
        const label = seg.type === "uphill" || seg.type === "downhill" || seg.type === "flat" ? "" : seg.label || "";
        parts.push(
          `<rect x="${x.toFixed(2)}" y="${row.y}" width="${w.toFixed(2)}" height="${rowHeight}" fill="${fill}" stroke="${COLORS.segmentBorder}"/>`
        );
        if (label && w > 44) {
          parts.push(
            `<text x="${(x + w / 2).toFixed(2)}" y="${row.y + rowHeight / 2 + 5}" text-anchor="middle" fill="#20262e" font-size="15" font-family="${FONT}" font-weight="700">${escapeXml(label)}</text>`
          );
        }
      }
      for (const segment of row.segments) {
        if (segment.end >= length) continue;
        boundaryLabels.push({ x: xFrom(segment.end), y: row.y + rowHeight, text: `${segment.end}m` });
      }
    }

    for (const marker of boundaryLabels) {
      parts.push(
        `<line x1="${marker.x.toFixed(2)}" y1="${(marker.y - 7).toFixed(2)}" x2="${marker.x.toFixed(2)}" y2="${(marker.y + 5).toFixed(2)}" stroke="${COLORS.tick}" stroke-width="1.5"/>`,
        `<text x="${marker.x.toFixed(2)}" y="${(marker.y - 6).toFixed(2)}" text-anchor="middle" fill="${COLORS.meterText}" font-size="9" font-family="${FONT}">${marker.text}</text>`
      );
    }

    parts.push(`<line x1="${margin.left}" y1="${axisY}" x2="${width - margin.right}" y2="${axisY}" stroke="${COLORS.axis}" stroke-width="2"/>`);
    const step = computeTickStep(length);
    for (let d = 0; d <= length; d += step) {
      const x = xFrom(d);
      parts.push(
        `<line x1="${x}" y1="${axisY}" x2="${x}" y2="${axisY - 10}" stroke="${COLORS.tick}" stroke-width="2"/>`,
        `<text x="${x}" y="${axisY + 20}" text-anchor="middle" fill="${COLORS.axis}" font-size="13" font-family="${FONT}">${d}</text>`
      );
    }
    if (statThresholdText) {
      parts.push(
        `<text x="${width / 2}" y="${statThresholdY}" text-anchor="middle" fill="${COLORS.axis}" font-size="14" font-family="${FONT}" font-weight="700">${escapeXml(statThresholdText)}</text>`
      );
    }

    const boxMarkers = [];
    const lineMarkers = [];
    for (const marker of markers) {
      if ((marker.type ?? (marker.start != null && marker.end != null ? "box" : "line")) === "box") boxMarkers.push(marker);
      else lineMarkers.push(marker);
    }

    for (const marker of [...mergeTouchingBoxMarkers(boxMarkers, length), ...lineMarkers]) {
      const markerType = marker.type ?? (marker.start != null && marker.end != null ? "box" : "line");
      if (markerType === "box") {
        const start = clamp(Number(marker.start ?? 0), 0, length);
        const end = clamp(Number(marker.end ?? 0), 0, length);
        if (end <= start) continue;
        const x = xFrom(start);
        const w = xFrom(end) - x;
        const behavior = String(marker.trigger_behavior ?? marker.behavior ?? "random").toLowerCase();
        const boxY = trackTop - 12;
        const boxH = rowBottom - trackTop + 24;
        if (behavior === "asap") {
          parts.push(
            `<rect x="${x.toFixed(2)}" y="${boxY}" width="${w.toFixed(2)}" height="${boxH}" rx="4" fill="${marker.color || COLORS.activationBoxStroke}" fill-opacity="0.08" stroke="none"/>`,
            `<rect x="${x.toFixed(2)}" y="${boxY}" width="${w.toFixed(2)}" height="${boxH}" rx="4" fill="url(#asapHatch)" fill-opacity="0.4" stroke="${marker.color || COLORS.activationBoxStroke}" stroke-width="2.4"/>`,
            `<text x="${(x + w / 2).toFixed(2)}" y="${boxY - 6}" text-anchor="middle" fill="#ff7f97" font-size="12" font-family="${FONT}" font-weight="700">ASAP</text>`
          );
        } else if (behavior === "precondition") {
          parts.push(
            `<rect x="${x.toFixed(2)}" y="${boxY}" width="${w.toFixed(2)}" height="${boxH}" rx="4" fill="#f7e6a4" fill-opacity="0.2" stroke="none"/>`,
            `<rect x="${x.toFixed(2)}" y="${boxY}" width="${w.toFixed(2)}" height="${boxH}" rx="4" fill="url(#preconditionHatch)" fill-opacity="0.45" stroke="#d9b84a" stroke-width="2"/>`,
            `<text x="${(x + w / 2).toFixed(2)}" y="${boxY - 6}" text-anchor="middle" fill="#e5c767" font-size="12" font-family="${FONT}" font-weight="700">PRECONDITION</text>`
          );
        } else {
          parts.push(
            `<rect x="${x.toFixed(2)}" y="${boxY}" width="${w.toFixed(2)}" height="${boxH}" rx="4" fill="#bfdcff" fill-opacity="0.24" stroke="none"/>`,
            `<rect x="${x.toFixed(2)}" y="${boxY}" width="${w.toFixed(2)}" height="${boxH}" rx="4" fill="url(#randomStripe)" fill-opacity="0.55" stroke="#4f88d4" stroke-width="2"/>`,
            `<text x="${(x + w / 2).toFixed(2)}" y="${boxY - 6}" text-anchor="middle" fill="#5f98e3" font-size="12" font-family="${FONT}" font-weight="700">RANDOM</text>`
          );
        }
        continue;
      }
      const lineX = xFrom(clamp(Number(marker.distance ?? 0), 0, length));
      parts.push(
        `<line x1="${lineX.toFixed(2)}" y1="${trackTop - 12}" x2="${lineX.toFixed(2)}" y2="${axisY + 4}" stroke="${marker.color || COLORS.activationLine}" stroke-width="${Number(marker.width ?? 4)}"/>`
      );
    }

    for (const distance of mapData.positionKeepEnds || []) {
      const lineX = xFrom(distance);
      const labelX = clamp(lineX + 6, margin.left + 4, width - margin.right - 22);
      parts.push(
        `<line x1="${lineX.toFixed(2)}" y1="${trackTop - 10}" x2="${lineX.toFixed(2)}" y2="${axisY + 4}" stroke="${COLORS.positionKeepLine}" stroke-width="2.8"/>`,
        `<text x="${labelX.toFixed(2)}" y="${trackTop + rowHeight * 0.34}" text-anchor="start" fill="${COLORS.positionKeepLine}" font-size="11" font-family="${FONT}" font-weight="700">PK</text>`
      );
    }

    parts.push("</svg>");
    return parts.join("");
  }

  window.CourseMap = {
    parseLength,
    normalizeMap,
    buildSvg,
    markersFromActivationMap,
    inferSkillMarkers,
    resolveSkillActivationOverlay,
    evaluateRequirements: (skill, track) => {
      const overlay = resolveSkillActivationOverlay(skill, { track }, { length: 1, elevation: [], layout: [], zones: [] });
      return { ok: !overlay.doesNotWork, reasons: overlay.reasons };
    },
  };
})();
