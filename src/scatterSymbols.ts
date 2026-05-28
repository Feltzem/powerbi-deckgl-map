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

type DropdownLikeValue = {
  value?: unknown;
  displayName?: unknown;
};

const normalizeScatterSymbolText = (value: string): string =>
  value.trim().toLowerCase().replace(/[\s_]+/g, "-");

const scatterSymbolAliases = new Map<string, ScatterSymbolType>();

for (const [symbolType, symbol] of scatterSymbolEntries) {
  scatterSymbolAliases.set(normalizeScatterSymbolText(symbolType), symbolType);
  scatterSymbolAliases.set(
    normalizeScatterSymbolText(symbol.displayName),
    symbolType,
  );
}

const resolveScatterSymbolType = (
  symbolType: unknown,
): ScatterSymbolType | null => {
  if (typeof symbolType === "string") {
    return (
      scatterSymbolAliases.get(normalizeScatterSymbolText(symbolType)) ?? null
    );
  }

  if (
    symbolType !== null &&
    typeof symbolType === "object" &&
    ("value" in symbolType || "displayName" in symbolType)
  ) {
    const dropdownValue = symbolType as DropdownLikeValue;
    return (
      resolveScatterSymbolType(dropdownValue.value) ??
      resolveScatterSymbolType(dropdownValue.displayName)
    );
  }

  return null;
};

export const getScatterSymbolType = (symbolType: unknown): ScatterSymbolType =>
  resolveScatterSymbolType(symbolType) ?? defaultScatterSymbolType;

export const getScatterSymbol = (
  symbolType: unknown,
): ScatterSymbolDefinition => scatterSymbols[getScatterSymbolType(symbolType)];

export const getScatterSymbolShaderValue = (
  symbolType: unknown,
): number => getScatterSymbol(symbolType).shaderValue;
