import { ScatterplotLayer } from '@deck.gl/layers';
import { OurData } from '../dataPoint';
import { InputGeometryType } from '../enum';
import { decodeHex, withOpacity } from '../col';
import { ScatterCardSettings } from '../settings';

export default function getScatterLayer(highlights: boolean, dataPoints: OurData[], settings: ScatterCardSettings, selectedIds: string[], onClick: (info: any, event: any) => void) {
    const defaultFillColor = withOpacity(decodeHex(settings.fill.defaultFillColor.value.value, [0, 0, 0, 100]), settings.fill.defaultFillOpacity.value);
    const defaultLineColor = withOpacity(decodeHex(settings.line.color.defaultLineColor.value.value, [0, 0, 0, 100]), settings.line.color.defaultLineOpacity.value);
    let data = dataPoints.filter(x => x.type === InputGeometryType.Scatter);
    if (highlights) {
        data = data.filter(x => selectedIds.includes(x.id));
    }
    const scale = highlights ? settings.highlight.highlightSizeScale.value : 1.0;
    const highlightCol = withOpacity(decodeHex(settings.highlight.highlightColor.value.value, [255, 0, 0, 255]), settings.highlight.highlightOpacity.value);

    return new ScatterplotLayer<OurData>({
        id: `scatterplot-layer-${highlights ? 'highlight' : 'normal'}`,
        data: data,
        pickable: true,
        stroked: settings.stroked.value,
        filled: settings.filled.value,
        getPosition: d => [d.scatterData!.lon, d.scatterData!.lat, highlights ? 0 : 0.1], // Slightly offset highlighted points to avoid z-fighting
        getLineWidth: d => {
            const w = d.scatterProperties?.lineWidth;
            if (typeof w === "number" && isFinite(w) && w > 0) {
                return w * scale;
            }
            return settings.line.width.defaultLineWidth.value * scale;
        },
        getRadius: d => {
            const r = d.scatterData?.radius;
            if (typeof r === "number" && isFinite(r) && r > 0) {
                return r * scale;
            }
            return settings.defaultRadius.value * scale;
        },
        getFillColor: d => highlights ? highlightCol : decodeHex(d.scatterProperties?.fillColor, defaultFillColor),
        getLineColor: d => highlights ? highlightCol : decodeHex(d.scatterProperties?.lineColor, defaultLineColor),
        radiusMinPixels: settings.radiusMinPixels.value * scale,
        radiusMaxPixels: settings.radiusMaxPixels.value * scale,
        billboard: settings.billboard.billboard.value,
        lineWidthMinPixels: settings.line.width.lineWidthMinPixels.value * scale,
        lineWidthMaxPixels: settings.line.width.lineWidthMaxPixels.value * scale,
        onClick: (info, event) => onClick(info, event),
        updateTriggers: {
            getLineWidth: [settings.line.width.defaultLineWidth.value, settings.highlight.highlightSizeScale.value, selectedIds],
            getRadius: [settings.defaultRadius.value, settings.highlight.highlightSizeScale.value, , selectedIds],
            getFillColor: [settings.fill.defaultFillColor.value.value, settings.fill.defaultFillOpacity.value, settings.highlight.highlightColor.value.value, settings.highlight.highlightOpacity.value, selectedIds],
            getLineColor: [settings.line.color.defaultLineColor.value.value, settings.line.color.defaultLineOpacity.value, settings.highlight.highlightColor.value.value, settings.highlight.highlightOpacity.value, , selectedIds],
        },
    });
};