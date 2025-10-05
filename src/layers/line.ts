import { LineLayer } from '@deck.gl/layers';
import { OurData } from '../dataPoint';
import { InputGeometryType } from '../enum';
import { withOpacity, decodeHex } from '../col';
import { LineCardSettings } from '../settings';
export default function getLineLayer(highlights: boolean, dataPoints: OurData[], settings: LineCardSettings, selectedIds: string[], onClick: (info: any, event: any) => void) {
    const defaultLineColor = withOpacity(decodeHex(settings.line.color.defaultLineColor.value.value, [0, 0, 0, 100]), settings.line.color.defaultLineOpacity.value);
    let data = dataPoints.filter(x => x.type === InputGeometryType.Line);
    if (highlights) {
        data = data.filter(x => selectedIds.includes(x.id));
    }
    const scale = highlights ? settings.highlight.highlightSizeScale.value : 1.0;
    const highlightCol = withOpacity(decodeHex(settings.highlight.highlightColor.value.value, [255, 0, 0, 255]), settings.highlight.highlightOpacity.value);

    return new LineLayer<OurData>({
        id: 'line-layer',
        data: data,
        pickable: true,
        getSourcePosition: d => [d.lineData!.point1.lon, d.lineData!.point1.lat, highlights ? 0 : 0.1], // Slightly offset highlighted points to avoid z-fighting
        getTargetPosition: d => [d.lineData!.point2.lon, d.lineData!.point2.lat, highlights ? 0 : 0.1], // Slightly offset highlighted points to avoid z-fighting
        getWidth: d => {
            const w = d.lineProperties?.lineWidth;
            if (typeof w === "number" && isFinite(w) && w > 0) {
                return w * scale;
            }
            return settings.line.width.defaultLineWidth.value * scale;
        },
        getColor: d => highlights ? highlightCol : decodeHex(d.lineProperties?.lineColor, defaultLineColor),
        widthMinPixels: settings.line.width.lineWidthMinPixels.value * scale,
        widthMaxPixels: settings.line.width.lineWidthMaxPixels.value * scale,
        onClick: (info, event) => onClick(info, event),
        updateTriggers: {
            getWidth: [settings.line.width.defaultLineWidth.value, settings.highlight.highlightSizeScale.value, selectedIds],
            getColor: [settings.line.color.defaultLineColor.value.value, settings.line.color.defaultLineOpacity.value, settings.highlight.highlightColor.value.value, settings.highlight.highlightOpacity.value, selectedIds],
        },
    });
};