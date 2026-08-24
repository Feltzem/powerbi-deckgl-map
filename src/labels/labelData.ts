import type { Position } from "@deck.gl/core";
import { LabelCardSettings, LabelPlacement } from "../settings";
import { OurData } from "../dataTypes";
import { getFeatureLabelAnchor, LabelAnchor } from "./labelPlacement";

export interface LabelDatum {
  id: string;
  text: string;
  position: LabelAnchor;
  priority: number | null;
  sourceOrder: number;
  timestampSeconds: number | null;
  isTemporal: boolean;
  hasExplicitElevation: boolean;
}

export interface LabelLayout {
  textAnchor: "start" | "middle" | "end";
  alignmentBaseline: "top" | "center" | "bottom";
  pixelOffset: [number, number];
}

let labelDataCache: {
  version: string;
  source: OurData[];
  data: LabelDatum[];
} | null = null;

const LABEL_PLACEMENT_GAP_PIXELS = 4;

const placementToLayout = (
  placement: LabelPlacement,
): Pick<LabelLayout, "textAnchor" | "alignmentBaseline"> & {
  gapDirection: [number, number];
} => {
  const [vertical, horizontal] = placement.split("-");
  // deck.gl anchors describe which edge of the text sits on the point, so a label placed
  // above the point has to be bottom-aligned to end up clear of it.
  return {
    textAnchor:
      horizontal === "left"
        ? "end"
        : horizontal === "right"
          ? "start"
          : "middle",
    alignmentBaseline:
      vertical === "top" ? "bottom" : vertical === "bottom" ? "top" : "center",
    gapDirection: [
      horizontal === "left" ? -1 : horizontal === "right" ? 1 : 0,
      vertical === "top" ? -1 : vertical === "bottom" ? 1 : 0,
    ],
  };
};

export const getLabelLayout = (settings: LabelCardSettings): LabelLayout => {
  const { gapDirection, ...anchors } = placementToLayout(
    settings.placement.value.value as LabelPlacement,
  );
  const gap =
    LABEL_PLACEMENT_GAP_PIXELS +
    (settings.showBox.value === true
      ? settings.boxPadding.value + settings.borderWidth.value
      : 0);

  return {
    ...anchors,
    pixelOffset: [
      settings.offsetX.value + gapDirection[0] * gap,
      settings.offsetY.value + gapDirection[1] * gap,
    ],
  };
};

export const prepareLabelData = (
  source: OurData[],
  version: string,
): LabelDatum[] => {
  if (
    labelDataCache &&
    labelDataCache.version === version &&
    labelDataCache.source === source
  ) {
    return labelDataCache.data;
  }

  const data = source
    .filter(
      (item) => item.labelText !== null && item.labelText.trim().length > 0,
    )
    .map<LabelDatum>((item) => ({
      id: item.id,
      text: item.labelText!,
      position: getFeatureLabelAnchor(item),
      priority: item.labelPriority,
      sourceOrder: item.sourceOrder,
      timestampSeconds: item.timestampSeconds,
      isTemporal: item.type === "scatter" || item.type === "path",
      hasExplicitElevation:
        item.type === "scatter" &&
        typeof item.scatterData?.elevation === "number" &&
        Number.isFinite(item.scatterData.elevation),
    }));

  labelDataCache = { version, source, data };
  return data;
};

export const isLabelVisibleAtTime = (
  datum: LabelDatum,
  time: number | null,
  domainStart: number,
  trailLength: number,
): boolean => {
  if (time === null || datum.timestampSeconds === null || !datum.isTemporal) {
    return true;
  }

  const relativeTime = datum.timestampSeconds - domainStart;
  const currentTime = time - domainStart;
  return (
    relativeTime >= currentTime - Math.max(0, trailLength) &&
    relativeTime <= currentTime
  );
};

export const getLabelPosition = (
  datum: LabelDatum,
  time: number | null,
  domainStart: number,
  maxHeight: number,
  domainSpan: number,
): Position => {
  if (
    time === null ||
    datum.timestampSeconds === null ||
    !datum.isTemporal ||
    datum.hasExplicitElevation ||
    domainSpan <= 0
  ) {
    return datum.position;
  }

  const fraction = Math.max(
    0,
    Math.min(1, (datum.timestampSeconds - domainStart) / domainSpan),
  );
  return [datum.position[0], datum.position[1], fraction * maxHeight];
};

export const clearLabelDataCache = (): void => {
  labelDataCache = null;
};
