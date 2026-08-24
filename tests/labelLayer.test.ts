import test from "node:test";
import assert from "node:assert/strict";

import { getFeatureLabelLayer } from "../src/labels/featureLabelLayer";
import { LabelDatum } from "../src/labels/labelData";
import { LABEL_LAYER_ID, TEMPORAL_LABEL_LAYER_ID } from "../src/layerState";
import { VisualFormattingSettingsModel } from "../src/settings";

(
  globalThis as unknown as {
    powerbi: { visuals: { ValidatorType: { Min: string; Max: string } } };
  }
).powerbi = {
  visuals: {
    ValidatorType: {
      Min: "Min",
      Max: "Max",
    },
  },
};

const datum: LabelDatum = {
  id: "label-1",
  text: "Feature",
  position: [175, -37.8, 0],
  priority: 12,
  sourceOrder: 0,
  timestampSeconds: null,
  isTemporal: false,
  hasExplicitElevation: false,
};

test("feature label layer is a non-pickable SDF overlay with collision settings", () => {
  const settings = new VisualFormattingSettingsModel().labels;
  settings.showLabels.value = true;
  settings.collisionPadding.value = 6;
  settings.showGlow.value = true;
  settings.showBox.value = true;

  const layer = getFeatureLabelLayer([datum], settings, 8);
  const props = layer.props as typeof layer.props & {
    collisionTestProps?: { getSize?: number };
    getCollisionPriority?: (value: LabelDatum) => number;
  };

  assert.equal(layer.id, LABEL_LAYER_ID);
  assert.equal(props.visible, true);
  assert.equal(props.pickable, false);
  assert.equal(props.billboard, true);
  assert.deepEqual(props.parameters, {
    depthWriteEnabled: false,
    depthCompare: "always",
  });
  assert.equal(props.characterSet, "auto");
  assert.deepEqual(props.fontSettings, {
    sdf: true,
    fontSize: 48,
    buffer: 16,
    radius: 16,
    smoothing: 0.125,
  });
  assert.equal(props.getText?.(datum, { index: 0 } as never), "Feature");
  assert.equal(props.getCollisionPriority?.(datum), 12);
  assert.equal(props.collisionTestProps?.getSize, 24);
  assert.deepEqual(props.getColor, [0, 0, 0, 255]);
  assert.equal(props.background, true);
  assert.deepEqual(props.getBackgroundColor, [255, 255, 255, 255]);
  assert.deepEqual(props.getBorderColor, [0, 0, 0, 255]);
  assert.equal(props.getBorderWidth, 1);
  assert.equal(props.backgroundBorderRadius, 3);
  // 2px halo at font size 12 rendered from a 48px SDF atlas with a 0.75 edge buffer
  assert.equal(props.outlineWidth, (2 * 48) / (12 * (192 / 256)));
  const layerWithState = layer as unknown as {
    initializeState: () => void;
    state: {
      startIndices: number[];
      numInstances: number;
      getText: typeof props.getText;
      styleVersion: number;
      fontAtlasManager: { scale: number; atlas?: unknown; mapping?: unknown };
    };
  };
  layerWithState.initializeState();
  layerWithState.state.startIndices = [0];
  layerWithState.state.numInstances = 1;
  layerWithState.state.getText = props.getText;
  const sublayers = layer.renderLayers() as Array<{
    props?: {
      extensions?: Array<{ constructor?: { extensionName?: string } }>;
      parameters?: Record<string, unknown>;
    };
  }>;
  const renderedSublayers = sublayers.filter(
    (sublayer): sublayer is { props: NonNullable<typeof sublayer.props> } =>
      !!sublayer,
  );
  assert.equal(renderedSublayers.length >= 1, true);
  assert.equal(
    renderedSublayers.every((sublayer) =>
      sublayer.props?.extensions?.some(
        (extension) =>
          extension.constructor?.extensionName === "CollisionFilterExtension",
      ),
    ),
    true,
  );
  assert.equal(
    renderedSublayers.every(
      (sublayer) =>
        sublayer.props.parameters?.depthWriteEnabled === false &&
        sublayer.props.parameters?.depthCompare === "always",
    ),
    true,
  );
});

test("feature labels honor zoom visibility and temporal text filtering", () => {
  const settings = new VisualFormattingSettingsModel().labels;
  settings.showLabels.value = true;
  settings.minZoom.value = 10;
  settings.maxZoom.value = 12;

  const hiddenLayer = getFeatureLabelLayer([datum], settings, 8);
  assert.equal(hiddenLayer.props.visible, false);

  const temporalLayer = getFeatureLabelLayer(
    [{ ...datum, timestampSeconds: 150, isTemporal: true }],
    settings,
    10,
    {
      time: 125,
      domainStart: 100,
      domainSpan: 100,
      trailLength: 10,
      maxHeight: 500,
    },
  );
  assert.equal(temporalLayer.id, TEMPORAL_LABEL_LAYER_ID);
  assert.equal(
    temporalLayer.props.getText?.(temporalLayer.props.data[0], {
      index: 0,
    } as never),
    "",
  );
});
