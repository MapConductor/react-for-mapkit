// MapKit JS の手書きフェイクと、src をテスト用にビルドする補助。
// 本物の mapkit はブラウザ専用（CDN から読み込み、WebGL/DOM 前提）なので、
// テストではレンダラーが触るコンストラクタとプロパティだけを globalThis.mapkit に置く。
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { after } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { build } from 'tsup';

class Coordinate {
    constructor(latitude, longitude) {
        this.latitude = latitude;
        this.longitude = longitude;
    }
}
class CoordinateSpan {
    constructor(latitudeDelta, longitudeDelta) {
        this.latitudeDelta = latitudeDelta;
        this.longitudeDelta = longitudeDelta;
    }
}
class CoordinateRegion {
    constructor(center, span) {
        this.center = center;
        this.span = span;
    }
}
class Style {
    constructor(options = {}) { Object.assign(this, options); }
}
class Overlay {
    constructor(points, options = {}) {
        this.points = points;
        Object.assign(this, options);
    }
}
class PolygonOverlay extends Overlay { kind = 'polygon'; }
class PolylineOverlay extends Overlay { kind = 'polyline'; }
class TileOverlay {
    constructor(urlTemplate, options = {}) {
        this.urlTemplate = urlTemplate;
        Object.assign(this, options);
    }
}
class ImageAnnotation {
    constructor(coordinate, options = {}) {
        this.coordinate = coordinate;
        Object.assign(this, options);
        this.listeners = {};
    }
    addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
}

class FakeDOMPoint {
    constructor(x = 0, y = 0) { this.x = x; this.y = y; }
}

/** Installs the fake `mapkit` global (and DOMPoint, which Node lacks). Idempotent. */
export function installFakeMapkit() {
    globalThis.mapkit = {
        Coordinate,
        CoordinateSpan,
        CoordinateRegion,
        Style,
        PolygonOverlay,
        PolylineOverlay,
        TileOverlay,
        ImageAnnotation,
        Map: { MapTypes: { Standard: 'Standard', Satellite: 'Satellite', Hybrid: 'Hybrid', MutedStandard: 'MutedStandard' } },
    };
    globalThis.DOMPoint ??= FakeDOMPoint;
    return globalThis.mapkit;
}

/**
 * A fake mapkit.Map: overlays live in an ordered array (MapKit draws them in
 * `map.overlays` order), tile overlays and annotations in their own lists, and
 * every mutation is logged so tests can check what reached the map.
 */
export function createFakeMap() {
    const log = [];
    const map = {
        overlays: [],
        tileOverlays: [],
        annotations: [],
        rotation: 0,
        center: { latitude: 0, longitude: 0 },
        listeners: {},
        log,
        addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); },
        dispatch(type) { for (const fn of this.listeners[type] ?? []) fn({ type }); },
        addOverlay(o) { log.push(['addOverlay', o]); this.overlays.push(o); },
        addOverlays(list) { log.push(['addOverlays', list]); this.overlays.push(...list); },
        removeOverlay(o) { log.push(['removeOverlay', o]); this.overlays = this.overlays.filter((x) => x !== o); },
        removeOverlays(list) { log.push(['removeOverlays', list]); this.overlays = this.overlays.filter((x) => !list.includes(x)); },
        addTileOverlay(o) { log.push(['addTileOverlay', o]); this.tileOverlays.push(o); },
        removeTileOverlay(o) { log.push(['removeTileOverlay', o]); this.tileOverlays = this.tileOverlays.filter((x) => x !== o); },
        addAnnotation(a) { log.push(['addAnnotation', a]); this.annotations.push(a); },
        removeAnnotation(a) { log.push(['removeAnnotation', a]); this.annotations = this.annotations.filter((x) => x !== a); },
    };
    return map;
}

/**
 * Compiles the given src entries with tsup into a temp dir under build/ and
 * imports them. Code splitting is on, so module-level state shared by several
 * entries (e.g. helpers.ts' overlay stacking keys) is one instance, as in the
 * published bundle.
 */
export async function buildSources(name, entries) {
    mkdirSync(new URL('../../build/', import.meta.url), { recursive: true });
    const outDir = mkdtempSync(fileURLToPath(new URL(`../../build/${name}-`, import.meta.url)));
    after(() => rmSync(outDir, { recursive: true, force: true }));
    await build({
        entry: entries,
        outDir, format: ['esm'], platform: 'node', splitting: true,
        dts: false, sourcemap: false, config: false, silent: true,
        external: ['@mapconductor/js-sdk-core', '@mapconductor/js-sdk-react', 'react'],
    });
    const modules = {};
    for (const key of Object.keys(entries)) {
        modules[key] = await import(pathToFileURL(resolve(outDir, `${key}.mjs`)));
    }
    return modules;
}
