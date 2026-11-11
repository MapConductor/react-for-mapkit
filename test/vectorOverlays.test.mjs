import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    createCircleState,
    createGeoPoint,
    createMapCameraPosition,
    createPolygonState,
    createPolylineState,
} from '@mapconductor/js-sdk-core';
import { buildSources, createFakeMap, installFakeMapkit } from './support/fakeMapkit.mjs';

// 円・ポリライン・ポリゴンを、地図だけフェイクにして実のコントローラ＋レンダラーで動かす。
// - 円は mapkit.CircleOverlay ではなく閉じたリングの PolygonOverlay として描く
// - 色は MapKit の Style（color + opacity 分離）へ、ポリゴンは evenodd で穴を抜く
// - どの図形も enabled:false（タップは JS 側の当たり判定で拾う）
// - 3 種を混ぜても map.overlays は polygon < circle < polyline に並ぶ
// - 差分（その場更新）・削除・クリア、MapKitTapHandlers の各 handle*Click の配送
installFakeMapkit();
const mods = await buildSources('vector-overlay-tests', {
    circle: 'src/circle/MapKitCircleController.ts',
    circleRenderer: 'src/circle/MapKitCircleOverlayRenderer.ts',
    polyline: 'src/polyline/MapKitPolylineController.ts',
    polylineRenderer: 'src/polyline/MapKitPolylineOverlayRenderer.ts',
    polygon: 'src/polygon/MapKitPolygonController.ts',
    polygonRenderer: 'src/polygon/MapKitPolygonOverlayRenderer.ts',
    tap: 'src/MapKitTapHandlers.ts',
});
const { MapKitCircleController } = mods.circle;
const { MapKitCircleOverlayRenderer } = mods.circleRenderer;
const { MapKitPolylineController } = mods.polyline;
const { MapKitPolylineOverlayRenderer } = mods.polylineRenderer;
const { MapKitPolygonController } = mods.polygon;
const { MapKitPolygonOverlayRenderer } = mods.polygonRenderer;
const { handleCircleClick, handlePolygonClick, handlePolylineClick, handleGroundImageClick, pointFromEvent, handleSingleTap } = mods.tap;

function fixture() {
    const map = createFakeMap();
    const holder = { map };
    return {
        map,
        circles: new MapKitCircleController(new MapKitCircleOverlayRenderer(holder)),
        polylines: new MapKitPolylineController(new MapKitPolylineOverlayRenderer(holder)),
        polygons: new MapKitPolygonController(new MapKitPolygonOverlayRenderer(holder)),
    };
}

const gp = (latitude, longitude) => createGeoPoint({ latitude, longitude });
const square = [gp(0, 0), gp(0, 10), gp(10, 10), gp(10, 0)];
const hole = [gp(4, 4), gp(4, 6), gp(6, 6), gp(6, 4)];

const circle = (id, o = {}) => createCircleState({ id, center: gp(35, 139), radiusMeters: 1000, ...o });
const line = (id, o = {}) => createPolylineState({ id, points: [gp(0, 0), gp(0, 5)], strokeColor: '#ff000080', strokeWidth: 4, ...o });
const poly = (id, o = {}) => createPolygonState({ id, points: square, fillColor: 'rgba(0, 0, 255, 0.5)', strokeColor: '#00ff00', ...o });

test('a circle is drawn as a closed polygon ring with split colors, not interactive', async () => {
    const f = fixture();
    await f.circles.composition([circle('c', { fillColor: '#ff000040', strokeColor: 'rgba(0,0,0,0.25)', strokeWidth: 3 })]);
    assert.equal(f.map.overlays.length, 1);
    const o = f.map.overlays[0];
    assert.ok(o instanceof mapkit.PolygonOverlay);
    assert.equal(o.enabled, false);
    assert.deepEqual(o.data, { id: 'c' });
    assert.ok(o.points.length > 16, 'ring is densified');
    const first = o.points[0];
    const last = o.points.at(-1);
    assert.equal(first.latitude, last.latitude);
    assert.equal(first.longitude, last.longitude);
    // every vertex roughly 1000 m from the center (≈0.009° of latitude)
    for (const p of o.points) {
        const dLat = (p.latitude - 35) * 111_320;
        const dLng = (p.longitude - 139) * 111_320 * Math.cos((35 * Math.PI) / 180);
        assert.ok(Math.abs(Math.hypot(dLat, dLng) - 1000) < 15);
    }
    assert.equal(o.style.fillColor, '#ff0000');
    assert.ok(Math.abs(o.style.fillOpacity - 0x40 / 255) < 1e-9);
    assert.equal(o.style.strokeColor, 'rgb(0, 0, 0)');
    assert.equal(o.style.strokeOpacity, 0.25);
    assert.equal(o.style.lineWidth, 3);
});

