import type { PickingInfo } from "@deck.gl/core";
import {
  getGeometryTypeForLayerId,
  isRenderableGeometryType,
  RenderableGeometryType,
} from "./layerState";
import { getGeometryIconHtml } from "./geometryIcons";

interface TooltipObject {
  id?: unknown;
  type?: unknown;
  tooltipHtml?: unknown;
  properties?: {
    id?: unknown;
  };
}

interface TooltipEntry {
  geometryType: RenderableGeometryType;
  html: string;
  id: string;
  originalIndex: number;
}

export interface MultipleObjectPicker {
  pickMultipleObjects(params: {
    x: number;
    y: number;
    radius?: number;
    depth?: number;
    layerIds?: string[];
  }): PickingInfo[];
}

export interface AggregatedTooltipOptions {
  hoverInfo: PickingInfo;
  deckOverlay: MultipleObjectPicker | null;
  drawOrder: RenderableGeometryType[];
  activeTypes: Set<RenderableGeometryType>;
  layerIds?: string[];
  radius?: number;
  depth?: number;
}

const normalizeHtml = (html: string): string =>
  html.replace(/\s+/g, " ").trim();

const escapeAttributeValue = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const getTooltipObject = (info: PickingInfo): TooltipObject | null =>
  info.object && typeof info.object === "object"
    ? (info.object as TooltipObject)
    : null;

const getTooltipObjectId = (
  info: PickingInfo,
  geometryType: RenderableGeometryType,
): string => {
  const object = getTooltipObject(info);
  const id = object?.id ?? object?.properties?.id;
  if (id !== null && id !== undefined) {
    return String(id);
  }

  return `${geometryType}:${info.index ?? "unknown"}`;
};

const getTooltipGeometryType = (
  info: PickingInfo,
): RenderableGeometryType | null => {
  const fromLayer = getGeometryTypeForLayerId(info.layer?.id);
  if (fromLayer) {
    return fromLayer;
  }

  const objectType = getTooltipObject(info)?.type;
  return isRenderableGeometryType(objectType) ? objectType : null;
};

const splitRowsOnBreaks = (html: string): string[] => {
  const parts = html.split(/(<br\s*\/?>)/i);
  const rows: string[] = [];
  let currentRow = "";

  for (const part of parts) {
    if (!part) {
      continue;
    }

    currentRow += part;
    if (/^<br\s*\/?>$/i.test(part)) {
      rows.push(currentRow);
      currentRow = "";
    }
  }

  if (currentRow.length > 0) {
    rows.push(currentRow);
  }

  return rows;
};

const dedupeRowsInHtml = (html: string): string => {
  const rows = splitRowsOnBreaks(html);
  if (rows.length <= 1) {
    return html;
  }

  const seenRows = new Set<string>();
  return rows
    .filter((row) => {
      const rowText = row
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      const rowKey = rowText || normalizeHtml(row);

      if (!rowKey || seenRows.has(rowKey)) {
        return false;
      }

      seenRows.add(rowKey);
      return true;
    })
    .join("");
};

const createTooltipEntries = (
  pickedInfos: PickingInfo[],
  activeTypes: Set<RenderableGeometryType>,
): TooltipEntry[] => {
  const entries: TooltipEntry[] = [];
  const seenIds = new Set<string>();

  pickedInfos.forEach((info, originalIndex) => {
    const object = getTooltipObject(info);
    const geometryType = getTooltipGeometryType(info);
    const tooltipHtml = object?.tooltipHtml;

    if (
      !geometryType ||
      !activeTypes.has(geometryType) ||
      typeof tooltipHtml !== "string" ||
      tooltipHtml.trim().length === 0
    ) {
      return;
    }

    const id = getTooltipObjectId(info, geometryType);
    if (seenIds.has(id)) {
      return;
    }

    seenIds.add(id);
    entries.push({
      geometryType,
      html: dedupeRowsInHtml(tooltipHtml),
      id,
      originalIndex,
    });
  });

  return entries;
};

const getSortedTooltipEntries = (
  entries: TooltipEntry[],
  drawOrder: RenderableGeometryType[],
): TooltipEntry[] => {
  const drawOrderRank = new Map<RenderableGeometryType, number>(
    drawOrder.map((type, index): [RenderableGeometryType, number] => [
      type,
      index,
    ]),
  );

  return entries.sort((left, right) => {
    const rightRank = drawOrderRank.get(right.geometryType) ?? -1;
    const leftRank = drawOrderRank.get(left.geometryType) ?? -1;
    if (rightRank !== leftRank) {
      return rightRank - leftRank;
    }

    return left.originalIndex - right.originalIndex;
  });
};

const buildTooltipHtml = (entries: TooltipEntry[]): string | null => {
  if (entries.length === 0) {
    return null;
  }

  const sections = entries.map(
    (entry) =>
      `<section class="deckgl-multi-tooltip__section" data-geometry-type="${entry.geometryType}" data-geometry-id="${escapeAttributeValue(entry.id)}">${getGeometryIconHtml(entry.geometryType, "deckgl-multi-tooltip__geometry-icon")}${entry.html}</section>`,
  );

  return `<div class="deckgl-multi-tooltip">${sections.join("")}</div>`;
};

export const getAggregatedTooltipHtml = ({
  hoverInfo,
  deckOverlay,
  drawOrder,
  activeTypes,
  layerIds,
  radius = 5,
  depth = 25,
}: AggregatedTooltipOptions): string | null => {
  if (!hoverInfo.object) {
    return null;
  }

  let pickedInfos: PickingInfo[] = [hoverInfo];

  if (
    deckOverlay &&
    Number.isFinite(hoverInfo.x) &&
    Number.isFinite(hoverInfo.y)
  ) {
    try {
      pickedInfos = deckOverlay.pickMultipleObjects({
        x: hoverInfo.x,
        y: hoverInfo.y,
        radius,
        depth,
        layerIds,
      });
    } catch {
      pickedInfos = [hoverInfo];
    }
  }

  let entries = createTooltipEntries(
    pickedInfos.length > 0 ? pickedInfos : [hoverInfo],
    activeTypes,
  );

  if (
    entries.length === 0 &&
    layerIds &&
    layerIds.length > 0 &&
    deckOverlay &&
    Number.isFinite(hoverInfo.x) &&
    Number.isFinite(hoverInfo.y)
  ) {
    try {
      entries = createTooltipEntries(
        deckOverlay.pickMultipleObjects({
          x: hoverInfo.x,
          y: hoverInfo.y,
          radius,
          depth,
        }),
        activeTypes,
      );
    } catch {
      entries = createTooltipEntries([hoverInfo], activeTypes);
    }
  }

  const sortedEntries = getSortedTooltipEntries(
    entries.length > 0 ? entries : createTooltipEntries([hoverInfo], activeTypes),
    drawOrder,
  );

  return buildTooltipHtml(sortedEntries);
};
