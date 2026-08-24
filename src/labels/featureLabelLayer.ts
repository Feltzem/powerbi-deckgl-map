import { CollisionFilterExtension } from "@deck.gl/extensions";
import type { AccessorContext, Color, Position } from "@deck.gl/core";
import { TextLayer } from "@deck.gl/layers";
import type { TextLayerProps } from "@deck.gl/layers";
import { decodeHex, withOpacity } from "../col";
import { LABEL_LAYER_ID } from "../layerState";
import { LabelCardSettings } from "../settings";
import {
  getLabelLayout,
  getLabelPosition,
  isLabelVisibleAtTime,
  LabelDatum,
} from "./labelData";

const LABEL_COLLISION_GROUP = "feature-labels";
const LABEL_ATLAS_MIN_FONT_SIZE = 32;
const LABEL_ATLAS_MAX_FONT_SIZE = 96;
const LABEL_ATLAS_SCALE = 4;
const LABEL_ATLAS_RADIUS = 16;
// Distances beyond the glyph padding are clipped, so keep the padding at the SDF radius.
const LABEL_ATLAS_BUFFER = LABEL_ATLAS_RADIUS;
const LABEL_SDF_MIN_SMOOTHING = 0.05;
const LABEL_SDF_MAX_SMOOTHING = 0.5;
const LABEL_SDF_EDGE = 192 / 256;

const getDevicePixelRatio = (): number => {
  const ratio =
    typeof window === "undefined" ? 1 : (window.devicePixelRatio ?? 1);
  return Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
};

// deck.gl turns outlineWidth into an SDF offset of LABEL_SDF_EDGE * outlineWidth / radius,
// so a halo of `widthPixels` on screen needs this prop value rather than a fraction of the font size.
const getSdfOutlineWidth = (
  widthPixels: number,
  fontSize: number,
  atlasFontSize: number,
): number => {
  if (!(widthPixels > 0)) {
    return 0;
  }
  const outlineWidth =
    (widthPixels * atlasFontSize) / (fontSize * LABEL_SDF_EDGE);
  return Math.min(LABEL_ATLAS_RADIUS, outlineWidth);
};

export interface FeatureLabelLayerProps extends TextLayerProps<LabelDatum> {
  collisionEnabled?: boolean;
  collisionGroup?: string;
  getCollisionPriority?: (datum: LabelDatum) => number;
  minZoom?: number;
  maxZoom?: number;
  zoom?: number;
  collisionPadding?: number;
  showShadow?: boolean;
  shadowColor?: Color;
  shadowOpacity?: number;
  shadowBlur?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  showGlow?: boolean;
  glowWidth?: number;
  collisionTestProps?: Record<string, unknown>;
  time?: number | null;
  domainStart?: number;
  domainSpan?: number;
  trailLength?: number;
  maxHeight?: number;
}

const clampPriority = (priority: number): number =>
  Math.max(-1000, Math.min(1000, Number.isFinite(priority) ? priority : 0));

const getAccessorValue = <T>(
  accessor:
    | ((datum: LabelDatum, context: AccessorContext<LabelDatum>) => T)
    | T,
  datum: LabelDatum,
  context: AccessorContext<LabelDatum>,
): T => {
  if (typeof accessor === "function") {
    return (
      accessor as unknown as (
        datum: LabelDatum,
        context: AccessorContext<LabelDatum>,
      ) => T
    )(datum, context);
  }
  return accessor;
};

export default class FeatureLabelLayer extends TextLayer<
  LabelDatum,
  FeatureLabelLayerProps
