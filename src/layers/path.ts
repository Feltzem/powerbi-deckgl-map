import { PathLayer } from '@deck.gl/layers';
import { OurData } from '../dataPoint';
import { InputGeometryType } from '../enum';
import { withOpacity, decodeHex } from '../col';
import { PathCardSettings } from '../settings';
export default function getPathLayer(highlights: boolean, dataPoints: OurData[], settings: PathCardSettings, selectedIds: string[], onClick: (info: any, event: any) => void) {
    const defaultLineColor = withOpacity(decodeHex(settings.line.color.defaultLineColor.value.value, [0, 0, 0, 100]), settings.line.color.defaultLineOpacity.value);
    let data = dataPoints.filter(x => x.type === InputGeometryType.Path);
    if (highlights) {
        data = data.filter(x => selectedIds.includes(x.id));
    }
    const scale = highlights ? settings.highlight.highlightSizeScale.value : 1.0;
    const highlightCol = withOpacity(decodeHex(settings.highlight.highlightColor.value.value, [255, 0, 0, 255]), settings.highlight.highlightOpacity.value);

    return new PathLayer<OurData>({
        id: 'path-layer',
        data: data,
        pickable: true,
        getPath: d => d.pathData?.coordinates ? d.pathData.coordinates.flatMap(c => [c.lon, c.lat, highlights ? 0 : 0.1]) : [], // Slightly offset highlighted points to avoid z-fighting
        positionFormat: "XYZ",
        getWidth: d => {
            const w = d.pathProperties?.lineWidth;
            if (typeof w === "number" && isFinite(w) && w > 0) {
                return w * scale;
            }
            return settings.line.width.defaultLineWidth.value * scale;
        },
        getColor: d => highlights ? highlightCol : decodeHex(d.pathProperties?.lineColor, defaultLineColor),
        widthMinPixels: settings.line.width.lineWidthMinPixels.value * scale,
        widthMaxPixels: settings.line.width.lineWidthMaxPixels.value * scale,
        capRounded: settings.path.lineCapRounded.value,
        jointRounded: settings.path.lineJointRounded.value,
        miterLimit: settings.path.lineMiterLimit.value,
        billboard: settings.billboard.billboard.value,
        onClick: (info, event) => onClick(info, event),
        updateTriggers: {
            getWidth: [settings.line.width.defaultLineWidth.value, settings.highlight.highlightSizeScale.value, selectedIds],
            getColor: [settings.line.color.defaultLineColor.value.value, settings.line.color.defaultLineOpacity.value, settings.highlight.highlightColor.value.value, settings.highlight.highlightOpacity.value, selectedIds],
            getCapRounded: [settings.path.lineCapRounded.value],
            getJointRounded: [settings.path.lineJointRounded.value],
            getMiterLimit: [settings.path.lineMiterLimit.value],
            getBillboard: [settings.billboard.billboard.value],
        },
    });
};