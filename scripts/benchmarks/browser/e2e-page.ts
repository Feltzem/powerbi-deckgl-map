// Browser entry for end-to-end timings against the packaged visual.js. The
// page creates the visual exactly as Power BI does (plugin.create with an
// element and host), feeds it a data view, and times until deck.gl has drawn
// every layer.

import { createMockHost, ObjectValues } from "../datasets";
import { buildScenario } from "./scenarios";

interface EndToEndOptions {
  objects?: ObjectValues;
  animateMs?: number;
  settleMs?: number;
  width?: number;
  height?: number;
}

interface RenderMark {
  time: number;
  loaded: boolean;
  layerCount: number;
}

const nextFrame = () => new Promise<number>((resolve) => requestAnimationFrame(resolve));
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const waitFor = async (predicate: () => unknown, timeoutMs: number, label: string) => {
  const deadline = performance.now() + timeoutMs;
  while (!predicate()) {
    if (performance.now() > deadline) {
      throw new Error(`Timed out waiting for ${label}`);
    }
    await nextFrame();
  }
};

const percentile = (values: number[], fraction: number): number | null => {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))];
};

const summarize = (values: number[]) => ({
  count: values.length,
  p50: percentile(values, 0.5),
  p95: percentile(values, 0.95),
  max: values.length > 0 ? Math.max(...values) : null,
  mean: values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : null,
});

let current: { visual: any; container: HTMLElement } | null = null;

const destroyCurrent = () => {
  if (!current) {
    return;
  }
  try {
    current.visual.destroy();
  } catch {
    // The next scenario gets a fresh container either way.
  }
  current.container.remove();
  current = null;
};

const createVisual = async (width: number, height: number) => {
  destroyCurrent();
  const container = document.createElement("div");
  Object.assign(container.style, {
    position: "absolute",
    left: "0px",
    top: "0px",
    width: `${width}px`,
    height: `${height}px`,
  });
  document.body.appendChild(container);
  const plugin = (window as any).powerbi.visuals.plugins.powerbi_deckgl_map;
  const visual = plugin.create({ element: container, host: createMockHost() });
  current = { visual, container };
  await waitFor(() => visual.deckOverlay?._deck?.device, 30000, "map load and deck device");
  return visual;
};

const layersLoaded = (deck: any): boolean => {
  const layers = deck.layerManager?.getLayers?.() ?? [];
  return layers.length > 0 && layers.every((layer: any) => layer.isLoaded);
};

const measureDuration = (name: string): number | null => {
  const entries = performance.getEntriesByName(name, "measure");
  return entries.length > 0 ? entries[entries.length - 1].duration : null;
};