test('circle update changes the ring and style of the same overlay in place', async () => {
    const f = fixture();
    await f.circles.composition([circle('c')]);
    const o = f.map.overlays[0];
    await f.circles.update(circle('c', { radiusMeters: 5000, strokeColor: '#0000ff' }));
    assert.equal(f.map.overlays.length, 1);
    assert.equal(f.map.overlays[0], o, 'same overlay object');
    assert.ok(Math.abs(o.points[0].latitude - 35) > 0.03 || Math.abs(o.points[0].longitude - 139) > 0.03);
    assert.equal(o.style.strokeColor, '#0000ff');
});

test('polylines: <2 points draw nothing; style and enabled:false; removal', async () => {
    const f = fixture();
    await f.polylines.composition([line('one', { points: [gp(0, 0)] }), line('two')]);
    assert.equal(f.map.overlays.length, 1);
    const o = f.map.overlays[0];
    assert.ok(o instanceof mapkit.PolylineOverlay);
    assert.equal(o.enabled, false);
    assert.equal(o.style.strokeColor, '#ff0000');
    assert.ok(Math.abs(o.style.strokeOpacity - 128 / 255) < 1e-9);
    assert.equal(o.style.lineWidth, 4);
    assert.equal(o.points[0].longitude, 0);
    assert.equal(o.points.at(-1).longitude, 5);

    await f.polylines.composition([]);
    assert.equal(f.map.overlays.length, 0);
});

test('a polyline crossing the antimeridian keeps continuous longitudes', async () => {
    const f = fixture();
    await f.polylines.composition([line('dl', { points: [gp(0, 170), gp(0, -170)], geodesic: false })]);
    const lngs = f.map.overlays[0].points.map((p) => p.longitude);
    for (let i = 1; i < lngs.length; i++) {
        assert.ok(Math.abs(lngs[i] - lngs[i - 1]) <= 180, `jump between ${lngs[i - 1]} and ${lngs[i]}`);
    }
    assert.ok(Math.abs(lngs.at(-1) - 190) < 1e-9);
});

test('polygons: holes become extra rings, fill rule is evenodd, <3 points draw nothing', async () => {
    const f = fixture();
    await f.polygons.composition([poly('p', { holes: [hole] }), poly('tiny', { points: [gp(0, 0), gp(1, 1)] })]);
    assert.equal(f.map.overlays.length, 1);
    const o = f.map.overlays[0];
    assert.ok(o instanceof mapkit.PolygonOverlay);
    assert.equal(o.points.length, 2, 'outer ring + hole');
    assert.ok(Array.isArray(o.points[0]) && o.points[0][0] instanceof mapkit.Coordinate);
    assert.equal(o.enabled, false);
    assert.equal(o.style.fillRule, 'evenodd');
    assert.equal(o.style.fillColor, 'rgb(0, 0, 255)');
    assert.equal(o.style.fillOpacity, 0.5);
    assert.equal(o.style.strokeColor, '#00ff00');
    assert.equal(o.style.lineWidth, 1, 'default stroke width');
});

test('mixed overlay kinds are stacked polygon < circle < polyline regardless of add order', async () => {
    const f = fixture();
    await f.polylines.composition([line('L')]);
    await f.circles.composition([circle('C', { center: gp(1, 1) })]);
    await f.polygons.composition([poly('P')]);
    assert.deepEqual(f.map.overlays.map((o) => o.data.id), ['P', 'C', 'L']);

    // zIndex orders within a kind, but never lifts a polygon above a circle.
    await f.polygons.composition([poly('P'), poly('P9', { zIndex: 9 })]);
    assert.deepEqual(f.map.overlays.map((o) => o.data.id), ['P', 'P9', 'C', 'L']);
});