> {
  static layerName = "FeatureLabelLayer";
  static defaultProps = {
    ...TextLayer.defaultProps,
    collisionEnabled: true,
    collisionGroup: LABEL_COLLISION_GROUP,
    getCollisionPriority: {
      type: "accessor",
      value: (datum: LabelDatum) => clampPriority(datum.priority ?? 0),
    },
    minZoom: 0,
    maxZoom: 24,
    zoom: 0,
    collisionPadding: 0,
    showShadow: false,
    shadowColor: [0, 0, 0, 255],
    shadowOpacity: 120,
    shadowBlur: 0,
    shadowOffsetX: 2,
    shadowOffsetY: 2,
    showGlow: false,
    glowWidth: 0,
    time: null,
    domainStart: 0,
    domainSpan: 1,
    trailLength: 0,
    maxHeight: 0,
  } as unknown as typeof TextLayer.defaultProps;

  renderLayers(): any[] {
    const layers = super.renderLayers();
    if (!this.props.showShadow) {
      return layers;
    }

    const firstDatum = Array.isArray(this.props.data)
      ? this.props.data[0]
      : undefined;

    const shadowLayer = new TextLayer<LabelDatum>({
      id: `${this.props.id}-shadow`,
      data: this.props.data,
      pickable: false,
      billboard: this.props.billboard,
      sizeScale: this.props.sizeScale,
      sizeUnits: this.props.sizeUnits,
      sizeMinPixels: this.props.sizeMinPixels,
      sizeMaxPixels: this.props.sizeMaxPixels,
      parameters: this.props.parameters,
      characterSet: this.props.characterSet,
      fontFamily: this.props.fontFamily,
      fontWeight: this.props.fontWeight,
      getText: this.props.getText,
      getPosition: this.props.getPosition,
      getSize: this.props.getSize,
      getAngle: this.props.getAngle,
      getTextAnchor: this.props.getTextAnchor,
      getAlignmentBaseline: this.props.getAlignmentBaseline,
      getPixelOffset: (
        datum: LabelDatum,
        context: AccessorContext<LabelDatum>,
      ) => {
        const offset = getAccessorValue(
          this.props.getPixelOffset,
          datum,
          context,
        );
        return [
          offset[0] + (this.props.shadowOffsetX ?? 0),
          offset[1] + (this.props.shadowOffsetY ?? 0),
        ];
      },
      getColor: this.props.shadowColor,
      outlineWidth: !firstDatum
        ? 0
        : getSdfOutlineWidth(
            this.props.shadowBlur ?? 0,
            Math.max(
              1,
              getAccessorValue(this.props.getSize, firstDatum, {
                index: 0,
              } as AccessorContext<LabelDatum>),
            ),
            this.props.fontSettings?.fontSize ?? LABEL_ATLAS_MIN_FONT_SIZE,
          ),
      outlineColor: this.props.shadowColor,
      fontSettings: { ...(this.props.fontSettings ?? {}), sdf: true },
      updateTriggers: this.props.updateTriggers,
    });

    return [shadowLayer, ...layers];
  }
}

