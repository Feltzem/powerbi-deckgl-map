import { Geometry, Position } from "geojson";

/**
 * Packed geometry: many decoded geometries in a few typed arrays, so a worker can hand them to the main thread
 * as transferable buffers instead of millions of nested JS arrays. The main thread turns one row back into
 * GeoJSON with `unpackGeometry`, which is a tight loop over numbers.
 *
 * Per row: `codes` (0 = not decoded), `dims` (2 or 3), and start offsets into `coords` and `structure`.
 * `structure` holds the counts needed to rebuild nesting, in prefix order:
 *   Point            (nothing)
 *   LineString       [nPoints]
 *   MultiPoint       [nPoints]
 *   Polygon          [nRings, nPoints per ring...]
 *   MultiLineString  [nLines, nPoints per line...]
 *   MultiPolygon     [nPolygons, then per polygon: nRings, nPoints per ring...]
 */
export const GeometryCode = {
  None: 0,
  Point: 1,
  LineString: 2,
  Polygon: 3,
  MultiPoint: 4,
  MultiLineString: 5,
  MultiPolygon: 6,
} as const;

export interface PackedGeometryBatch {
  count: number;
  codes: Uint8Array;
  dims: Uint8Array;
  coordStart: Uint32Array;
  structureStart: Uint32Array;
  coords: Float64Array;
  structure: Uint32Array;
}

export const packedBatchBuffers = (batch: PackedGeometryBatch): ArrayBuffer[] =>
  [batch.codes, batch.dims, batch.coordStart, batch.structureStart, batch.coords, batch.structure].map(
    (array) => array.buffer as ArrayBuffer,
  );

class GrowableF64 {
  data = new Float64Array(1024);
  length = 0;
  push(value: number) {
    if (this.length === this.data.length) this.grow();
    this.data[this.length++] = value;
  }
  private grow() {
    const next = new Float64Array(this.data.length * 2);
    next.set(this.data);
    this.data = next;
  }
}

class GrowableU32 {
  data = new Uint32Array(256);
  length = 0;
  push(value: number) {
    if (this.length === this.data.length) {
      const next = new Uint32Array(this.data.length * 2);
      next.set(this.data);
      this.data = next;
    }
    this.data[this.length++] = value;
  }
  /** Reserve a slot to fill in once a count is known. */
  reserve(): number {
    this.push(0);
    return this.length - 1;
  }
}

export class PackedGeometryWriter {
  private codes: Uint8Array;
  private dims: Uint8Array;
  private coordStart: Uint32Array;
  private structureStart: Uint32Array;
  private coords = new GrowableF64();
  private structure = new GrowableU32();
  private row = 0;

  constructor(private readonly count: number) {
    this.codes = new Uint8Array(count);
    this.dims = new Uint8Array(count);
    this.coordStart = new Uint32Array(count + 1);
    this.structureStart = new Uint32Array(count + 1);
  }

  /** Begin writing a row; `commit` or `skip` must follow. */
  begin() {
    this.coordStart[this.row] = this.coords.length;
    this.structureStart[this.row] = this.structure.length;
  }

  /** Discard anything written for the current row, leave it undecoded and move on. */
  skip() {
    this.coords.length = this.coordStart[this.row];
    this.structure.length = this.structureStart[this.row];
    this.codes[this.row] = GeometryCode.None;
    this.row += 1;
  }

  /** A row with nothing to decode. */
  empty() {
    this.begin();
    this.skip();
  }

  commit(code: number, dims: number) {
    this.codes[this.row] = code;
    this.dims[this.row] = dims;
    this.row += 1;
  }

  pushCoord(value: number) {
    this.coords.push(value);
  }

  pushCount(value: number) {
    this.structure.push(value);
  }

  reserveCount(): number {
    return this.structure.reserve();
  }

  setCount(slot: number, value: number) {
    this.structure.data[slot] = value;
  }

  finish(): PackedGeometryBatch {
    for (let index = this.row; index <= this.count; index += 1) {
      this.coordStart[index] = this.coords.length;
      this.structureStart[index] = this.structure.length;
    }
    return {
      count: this.count,
      codes: this.codes,
      dims: this.dims,
      coordStart: this.coordStart,
      structureStart: this.structureStart,
      coords: this.coords.data.slice(0, this.coords.length),
      structure: this.structure.data.slice(0, this.structure.length),
    };
  }
}

// ── WKT ─────────────────────────────────────────────────────────────────────

const enum Ch {
  Tab = 9,
  LF = 10,
  CR = 13,
  Space = 32,
  Open = 40,
  Close = 41,
  Plus = 43,
  Comma = 44,
  Minus = 45,
  Dot = 46,
  D0 = 48,
  D9 = 57,
  E = 69,
  e = 101,
}

