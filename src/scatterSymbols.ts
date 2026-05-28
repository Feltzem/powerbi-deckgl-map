export interface ScatterSymbolDefinition {
  displayName: string;
  shaderValue: number;
}

export const scatterSymbols = {
  circle: {
    displayName: "Circle",
    shaderValue: 0,
  },
  square: {
    displayName: "Square",
    shaderValue: 1,
  },
  diamond: {
    displayName: "Diamond",
    shaderValue: 2,
  },
  triangle: {
    displayName: "Triangle",
    shaderValue: 3,
  },
  "inverted-triangle": {
    displayName: "Inverted triangle",
    shaderValue: 4,
  },
  hexagon: {
    displayName: "Hexagon",
    shaderValue: 5,
  },
  pentagon: {
    displayName: "Pentagon",
    shaderValue: 6,
  },
  star: {
    displayName: "Star",
    shaderValue: 7,
  },
  cross: {
    displayName: "Cross",
    shaderValue: 8,
  },
  "x-cross": {
    displayName: "X cross",
    shaderValue: 9,
  },
} as const satisfies Record<string, ScatterSymbolDefinition>;

export type ScatterSymbolType = keyof typeof scatterSymbols;

export const defaultScatterSymbolType: ScatterSymbolType = "circle";

export const scatterSymbolEntries = Object.entries(scatterSymbols) as Array<
  [ScatterSymbolType, (typeof scatterSymbols)[ScatterSymbolType]]
>;

export const scatterSymbolItems = scatterSymbolEntries.map(
  ([value, symbol]) => ({
    value,
    displayName: symbol.displayName,
  }),
);

export const getScatterSymbolType = (
  symbolType: string | null | undefined,
): ScatterSymbolType => {
  if (symbolType && symbolType in scatterSymbols) {
    return symbolType as ScatterSymbolType;
  }

  return defaultScatterSymbolType;
};

export const getScatterSymbol = (
  symbolType: string | null | undefined,
): ScatterSymbolDefinition => scatterSymbols[getScatterSymbolType(symbolType)];

export const getScatterSymbolShaderValue = (
  symbolType: string | null | undefined,
): number => getScatterSymbol(symbolType).shaderValue;
