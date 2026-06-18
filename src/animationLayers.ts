import { RenderableGeometryType, getTemporalLayerId } from "./layerState";
import { AnimationContext } from "./timeAnimation";

type TemporalGeometryType = Extract<RenderableGeometryType, "scatter" | "path">;

export interface AnimationLayerLike {
  id?: string;
  clone?: (newProps: Record<string, unknown>) => AnimationLayerLike;
}

const getCloneProps = (
  layerId: string,
  animation: AnimationContext,
): Record<string, unknown> | null => {
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

  return null;
};

export const getActiveDeckLayerIds = (
  layers: Array<{ id?: unknown }>,
): string[] =>
  layers
    .map((layer) => layer?.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);

export const getTemporalDeckLayerIds = (): Record<TemporalGeometryType, string> => ({
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

    const cloneProps = getCloneProps(layer.id, animation);
    if (!cloneProps) {
      return layer;
    }

    changed = true;
    return layer.clone(cloneProps) as T;
  });

  return { layers: nextLayers, changed };
};