test('clear() removes every overlay from the map', async () => {
    const f = fixture();
    await f.polygons.composition([poly('a'), poly('b')]);
    await f.circles.composition([circle('c')]);
    await f.polygons.clear();
    await f.circles.clear();
    assert.equal(f.map.overlays.length, 0);
});

// ---- tap handlers ----

test('handle*Click find the hit overlay and dispatch the event, or report a miss', async () => {
    const f = fixture();
    await f.circles.composition([circle('c', { center: gp(0, 0), radiusMeters: 50_000 })]);
    await f.polygons.composition([poly('p', { points: [gp(20, 20), gp(20, 30), gp(30, 30), gp(30, 20)] })]);
    await f.polylines.composition([line('l', { points: [gp(-20, 0), gp(-20, 10)] })]);
    const camera = createMapCameraPosition({ position: gp(0, 0), zoom: 3 });
    await f.circles.onCameraChanged(camera);
    await f.polygons.onCameraChanged(camera);
    await f.polylines.onCameraChanged(camera);

    const events = [];
    f.circles.setOnClickListener((e) => events.push(['circle', e.state.id]));
    f.polygons.setOnClickListener((e) => events.push(['polygon', e.state.id]));
    f.polylines.setOnClickListener((e) => events.push(['polyline', e.state.id, e.clicked]));
    const deps = { circleController: f.circles, polygonController: f.polygons, polylineController: f.polylines };

    assert.equal(handleCircleClick(deps, gp(0.1, 0.1)), true);
    assert.equal(handleCircleClick(deps, gp(5, 5)), false);
    assert.equal(handlePolygonClick(deps, gp(25, 25)), true);
    assert.equal(handlePolygonClick(deps, gp(15, 25)), false);
    assert.equal(handlePolylineClick(deps, gp(-20.01, 5)), true);
    assert.equal(handlePolylineClick(deps, gp(0, 50)), false);

    assert.deepEqual(events.slice(0, 2), [['circle', 'c'], ['polygon', 'p']]);
    const [kind, id, clicked] = events[2];
    assert.equal(kind, 'polyline');
    assert.equal(id, 'l');
    // The polyline event reports the closest point on the line, not the raw tap.
    assert.ok(Math.abs(clicked.latitude - -20) < 0.01);
});

test('handleGroundImageClick dispatches only on a hit', () => {
    const dispatched = [];
    const state = { id: 'g' };
    const deps = {
        groundImageController: {
            find: (p) => (p.latitude > 0 ? { state } : null),
            dispatchClick: (e) => dispatched.push(e),
        },
    };
    assert.equal(handleGroundImageClick(deps, gp(1, 1)), true);
    assert.equal(handleGroundImageClick(deps, gp(-1, 1)), false);
    assert.equal(dispatched.length, 1);
    assert.equal(dispatched[0].state, state);
});

test('pointFromEvent / handleSingleTap convert pointOnPage and hand it to dispatchTap', () => {
    const taps = [];
    const deps = {
        map: { convertPointOnPageToCoordinate: (p) => new mapkit.Coordinate(p.y, p.x) },
        dispatchTap: (point) => { taps.push(point); return true; },
    };
    const point = pointFromEvent(deps, { pointOnPage: new DOMPoint(12, 34) });
    assert.equal(point.latitude, 34);
    assert.equal(point.longitude, 12);
    assert.equal(pointFromEvent(deps, {}), null, 'no pointOnPage');

    handleSingleTap(deps, { pointOnPage: new DOMPoint(1, 2) });
    handleSingleTap(deps, {});
    assert.equal(taps.length, 1);
    assert.equal(taps[0].latitude, 2);

    const noCoord = { ...deps, map: { convertPointOnPageToCoordinate: () => null } };
    assert.equal(pointFromEvent(noCoord, { pointOnPage: new DOMPoint(0, 0) }), null);
});