(window as any).benchE2E = {
  async run(key: string, options: EndToEndOptions = {}) {
    const width = options.width ?? 1280;
    const height = options.height ?? 800;
    const scenario = await buildScenario(key, options.objects ?? {});
    const visual = await createVisual(width, height);
    const overlay = visual.deckOverlay;
    const deck = overlay._deck;

    const renders: RenderMark[] = [];
    overlay.setProps({
      onAfterRender: () =>
        renders.push({
          time: performance.now(),
          loaded: layersLoaded(deck),
          layerCount: deck.layerManager?.getLayers?.().length ?? 0,
        }),
    });

    // Times each deck.gl frame: layer updates, attribute generation and draw submission.
    const deckFrames: Array<{ start: number; duration: number }> = [];
    const loopProps = deck.animationLoop?.props;
    if (loopProps?.onRender) {
      const onRender = loopProps.onRender;
      loopProps.onRender = (animationProps: unknown) => {
        const start = performance.now();
        try {
          return onRender(animationProps);
        } finally {
          deckFrames.push({ start, duration: performance.now() - start });
        }
      };
    }

    // Per-(sub)layer initialise/update time: attribute generation, tessellation
    // and accessor calls. Whatever is left of the frame is draw and shader setup.
    // deck.gl seals its LayerManager, so the hooks go on the prototype; each
    // page holds a single deck instance.
    const layerUpdateMs: Record<string, number> = {};
    const layerManagerPrototype = Object.getPrototypeOf(deck.layerManager);
    for (const method of ["_initializeLayer", "_updateLayer"]) {
      const original = layerManagerPrototype[method];
      layerManagerPrototype[method] = function (this: unknown, layer: any) {
        const start = performance.now();
        try {
          return original.call(this, layer);
        } finally {
          layerUpdateMs[layer.id] = (layerUpdateMs[layer.id] ?? 0) + performance.now() - start;
        }
      };
    }

    await nextFrame();
    await nextFrame();
    performance.clearMeasures();
    const heapBefore = (performance as any).memory?.usedJSHeapSize ?? null;

    const start = performance.now();
    visual.update(scenario.options);
    const updated = performance.now();
    await waitFor(
      () => renders.some((mark) => mark.time >= updated && mark.loaded),
      180000,
      "first complete draw",
    );
    const firstDraw = renders.find((mark) => mark.time >= updated && mark.loaded)!;
    const gl = deck.device.gl as WebGL2RenderingContext;
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
    const gpuDone = performance.now();
    const firstDrawFrames = deckFrames.filter(
      (frame) => frame.start >= updated && frame.start <= firstDraw.time,
    );

    const result: Record<string, unknown> = {
      id: scenario.id,
      description: scenario.description,
      rowCount: scenario.rowCount,
      updateCallMs: updated - start,
      parseMs: measureDuration("powerbi-deckgl-map:parse-data"),
      renderBuildMs: measureDuration("powerbi-deckgl-map:render"),
      firstDrawMs: firstDraw.time - start,
      firstDrawGpuSyncedMs: gpuDone - start,
      deckFramesToFirstDraw: firstDrawFrames.length,
      deckFrameCpuToFirstDrawMs: firstDrawFrames.reduce((sum, frame) => sum + frame.duration, 0),
      layerCount: firstDraw.layerCount,
      layerUpdateMs: Object.fromEntries(
        Object.entries(layerUpdateMs).sort(([, left], [, right]) => right - left),
      ),
      heapDeltaBytes:
        heapBefore === null ? null : (performance as any).memory.usedJSHeapSize - heapBefore,
    };

    // Settle: wait for a quiet period so screenshots and animation sampling
    // start from a fully drawn map.
    const settleMs = options.settleMs ?? 400;
    const settleDeadline = performance.now() + 15000;
    while (performance.now() < settleDeadline) {
      const lastRender = renders[renders.length - 1]?.time ?? 0;
      if (performance.now() - lastRender >= settleMs && !deck.needsRedraw?.({ clearRedrawFlags: false })) {
        break;
      }
      await sleep(50);
    }

    if (options.animateMs && options.animateMs > 0) {
      const tickDurations: number[] = [];
      const pushAnimationFrame = visual.pushAnimationFrame.bind(visual);
      const renderTimeSlider = visual.renderTimeSliderControl.bind(visual);
      let tickStart = 0;
      visual.pushAnimationFrame = () => {
        tickStart = performance.now();
        pushAnimationFrame();
      };
      visual.renderTimeSliderControl = () => {
        renderTimeSlider();
        if (tickStart > 0) {
          tickDurations.push(performance.now() - tickStart);
          tickStart = 0;
        }
      };

      const rafTimes: number[] = [];
      let sampling = true;
      const sampleFrame = (time: number) => {
        rafTimes.push(time);
        if (sampling) {
          requestAnimationFrame(sampleFrame);
        }
      };
      const deckFrameIndex = deckFrames.length;
      requestAnimationFrame(sampleFrame);
      const animationStartTime = visual.animationTime;
      await sleep(options.animateMs);
      sampling = false;
      const intervals = rafTimes.slice(1).map((time, index) => time - rafTimes[index]);
      const sampledDeckFrames = deckFrames.slice(deckFrameIndex).map((frame) => frame.duration);
      result.animation = {
        sampledMs: options.animateMs,
        playheadAdvanced: visual.animationTime !== animationStartTime,
        visualTickMs: summarize(tickDurations),
        deckFrameMs: summarize(sampledDeckFrames),
        rafIntervalMs: summarize(intervals),
        droppedFramePercent:
          intervals.length > 0
            ? (100 * intervals.filter((interval) => interval > 1000 / 60 * 1.5).length) / intervals.length
            : null,
      };
    }

    return result;
  },

  info() {
    const deck = current?.visual?.deckOverlay?._deck;
    const info = deck?.device?.info ?? {};
    return {
      userAgent: navigator.userAgent,
      renderer: info.renderer ?? null,
      vendor: info.vendor ?? null,
      gpu: info.gpu ?? null,
      deviceType: deck?.device?.type ?? null,
      devicePixelRatio: window.devicePixelRatio,
    };
  },

  destroy() {
    destroyCurrent();
  },
};
(window as any).benchReady = true;
