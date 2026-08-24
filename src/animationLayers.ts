import {
  RenderableGeometryType,
  TEMPORAL_LABEL_LAYER_ID,
  getTemporalLayerId,
} from "./layerState";
import { AnimationContext } from "./timeAnimation";
import {
  getLabelPosition,
  isLabelVisibleAtTime,
  LabelDatum,
} from "./labels/labelData";

type TemporalGeometryType = Extract<RenderableGeometryType, "scatter" | "path">;

export interface AnimationLayerLike {
  id?: string;
  clone?: (newProps: Record<string, unknown>) => AnimationLayerLike;
}

const getCloneProps = (
  layer: AnimationLayerLike,
  animation: AnimationContext,
): Record<string, unknown> | null => {
  const layerId = layer.id;
  const t0 = animation.domain.t0;

  if (layerId === getTemporalLayerId("scatter")) {
    return {
      time: animation.time - t0,
      maxHeight: animation.maxHeight,
      trailLength: animation.trailLength,
    };
  }

  if (layerId === getTemporalLayerId("path")) {
    return {
      timeRange: [
        animation.time - t0 - animation.trailLength,
        animation.time - t0,
      ],
    };
  }

  if (layerId === TEMPORAL_LABEL_LAYER_ID) {
    return {
      time: animation.time,
      domainStart: t0,
      domainSpan: animation.domain.t1 - t0,
      trailLength: animation.trailLength,
      maxHeight: animation.maxHeight,
      getText: (datum: LabelDatum) =>
        isLabelVisibleAtTime(datum, animation.time, t0, animation.trailLength)
          ? datum.text
          : "",
      getPosition: (datum: LabelDatum) =>
        getLabelPosition(
          datum,
          animation.time,
          t0,
          animation.maxHeight,
          animation.domain.t1 - t0,
        ),
      updateTriggers: {
        getText: [animation.time, animation.trailLength],
        getPosition: [animation.time, animation.maxHeight],
      },
    };
  }

  return null;
};

export const getActiveDeckLayerIds = (
  layers: Array<{ id?: unknown }>,
): string[] =>
  layers
    .map((layer) => layer?.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);

export const getTemporalDeckLayerIds = (): Record<
  TemporalGeometryType,
  string
> => ({
  scatter: getTemporalLayerId("scatter"),
  path: getTemporalLayerId("path"),
});

export const updateTemporalAnimationLayers = <T extends AnimationLayerLike>(
  layers: T[],
  animation: AnimationContext,
): { layers: T[]; changed: boolean } => {
  let changed = false;
  const nextLayers = layers.map((layer) => {
    if (!layer.id || typeof layer.clone !== "function") {
      return layer;
    }

    const cloneProps = getCloneProps(layer, animation);
    if (!cloneProps) {
      return layer;
    }

    changed = true;
    return layer.clone(cloneProps) as T;
  });

  return { layers: nextLayers, changed };
};
