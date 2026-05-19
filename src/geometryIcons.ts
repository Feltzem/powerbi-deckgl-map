import {
  GEOMETRY_TYPE_LABELS,
  RenderableGeometryType,
} from "./layerState";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

const getGeometryIconPaths = (geometryType: RenderableGeometryType): string => {
  switch (geometryType) {
    case "scatter":
      return '<circle cx="10" cy="10" r="5.5" />';
    case "line":
      return '<line x1="4" y1="15" x2="16" y2="5" />';
    case "arc":
      return '<path d="M3.5 15.5 C6.5 4.5 13.5 4.5 16.5 15.5" />';
    case "path":
      return '<polyline points="3.5 14.5 7.5 7.5 11.5 12.5 16.5 5.5" />';
    case "polygon":
      return '<polygon points="10 3.5 16 7.5 14 15.5 6 15.5 4 7.5" />';
  }
};

const createSvgChild = (
  tagName: "circle" | "line" | "path" | "polyline" | "polygon",
  attributes: Record<string, string>,
): SVGElement => {
  const element = document.createElementNS(SVG_NAMESPACE, tagName);
  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, value);
  }

  return element;
};

const createGeometryIconShapeElement = (
  geometryType: RenderableGeometryType,
): SVGElement => {
  switch (geometryType) {
    case "scatter":
      return createSvgChild("circle", { cx: "10", cy: "10", r: "5.5" });
    case "line":
      return createSvgChild("line", {
        x1: "4",
        y1: "15",
        x2: "16",
        y2: "5",
      });
    case "arc":
      return createSvgChild("path", {
        d: "M3.5 15.5 C6.5 4.5 13.5 4.5 16.5 15.5",
      });
    case "path":
      return createSvgChild("polyline", {
        points: "3.5 14.5 7.5 7.5 11.5 12.5 16.5 5.5",
      });
    case "polygon":
      return createSvgChild("polygon", {
        points: "10 3.5 16 7.5 14 15.5 6 15.5 4 7.5",
      });
  }
};

export const getGeometryIconHtml = (
  geometryType: RenderableGeometryType,
  className: string,
): string => {
  const label = GEOMETRY_TYPE_LABELS[geometryType];

  return [
    `<svg class="${className} ${className}--${geometryType}"`,
    `viewBox="0 0 20 20" role="img" aria-label="${label} geometry">`,
    `<title>${label} geometry</title>`,
    getGeometryIconPaths(geometryType),
    "</svg>",
  ].join("");
};

export const createGeometryIconElement = (
  geometryType: RenderableGeometryType,
  className: string,
): SVGSVGElement => {
  const label = GEOMETRY_TYPE_LABELS[geometryType];
  const svg = document.createElementNS(SVG_NAMESPACE, "svg");
  svg.setAttribute("class", `${className} ${className}--${geometryType}`);
  svg.setAttribute("viewBox", "0 0 20 20");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", `${label} geometry`);

  const title = document.createElementNS(SVG_NAMESPACE, "title");
  title.textContent = `${label} geometry`;
  svg.appendChild(title);
  svg.appendChild(createGeometryIconShapeElement(geometryType));

  return svg;
};
