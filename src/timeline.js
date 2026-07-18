const DATE_STATUS_VALUES = ["exact", "range", "earliest", "tbc", "conflicting"];
const BLOCKS_VALUES = [true, false, "unknown"];

export function createTimeline({ items = [], source_refs = [] } = {}) {
  if (!Array.isArray(items)) {
    throw new Error("timeline.create requires items to be an array.");
  }

  return {
    kind: "timeline",
    version: "0.3.0",
    created_at: new Date().toISOString(),
    source_refs,
    items: items.map(normalizeTimelineItem)
  };
}

export function validateTimeline(timeline = {}) {
  if (timeline.kind !== "timeline") {
    return {
      ok: false,
      gaps: [{ type: "invalid_kind", message: "Expected kind to be timeline." }]
    };
  }

  const gaps = [];
  for (const item of timeline.items ?? []) {
    if (!DATE_STATUS_VALUES.includes(item.date_status)) {
      gaps.push({
        type: "invalid_date_status",
        item_id: item.id,
        message: `Timeline item '${item.id}' has unsupported date_status '${item.date_status}'.`
      });
    }
    if (!BLOCKS_VALUES.includes(item.blocks_next_milestone)) {
      gaps.push({
        type: "invalid_blocks_next_milestone",
        item_id: item.id,
        message: `Timeline item '${item.id}' has unsupported blocks_next_milestone '${item.blocks_next_milestone}'.`
      });
    }
    if (item.date_status === "exact" && !item.date) {
      gaps.push({
        type: "missing_exact_date",
        item_id: item.id,
        message: `Timeline item '${item.id}' is exact but has no date.`
      });
    }
    if (item.date && !isIsoDate(item.date)) {
      gaps.push({
        type: "invalid_date",
        item_id: item.id,
        message: `Timeline item '${item.id}' has invalid date '${item.date}'.`
      });
    }
    if (item.date_status === "range" && !isValidDateRange(item.date_range)) {
      gaps.push({
        type: "invalid_date_range",
        item_id: item.id,
        message: `Timeline item '${item.id}' is a range but does not have a valid start and end date.`
      });
    }
    if (item.date_status === "conflicting" && item.alternate_dates.length === 0) {
      gaps.push({
        type: "missing_alternate_dates",
        item_id: item.id,
        message: `Timeline item '${item.id}' is conflicting but has no alternate_dates.`
      });
    }
    for (const date of item.alternate_dates) {
      if (!isIsoDate(date)) {
        gaps.push({ type: "invalid_alternate_date", item_id: item.id, message: `Timeline item '${item.id}' has invalid alternate date '${date}'.` });
      }
    }
  }

  return {
    ok: gaps.length === 0,
    gaps,
    summary: {
      item_count: timeline.items?.length ?? 0,
      gap_count: gaps.length
    }
  };
}

function isIsoDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

function isValidDateRange(value) {
  if (!value || typeof value !== "object") return false;
  const start = value.start ?? value.from;
  const end = value.end ?? value.to;
  return isIsoDate(start) && isIsoDate(end) && start <= end;
}

export function renderTimeline(timeline = {}, { format = "markdown" } = {}) {
  if (format === "json") {
    return JSON.stringify(timeline, null, 2);
  }
  if (format !== "markdown") {
    throw new Error(`Unsupported timeline render format: ${format}`);
  }

  const lines = ["# Timeline", ""];
  for (const item of timeline.items ?? []) {
    const dateLabel = item.date_status === "tbc" ? "TBC" : (item.date ?? "unknown");
    const alternates = item.alternate_dates?.length ? `; alternates: ${item.alternate_dates.join(", ")}` : "";
    lines.push(
      `- ${item.label}: ${dateLabel} (${item.date_status}${alternates}; blocks next milestone: ${item.blocks_next_milestone})`
    );
  }
  return `${lines.join("\n")}\n`;
}

function normalizeTimelineItem(item, index) {
  const alternateDates = Array.isArray(item.alternate_dates) ? item.alternate_dates : [];
  const dateStatus = item.date_status ?? (alternateDates.length > 0 ? "conflicting" : item.date ? "exact" : "tbc");

  return {
    id: item.id ?? `timeline-item-${index + 1}`,
    label: item.label ?? item.name ?? `Timeline item ${index + 1}`,
    date: item.date ?? null,
    date_status: dateStatus,
    date_range: item.date_range ?? null,
    alternate_dates: alternateDates,
    blocks_next_milestone: item.blocks_next_milestone ?? "unknown",
    source_refs: item.source_refs ?? []
  };
}
