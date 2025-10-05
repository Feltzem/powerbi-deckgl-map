import { PolygonLayer } from '@deck.gl/layers';
import { OurData } from '../dataPoint';
import { InputGeometryType } from '../enum';
import { withOpacity, decodeHex } from '../col';
import { PolygonCardSettings } from '../settings';

export default function getPolygonLayer(highlights: boolean, dataPoints: OurData[], settings: PolygonCardSettings, selectedIds: string[], onClick: (info: any, event: any) => void) {
    const defaultLineColor = withOpacity(decodeHex(settings.line.color.defaultLineColor.value.value, [0, 0, 0, 100]), settings.line.color.defaultLineOpacity.value);
    const defaultFillColor = withOpacity(decodeHex(settings.fill.defaultFillColor.value.value, [0, 0, 0, 100]), settings.fill.defaultFillOpacity.value);
    let data = dataPoints.filter(x => x.type === InputGeometryType.Polygon);
    if (highlights) {
        data = data.filter(x => selectedIds.includes(x.id));
    }
    const scale = highlights ? settings.highlight.highlightSizeScale.value : 1.0;
    const highlightCol = withOpacity(decodeHex(settings.highlight.highlightColor.value.value, [255, 0, 0, 255]), settings.highlight.highlightOpacity.value);

    return new PolygonLayer<OurData>({
        id: 'polygon-layer',
        data: data,
        pickable: true,
        getPolygon: d => d.polygonData?.rings ? d.polygonData.rings.map(ring => ring.coordinates.map(c => [c.lon, c.lat, highlights ? 0 : 0.1])) : [], // TODO: offset doesn't seem to work?
        stroked: settings.stroked.value,
        positionFormat: "XYZ",
        getLineColor: d => highlights ? highlightCol : decodeHex(d.polygonProperties?.lineColor, defaultLineColor),
        getLineWidth: d => {
            const w = d.polygonProperties?.lineWidth;
            if (typeof w === "number" && isFinite(w) && w > 0) {
                return w * scale;
            }
            return settings.line.width.defaultLineWidth.value * scale;
        },
        lineWidthMinPixels: settings.line.width.lineWidthMinPixels.value * scale,
        lineWidthMaxPixels: settings.line.width.lineWidthMaxPixels.value * scale,
        filled: settings.filled.value,
        getFillColor: d => highlights ? highlightCol : decodeHex(d.polygonProperties?.fillColor, defaultFillColor),
        extruded: settings.extruded.value,
        getElevation: d => d.polygonProperties?.elevation,
        wireframe: settings.wireframe.value,
        lineJointRounded: settings.path.lineJointRounded.value,
        lineMiterLimit: settings.path.lineMiterLimit.value,
        onClick: (info, event) => onClick(info, event),
        updateTriggers: {
            getLineWidth: [settings.line.width.defaultLineWidth.value, settings.highlight.highlightSizeScale.value, selectedIds],
            getLineColor: [settings.line.color.defaultLineColor.value.value, settings.line.color.defaultLineOpacity.value, settings.highlight.highlightColor.value.value, settings.highlight.highlightOpacity.value, selectedIds],
            getFillColor: [settings.fill.defaultFillColor.value.value, settings.fill.defaultFillOpacity.value, settings.highlight.highlightColor.value.value, settings.highlight.highlightOpacity.value, selectedIds],
            getCapRounded: [settings.path.lineCapRounded.value],
            getJointRounded: [settings.path.lineJointRounded.value],
            getMiterLimit: [settings.path.lineMiterLimit.value],
            getBillboard: [settings.billboard.billboard.value],
        },
    });
};