export const getFeatureLabelLayer = (
  data: LabelDatum[],
  settings: LabelCardSettings,
  zoom: number,
  animation: {
    time: number;
    domainStart: number;
    domainSpan: number;
    trailLength: number;
    maxHeight: number;
  } | null = null,
): FeatureLabelLayer => {
  const layout = getLabelLayout(settings);
  const fontSize = Math.max(1, settings.font.fontSize.value);
  const renderedFontSize = fontSize * getDevicePixelRatio();
  const atlasFontSize = Math.round(
    Math.max(
      LABEL_ATLAS_MIN_FONT_SIZE,
      Math.min(LABEL_ATLAS_MAX_FONT_SIZE, renderedFontSize * LABEL_ATLAS_SCALE),
    ),
  );
  // Keep the SDF alpha ramp about one rendered pixel wide, otherwise glyph edges alias.
  const atlasSmoothing = Math.max(
    LABEL_SDF_MIN_SMOOTHING,
    Math.min(
      LABEL_SDF_MAX_SMOOTHING,
      atlasFontSize / (2 * LABEL_ATLAS_RADIUS * renderedFontSize),
    ),
  );
  const textColor = withOpacity(
    decodeHex(settings.textColor.value.value, [0, 0, 0, 255]),
    settings.textOpacity.value,
  );
  const backgroundColor = withOpacity(
    decodeHex(settings.boxFillColor.value.value, [255, 255, 255, 255]),
    settings.boxFillOpacity.value,
  );
  const borderColor = withOpacity(
    decodeHex(settings.borderColor.value.value, [0, 0, 0, 255]),
    settings.borderOpacity.value,
  );
  const shadowColor = withOpacity(
    decodeHex(settings.shadowColor.value.value, [0, 0, 0, 255]),
    settings.shadowOpacity.value,
  );
  const glowColor = withOpacity(
    decodeHex(settings.glowColor.value.value, [255, 255, 255, 255]),
    settings.glowOpacity.value,
  );
  const selectedShape = settings.boxShape.value.value;
  const borderRadius =
    selectedShape === "pill"
      ? fontSize
      : selectedShape === "rounded"
        ? Math.max(2, fontSize * 0.25)
        : 0;
  const minZoom = Math.min(settings.minZoom.value, settings.maxZoom.value);
  const maxZoom = Math.max(settings.minZoom.value, settings.maxZoom.value);
  const animationPosition = (datum: LabelDatum): Position =>
    getLabelPosition(
      datum,
      animation?.time ?? null,
      animation?.domainStart ?? 0,
      animation?.maxHeight ?? 0,
      animation?.domainSpan ?? 0,
    );
  const isVisible =
    settings.showLabels.value === true && zoom >= minZoom && zoom <= maxZoom;

  return new FeatureLabelLayer({
    id: animation ? `${LABEL_LAYER_ID}-temporal` : LABEL_LAYER_ID,
    data,
    visible: isVisible,
    pickable: false,
    billboard: true,
    parameters: {
      depthWriteEnabled: false,
      depthCompare: "always",
    },
    fontFamily: settings.font.fontFamily.value,
    fontWeight:
      settings.font.bold?.value && settings.font.italic?.value
        ? "bold italic"
        : settings.font.bold?.value
          ? "bold"
          : settings.font.italic?.value
            ? "italic"
            : "normal",
    characterSet: "auto",
    fontSettings: {
      sdf: true,
      fontSize: atlasFontSize,
      buffer: LABEL_ATLAS_BUFFER,
      radius: LABEL_ATLAS_RADIUS,
      smoothing: atlasSmoothing,
    },
    getText: (datum) =>
      animation &&
      !isLabelVisibleAtTime(
        datum,
        animation.time,
        animation.domainStart,
        animation.trailLength,
      )
        ? ""
        : datum.text,
    getPosition: animationPosition,
    getColor: textColor,
    getSize: fontSize,
    getTextAnchor: layout.textAnchor,
    getAlignmentBaseline: layout.alignmentBaseline,
    getPixelOffset: layout.pixelOffset,
    background: settings.showBox.value === true,
    getBackgroundColor: backgroundColor,
    getBorderColor: borderColor,
    getBorderWidth: settings.borderWidth.value,
    backgroundBorderRadius: borderRadius,
    backgroundPadding: [
      settings.boxPadding.value,
      settings.boxPadding.value,
      settings.boxPadding.value,
      settings.boxPadding.value,
    ],
    outlineWidth: settings.showGlow.value
      ? getSdfOutlineWidth(settings.glowWidth.value, fontSize, atlasFontSize)
      : 0,
    outlineColor: glowColor,
    extensions: [new CollisionFilterExtension()],
    collisionEnabled: true,
    collisionGroup: LABEL_COLLISION_GROUP,
    getCollisionPriority: (datum) => clampPriority(datum.priority ?? 0),
    collisionTestProps: {
      getSize: fontSize + Math.max(0, settings.collisionPadding.value) * 2,
    },
    minZoom,
    maxZoom,
    zoom,
    collisionPadding: settings.collisionPadding.value,
    showShadow: settings.showShadow.value === true,
    shadowColor,
    shadowOpacity: settings.shadowOpacity.value,
    shadowBlur: settings.shadowBlur.value,
    shadowOffsetX: settings.shadowOffsetX.value,
    shadowOffsetY: settings.shadowOffsetY.value,
    showGlow: settings.showGlow.value === true,
    glowWidth: settings.glowWidth.value,
    time: animation?.time ?? null,
    domainStart: animation?.domainStart ?? 0,
    domainSpan: animation?.domainSpan ?? 0,
    trailLength: animation?.trailLength ?? 0,
    maxHeight: animation?.maxHeight ?? 0,
    updateTriggers: {
      getText: [animation?.time ?? null, animation?.trailLength ?? 0],
      getPosition: [
        animation?.time ?? null,
        animation?.maxHeight ?? 0,
        animation?.domainStart ?? 0,
        animation?.domainSpan ?? 0,
      ],
      getColor: [settings.textColor.value.value, settings.textOpacity.value],
      getSize: [settings.font.fontSize.value],
      getPixelOffset: [
        settings.offsetX.value,
        settings.offsetY.value,
        settings.placement.value.value,
        settings.showBox.value,
        settings.boxPadding.value,
        settings.borderWidth.value,
      ],
    },
  });
};
