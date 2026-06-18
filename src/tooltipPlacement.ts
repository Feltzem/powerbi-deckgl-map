export interface TooltipPlacementBounds {
  width: number;
  height: number;
}

export interface TooltipPlacementOptions {
  x: number;
  y: number;
  bounds: TooltipPlacementBounds | null;
  maxWidth: number;
  cursorGap?: number;
  edgePadding?: number;
}

export const DEFAULT_TOOLTIP_CURSOR_GAP_PX = 12;
export const DEFAULT_TOOLTIP_EDGE_PADDING_PX = 8;

const isPositiveFinite = (value: number): boolean =>
  Number.isFinite(value) && value > 0;

const clampAvailableSpace = (value: number): number =>
  Math.max(0, Math.floor(value));

const formatPx = (value: number): string => `${Math.floor(value)}px`;

const getFallbackPlacementStyle = (
  x: number,
  y: number,
  maxWidth: number,
  cursorGap: number,
): Partial<CSSStyleDeclaration> => ({
  marginLeft: "0px",
  maxWidth: formatPx(maxWidth),
  transform: `translate(${formatPx(x)}, ${formatPx(y)}) translate(${formatPx(cursorGap)}, ${formatPx(cursorGap)})`,
});

export const getTooltipPlacementStyle = ({
  x,
  y,
  bounds,
  maxWidth,
  cursorGap = DEFAULT_TOOLTIP_CURSOR_GAP_PX,
  edgePadding = DEFAULT_TOOLTIP_EDGE_PADDING_PX,
}: TooltipPlacementOptions): Partial<CSSStyleDeclaration> => {
  const safeX = Number.isFinite(x) ? x : 0;
  const safeY = Number.isFinite(y) ? y : 0;
  const safeMaxWidth = isPositiveFinite(maxWidth) ? maxWidth : 0;
  const safeCursorGap = isPositiveFinite(cursorGap)
    ? cursorGap
    : DEFAULT_TOOLTIP_CURSOR_GAP_PX;
  const safeEdgePadding =
    Number.isFinite(edgePadding) && edgePadding >= 0
      ? edgePadding
      : DEFAULT_TOOLTIP_EDGE_PADDING_PX;

  if (
    !bounds ||
    !isPositiveFinite(bounds.width) ||
    !isPositiveFinite(bounds.height)
  ) {
    return getFallbackPlacementStyle(
      safeX,
      safeY,
      safeMaxWidth,
      safeCursorGap,
    );
  }

  const leftSpace = clampAvailableSpace(safeX - safeCursorGap - safeEdgePadding);
  const rightSpace = clampAvailableSpace(
    bounds.width - safeX - safeCursorGap - safeEdgePadding,
  );
  const aboveSpace = clampAvailableSpace(
    safeY - safeCursorGap - safeEdgePadding,
  );
  const belowSpace = clampAvailableSpace(
    bounds.height - safeY - safeCursorGap - safeEdgePadding,
  );

  const placeLeft = leftSpace > rightSpace;
  const placeAbove = aboveSpace > belowSpace;
  const horizontalSpace = placeLeft ? leftSpace : rightSpace;
  const verticalSpace = placeAbove ? aboveSpace : belowSpace;
  const resolvedMaxWidth = Math.min(safeMaxWidth, horizontalSpace);
  const xAnchor = placeLeft ? "-100%" : "0";
  const yAnchor = placeAbove ? "-100%" : "0";
  const xOffset = placeLeft ? -safeCursorGap : safeCursorGap;
  const yOffset = placeAbove ? -safeCursorGap : safeCursorGap;

  return {
    marginLeft: "0px",
    maxHeight: formatPx(verticalSpace),
    maxWidth: formatPx(resolvedMaxWidth),
    transform: `translate(${formatPx(safeX)}, ${formatPx(safeY)}) translate(${xAnchor}, ${yAnchor}) translate(${formatPx(xOffset)}, ${formatPx(yOffset)})`,
  };
};
