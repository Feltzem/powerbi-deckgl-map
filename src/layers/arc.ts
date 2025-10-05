import { ArcLayer } from '@deck.gl/layers';
import { OurData } from '../dataPoint';
import { InputGeometryType } from '../enum';
import { withOpacity, decodeHex } from '../col';
import { ArcCardSettings } from '../settings';
export default function getArcLayer(highlights: boolean, dataPoints: OurData[], settings: ArcCardSettings, selectedIds: string[], onClick: (info: any, event: any) => void) {

    const defaultSourceColor = withOpacity(decodeHex(settings.defaultSourceColor.value.value, [0, 0, 0, 100]), settings.defaultSourceOpacity.value);
    const defaultTargetColor = withOpacity(decodeHex(settings.defaultTargetColor.value.value, [0, 0, 0, 100]), settings.defaultTargetOpacity.value);
    let data = dataPoints.filter(x => x.type === InputGeometryType.Arc);
    if (highlights) {
        data = data.filter(x => selectedIds.includes(x.id));
    }
    const scale = highlights ? settings.highlight.highlightSizeScale.value : 1.0;
    const highlightCol = withOpacity(decodeHex(settings.highlight.highlightColor.value.value, [255, 0, 0, 255]), settings.highlight.highlightOpacity.value);

    return new ArcLayer<OurData>({
        id: 'arc-layer',
        data: data,
        pickable: true,
        getSourcePosition: d => [d.arcData!.point1.lon, d.arcData!.point1.lat],
        getTargetPosition: d => [d.arcData!.point2.lon, d.arcData!.point2.lat],
        getWidth: d => {
            const w = d.arcProperties?.lineWidth;
            if (typeof w === "number" && isFinite(w) && w > 0) {
                return w * scale;
            }
            return settings.strokeWidth.defaultLineWidth.value * scale;
        },
        getSourceColor: d => highlights ? highlightCol : decodeHex(d.arcProperties?.sourceColor, defaultSourceColor),
        getTargetColor: d => highlights ? highlightCol : decodeHex(d.arcProperties?.targetColor, defaultTargetColor),
        widthMinPixels: settings.strokeWidth.lineWidthMinPixels.value * scale,
        widthMaxPixels: settings.strokeWidth.lineWidthMaxPixels.value * scale,
        onClick: (info, event) => onClick(info, event),
        updateTriggers: {
            getWidth: [settings.strokeWidth.defaultLineWidth.value, settings.highlight.highlightSizeScale.value, selectedIds],
            getSourceColor: [settings.defaultSourceColor.value.value, settings.defaultSourceOpacity.value, settings.highlight.highlightColor.value.value, settings.highlight.highlightOpacity.value, selectedIds],
            getTargetColor: [settings.defaultTargetColor.value.value, settings.defaultTargetOpacity.value, settings.highlight.highlightColor.value.value, settings.highlight.highlightOpacity.value, selectedIds],
        },
    });
};