const wktTypes: Record<string, number> = {
  POINT: GeometryCode.Point,
  LINESTRING: GeometryCode.LineString,
  POLYGON: GeometryCode.Polygon,
  MULTIPOINT: GeometryCode.MultiPoint,
  MULTILINESTRING: GeometryCode.MultiLineString,
  MULTIPOLYGON: GeometryCode.MultiPolygon,
};

/** Thrown internally to abandon the fast path; the caller falls back to loaders.gl. */
const FALLBACK = new Error("wkt fallback");

class WktScanner {
  pos = 0;
  dims = 0;
  constructor(
    readonly text: string,
    readonly out: PackedGeometryWriter,
  ) {}

  ws() {
    const text = this.text;
    let c = text.charCodeAt(this.pos);
    while (c === Ch.Space || c === Ch.Tab || c === Ch.LF || c === Ch.CR) c = text.charCodeAt(++this.pos);
  }

  expect(code: number) {
    this.ws();
    if (this.text.charCodeAt(this.pos) !== code) throw FALLBACK;
    this.pos += 1;
  }

  /** Consume a comma if present; returns whether there was one. */
  comma(): boolean {
    this.ws();
    if (this.text.charCodeAt(this.pos) === Ch.Comma) {
      this.pos += 1;
      return true;
    }
    return false;
  }

  peek(code: number): boolean {
    this.ws();
    return this.text.charCodeAt(this.pos) === code;
  }

  word(): string {
    this.ws();
    const start = this.pos;
    const text = this.text;
    let c = text.charCodeAt(this.pos);
    while ((c >= 65 && c <= 90) || (c >= 97 && c <= 122)) c = text.charCodeAt(++this.pos);
    return text.slice(start, this.pos).toUpperCase();
  }

  /** A strict number token: [+-]? (digits [. digits?] | . digits) ([eE] [+-]? digits)? */
  number(): number | null {
    this.ws();
    const text = this.text;
    const start = this.pos;
    let p = this.pos;
    let c = text.charCodeAt(p);
    if (c === Ch.Plus || c === Ch.Minus) c = text.charCodeAt(++p);
    let digits = 0;
    while (c >= Ch.D0 && c <= Ch.D9) {
      c = text.charCodeAt(++p);
      digits += 1;
    }
    if (c === Ch.Dot) {
      c = text.charCodeAt(++p);
      while (c >= Ch.D0 && c <= Ch.D9) {
        c = text.charCodeAt(++p);
        digits += 1;
      }
    }
    if (digits === 0) return null;
    if (c === Ch.E || c === Ch.e) {
      c = text.charCodeAt(++p);
      if (c === Ch.Plus || c === Ch.Minus) c = text.charCodeAt(++p);
      let expDigits = 0;
      while (c >= Ch.D0 && c <= Ch.D9) {
        c = text.charCodeAt(++p);
        expDigits += 1;
      }
      if (expDigits === 0) throw FALLBACK;
    }
    this.pos = p;
    return Number(text.slice(start, p));
  }

  /** One position: 2 or 3 numbers. All positions in a geometry must have the same dimension. */
  position() {
    const x = this.number();
    const y = this.number();
    if (x === null || y === null) throw FALLBACK;
    const z = this.number();
    const dims = z === null ? 2 : 3;
    if (this.dims === 0) this.dims = dims;
    else if (this.dims !== dims) throw FALLBACK;
    this.out.pushCoord(x);
    this.out.pushCoord(y);
    if (z !== null) this.out.pushCoord(z);
  }

  /** "( p, p, ... )" → number of positions. MultiPoint may wrap each position in its own parentheses. */
  positions(allowWrapped = false): number {
    this.expect(Ch.Open);
    let count = 0;
    do {
      if (allowWrapped && this.peek(Ch.Open)) {
        this.pos += 1;
        this.position();
        this.expect(Ch.Close);
      } else {
        this.position();
      }
      count += 1;
    } while (this.comma());
    this.expect(Ch.Close);
    return count;
  }

  /** "( (..), (..) )": writes a count slot then one point count per ring/line. */
  rings() {
    this.expect(Ch.Open);
    const slot = this.out.reserveCount();
    let count = 0;
    do {
      this.out.pushCount(this.positions());
      count += 1;
    } while (this.comma());
    this.expect(Ch.Close);
    this.out.setCount(slot, count);
  }
}

/**
 * Parse common WKT into the writer's current row. Returns false (row left undecoded) for anything outside the
 * fast path so the caller can use loaders.gl, which keeps results and error messages identical to before.
 */
export function packWkt(out: PackedGeometryWriter, text: string): boolean {
  out.begin();
  const first = text.charCodeAt(0);
  // loaders.gl returns null for leading whitespace and accepts "SRID=...;" prefixes; leave both to it.
  if (!((first >= 65 && first <= 90) || (first >= 97 && first <= 122))) {
    out.skip();
    return false;
  }
  const scanner = new WktScanner(text, out);
  try {
    const code = wktTypes[scanner.word()];
    if (!code) throw FALLBACK;
    const save = scanner.pos;
    const modifier = scanner.word();
    if (modifier !== "Z") {
      if (modifier !== "") throw FALLBACK; // M, ZM, EMPTY
      scanner.pos = save;
    }
    switch (code) {
      case GeometryCode.Point:
        scanner.expect(Ch.Open);
        scanner.position();
        scanner.expect(Ch.Close);
        break;
      case GeometryCode.LineString:
        out.pushCount(scanner.positions());
        break;
      case GeometryCode.MultiPoint:
        out.pushCount(scanner.positions(true));
        break;
      case GeometryCode.Polygon:
      case GeometryCode.MultiLineString:
        scanner.rings();
        break;
      case GeometryCode.MultiPolygon: {
        scanner.expect(Ch.Open);
        const slot = out.reserveCount();
        let count = 0;
        do {
          scanner.rings();
          count += 1;
        } while (scanner.comma());
        scanner.expect(Ch.Close);
        out.setCount(slot, count);
        break;
      }
    }
    scanner.ws();
    if (scanner.pos !== text.length) throw FALLBACK;
    out.commit(code, scanner.dims);
    return true;
  } catch (error) {
    if (error !== FALLBACK) throw error;
    out.skip();
    return false;
  }
}

// ── GeoJSON (for WKP, which decodes to GeoJSON) ─────────────────────────────

const geoJsonCodes: Record<string, number> = {
  Point: GeometryCode.Point,
  LineString: GeometryCode.LineString,
  Polygon: GeometryCode.Polygon,
  MultiPoint: GeometryCode.MultiPoint,
  MultiLineString: GeometryCode.MultiLineString,
  MultiPolygon: GeometryCode.MultiPolygon,
};

/** Pack a GeoJSON geometry; false (row left undecoded) for collections or mixed dimensions. */
export function packGeoJson(out: PackedGeometryWriter, geometry: Geometry | null | undefined): boolean {
  out.begin();
  const code = geometry ? geoJsonCodes[geometry.type] : undefined;
  if (!geometry || !code || !("coordinates" in geometry)) {
    out.skip();
    return false;
  }
  let dims = 0;
  const position = (p: Position) => {
    if (dims === 0) dims = p.length;
    if (p.length !== dims || (dims !== 2 && dims !== 3)) throw FALLBACK;
    for (let i = 0; i < dims; i += 1) out.pushCoord(p[i]);
  };
  const line = (points: Position[]) => {
    out.pushCount(points.length);
    points.forEach(position);
  };
  const rings = (lines: Position[][]) => {
    out.pushCount(lines.length);
    lines.forEach(line);
  };
  try {
    const c = geometry.coordinates as unknown;
    if (code === GeometryCode.Point) position(c as Position);
    else if (code === GeometryCode.LineString || code === GeometryCode.MultiPoint) line(c as Position[]);
    else if (code === GeometryCode.Polygon || code === GeometryCode.MultiLineString) rings(c as Position[][]);
    else {
      const polygons = c as Position[][][];
      out.pushCount(polygons.length);
      polygons.forEach(rings);
    }
    out.commit(code, dims || 2);
    return true;
  } catch (error) {
    if (error !== FALLBACK) throw error;
    out.skip();
    return false;
  }
}

// ── Back to GeoJSON on the main thread ──────────────────────────────────────

export function unpackGeometry(batch: PackedGeometryBatch, row: number): Geometry | null {
  const code = batch.codes[row];
  if (code === GeometryCode.None) return null;
  const dims = batch.dims[row];
  const coords = batch.coords;
  const structure = batch.structure;
  let c = batch.coordStart[row];
  let s = batch.structureStart[row];

  const position = (): Position => {
    const p = dims === 3 ? [coords[c], coords[c + 1], coords[c + 2]] : [coords[c], coords[c + 1]];
    c += dims;
    return p;
  };
  const line = (): Position[] => {
    const n = structure[s++];
    const points = new Array<Position>(n);
    for (let i = 0; i < n; i += 1) points[i] = position();
    return points;
  };
  const rings = (): Position[][] => {
    const n = structure[s++];
    const out = new Array<Position[]>(n);
    for (let i = 0; i < n; i += 1) out[i] = line();
    return out;
  };

  switch (code) {
    case GeometryCode.Point:
      return { type: "Point", coordinates: position() };
    case GeometryCode.LineString:
      return { type: "LineString", coordinates: line() };
    case GeometryCode.MultiPoint:
      return { type: "MultiPoint", coordinates: line() };
    case GeometryCode.Polygon:
      return { type: "Polygon", coordinates: rings() };
    case GeometryCode.MultiLineString:
      return { type: "MultiLineString", coordinates: rings() };
    case GeometryCode.MultiPolygon: {
      const n = structure[s++];
      const polygons = new Array<Position[][]>(n);
      for (let i = 0; i < n; i += 1) polygons[i] = rings();
      return { type: "MultiPolygon", coordinates: polygons };
    }
    default:
      return null;
  }
}
