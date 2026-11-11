import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createGeoPoint, createMapCameraPosition } from '@mapconductor/js-sdk-core';
import { buildSources, installFakeMapkit } from './support/fakeMapkit.mjs';

// カメラまわりの換算を、地図だけフェイクにして確かめる。
// - MapKitZoomAltitudeConverter: ネイティブと同じ zoom0 高度、ズーム1段で高度が半分
// - MapCameraPosition.ts: 論理カメラ ⇄ MapKit の center/cameraDistance/rotation の往復
// - MapKitCameraState: Google 基準ズームの region 算出（整数スナップ・cosLat）、
//   生きた投影からのズーム実測、レイアウト前の定数換算フォールバック、
//   アニメーション有無での地図への書き込み、tilt の論理値保持
installFakeMapkit();
const { camera, cameraState, zoom } = await buildSources('camera-tests', {
    camera: 'src/MapCameraPosition.ts',
    cameraState: 'src/MapKitCameraState.ts',
    zoom: 'src/zoom/ZoomAltitudeConverter.ts',
});
const { toMapKitCameraParams, toMapCameraPosition } = camera;
const { MapKitCameraState } = cameraState;
const { MapKitZoomAltitudeConverter } = zoom;

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} !~ ${b} (eps ${eps})`);

function pos({ lat = 0, lng = 0, zoom: z = 10, bearing = 0, tilt = 0 } = {}) {
    return createMapCameraPosition({ position: createGeoPoint({ latitude: lat, longitude: lng }), zoom: z, bearing, tilt });
}

test('converter uses the native MapKit zoom-0 altitude and halves the altitude per zoom level', () => {
    const c = new MapKitZoomAltitudeConverter();
    assert.equal(MapKitZoomAltitudeConverter.MAPKIT_OPTIMIZED_ZOOM0_ALTITUDE, 171_319_879.0);
    const a10 = c.zoomLevelToAltitude({ zoomLevel: 10, latitude: 0, tilt: 0 });
    const a11 = c.zoomLevelToAltitude({ zoomLevel: 11, latitude: 0, tilt: 0 });
    close(a10 / a11, 2, 1e-9);
    close(c.altitudeToZoomLevel({ altitude: a10, latitude: 0, tilt: 0 }), 10, 1e-9);
    // A custom zoom-0 altitude shifts every altitude proportionally.
    const half = new MapKitZoomAltitudeConverter(171_319_879.0 / 2);
    close(half.zoomLevelToAltitude({ zoomLevel: 10, latitude: 0, tilt: 0 }), a10 / 2, 1e-6);
});

test('toMapKitCameraParams / toMapCameraPosition round-trip center, zoom and bearing', () => {
    const c = new MapKitZoomAltitudeConverter();
    const start = pos({ lat: 35.68, lng: 139.76, zoom: 12.5, bearing: 30, tilt: 20 });
    const params = toMapKitCameraParams(start, c);
    assert.ok(params.center instanceof mapkit.Coordinate);
    assert.equal(params.center.latitude, 35.68);
    assert.equal(params.center.longitude, 139.76);
    // MapKit JS rotation is the same direction as MapConductor bearing (identity).
    assert.equal(params.rotation, 30);
    close(params.cameraDistance, c.zoomLevelToAltitude({ zoomLevel: 12.5, latitude: 35.68, tilt: 0 }));

    const back = toMapCameraPosition({ ...params, converter: c, logicalTiltHint: 20 });
    close(back.zoom, 12.5, 1e-9);
    close(back.bearing, 30, 1e-9);
    assert.equal(back.tilt, 20);
    assert.equal(back.position.latitude, 35.68);
    assert.equal(back.position.longitude, 139.76);
    // Without a hint, tilt reads back as 0 (MapKit JS is 2D).
    assert.equal(toMapCameraPosition({ ...params, converter: c }).tilt, 0);
});

// ---- MapKitCameraState against a fake map whose projection is exact Web Mercator ----

function mercY(lat) { return Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)); }
function invMercY(y) { return (Math.atan(Math.exp(y)) * 360) / Math.PI - 90; }

/**
 * A map + holder pair. The holder projects screen offsets with a Google-style
 * Web Mercator at `view.zoom` around `map.center` (north-up), so the measured
 * zoom can be checked exactly. `width`/`height` 0 means "not laid out yet".
 */
function fixture({ width = 800, height = 600, viewZoom = 10 } = {}) {
    const calls = [];
    const map = {
        center: new mapkit.Coordinate(0, 0),
        cameraDistance: 1000,
        rotation: 0,
        region: null,
        setRegionAnimated(region, animated) { calls.push(['setRegionAnimated', region, animated]); },
        setCenterAnimated(center, animated) { calls.push(['setCenterAnimated', center, animated]); },
        setCameraDistanceAnimated(d, animated) { calls.push(['setCameraDistanceAnimated', d, animated]); },
        setRotationAnimated(r, animated) { calls.push(['setRotationAnimated', r, animated]); },
    };
    const view = { zoom: viewZoom };
    const holder = {
        mapView: { clientWidth: width, clientHeight: height },
        fromScreenOffsetSync({ x, y }) {
            const worldPx = 256 * 2 ** view.zoom;
            const cx = ((map.center.longitude + 180) / 360) * worldPx;
            const cy = ((Math.PI - mercY(map.center.latitude)) / (2 * Math.PI)) * worldPx;
            const px = cx + (x - width / 2);
            const py = cy + (y - height / 2);
            return createGeoPoint({
                latitude: invMercY(Math.PI - (py / worldPx) * 2 * Math.PI),
                longitude: (px / worldPx) * 360 - 180,
            });
        },
    };
    const forwarded = [];
    const converter = new MapKitZoomAltitudeConverter();
    const state = new MapKitCameraState({ map, holder, converter, onCameraForward: (c) => forwarded.push(c) }, null);
    return { map, holder, view, calls, state, converter, forwarded };
}

test('regionForCamera spans the viewport at the Google zoom, snapping fractional targets', () => {
    const f = fixture({ width: 512, height: 256 });
    const region = f.state.regionForCamera(pos({ lat: 0, lng: 10, zoom: 2.4 }));
    // zoom 2.4 snaps to 2: 360° over 1024 px.
    close(region.span.longitudeDelta, (360 / 1024) * 512);
    close(region.span.latitudeDelta, (360 / 1024) * 256);
    assert.equal(region.center.latitude, 0);
    assert.equal(region.center.longitude, 10);

    // 9.5 rounds up to 10 (Google snaps half levels up).
    const r95 = f.state.regionForCamera(pos({ zoom: 9.5 }));
    close(r95.span.longitudeDelta, (360 / (256 * 1024)) * 512);

    // snapZoom=false keeps the fractional zoom (fitBounds path).
    const raw = f.state.regionForCamera(pos({ zoom: 2.5 }), false);
    close(raw.span.longitudeDelta, (360 / (256 * 2 ** 2.5)) * 512);
});

test('regionForCamera scales the latitude span by cos(latitude), clamped near the poles', () => {
    const f = fixture({ width: 100, height: 100 });
    const at60 = f.state.regionForCamera(pos({ lat: 60, zoom: 5 }));
    close(at60.span.latitudeDelta, at60.span.longitudeDelta * 0.5, 1e-9);
    const atPole = f.state.regionForCamera(pos({ lat: 90, zoom: 5 }));
    const cosMax = Math.cos((85.05112878 * Math.PI) / 180);
    close(atPole.span.latitudeDelta, atPole.span.longitudeDelta * cosMax, 1e-9);
});

test('regionForCamera returns null before layout', () => {
    assert.equal(fixture({ width: 0 }).state.regionForCamera(pos()), null);
    assert.equal(fixture({ height: 0 }).state.regionForCamera(pos()), null);
});

test('read() measures the Google zoom from the live projection', () => {
    for (const z of [3, 10.25, 16.7]) {
        const f = fixture({ viewZoom: z });
        f.map.center = new mapkit.Coordinate(35, 139);
        f.map.rotation = 45;
        const cam = f.state.read();
        close(cam.zoom, z, 1e-6);
        assert.equal(cam.position.latitude, 35);
        assert.equal(cam.position.longitude, 139);
        assert.equal(cam.bearing, 45);
        assert.ok(cam.visibleRegion, 'visible region is read from the four corners');
        assert.ok(cam.visibleRegion.farLeft.latitude > cam.visibleRegion.nearLeft.latitude);
        assert.ok(cam.visibleRegion.farRight.longitude > cam.visibleRegion.farLeft.longitude);
    }
});

test('read() unwraps a viewport that straddles the antimeridian', () => {
    const f = fixture({ viewZoom: 6 });
    f.map.center = new mapkit.Coordinate(0, 179.9);
    const raw = f.holder.fromScreenOffsetSync;
    // A real map reports normalized longitudes: the right edge comes back near -180.
    f.holder.fromScreenOffsetSync = (o) => {
        const p = raw(o);
        const lng = p.longitude > 180 ? p.longitude - 360 : p.longitude;
        return createGeoPoint({ latitude: p.latitude, longitude: lng });
    };
    close(f.state.read().zoom, 6, 1e-6);
});

test('read() falls back to the constant converter before layout, and returns null with no center', () => {
    const f = fixture({ width: 0, height: 0 });
    f.map.center = new mapkit.Coordinate(10, 20);
    f.map.cameraDistance = f.converter.zoomLevelToAltitude({ zoomLevel: 7, latitude: 10, tilt: 0 });
    const cam = f.state.read();
    close(cam.zoom, 7, 1e-9);
    assert.equal(cam.visibleRegion ?? null, null);

    f.map.center = null;
    assert.equal(f.state.read(), null);
});

test('commit(animated:false) writes the region and rotation directly and remembers the logical tilt', async () => {
    const f = fixture();
    const ok = await f.state.commit(pos({ lat: 1, lng: 2, zoom: 8, bearing: 90, tilt: 40 }), { animated: false });
    assert.equal(ok, true);
    assert.ok(f.map.region instanceof mapkit.CoordinateRegion);
    assert.equal(f.map.region.center.latitude, 1);
    assert.equal(f.map.rotation, 90);
    assert.equal(f.calls.length, 0, 'no animated setters');
    assert.equal(f.state.read().tilt, 40);
});

test('commit before layout falls back to center + converter distance at the snapped zoom', async () => {
    const f = fixture({ width: 0, height: 0 });
    await f.state.commit(pos({ lat: 5, lng: 6, zoom: 4.6 }), { animated: false });
    assert.equal(f.map.region, null);
    assert.equal(f.map.center.latitude, 5);
    assert.equal(f.map.center.longitude, 6);
    close(f.map.cameraDistance, f.converter.zoomLevelToAltitude({ zoomLevel: 5, latitude: 5, tilt: 0 }));

    await f.state.commit(pos({ lat: 5, lng: 6, zoom: 4.6 }), { animated: false, snapZoom: false });
    close(f.map.cameraDistance, f.converter.zoomLevelToAltitude({ zoomLevel: 4.6, latitude: 5, tilt: 0 }));
});

test('commit(animated:true) moves center and zoom in one setRegionAnimated and only rotates when needed', async () => {
    const f = fixture();
    f.map.rotation = 360; // same heading as bearing 0 → no rotation call
    await f.state.commit(pos({ zoom: 9 }), { animated: true, duration: 0 });
    assert.deepEqual(f.calls.map(([op]) => op), ['setRegionAnimated']);

    f.calls.length = 0;
    f.map.rotation = 0;
    await f.state.commit(pos({ zoom: 9, bearing: 120 }), { animated: true, duration: 0 });
    assert.deepEqual(f.calls.map(([op, arg]) => [op, op === 'setRotationAnimated' ? arg : undefined]), [
        ['setRegionAnimated', undefined],
        ['setRotationAnimated', 120],
    ]);
});

test('commit(animated:true) before layout uses the separate center/distance setters', async () => {
    const f = fixture({ width: 0, height: 0 });
    await f.state.commit(pos({ lat: 3, zoom: 6 }), { animated: true, duration: 0 });
    assert.deepEqual(f.calls.map(([op]) => op), ['setCenterAnimated', 'setCameraDistanceAnimated']);
    close(f.calls[1][1], f.converter.zoomLevelToAltitude({ zoomLevel: 6, latitude: 3, tilt: 0 }));
});

test('scheduleInitialAltitudeCorrection re-applies the last target once the map can be measured', async () => {
    const frames = [];
    globalThis.requestAnimationFrame = (fn) => { frames.push(fn); return frames.length; };
    globalThis.cancelAnimationFrame = () => {};
    try {
        const f = fixture({ width: 0, height: 0 });
        await f.state.commit(pos({ lat: 1, lng: 1, zoom: 8 }), { animated: false });
        f.state.scheduleInitialAltitudeCorrection();
        frames.shift()();
        assert.equal(f.forwarded.length, 0, 'not measurable yet: keeps waiting');
        assert.equal(frames.length, 1);

        f.holder.mapView.clientWidth = 400;
        f.holder.mapView.clientHeight = 300;
        frames.shift()();
        assert.ok(f.map.region, 'region re-applied from the live viewport');
        assert.equal(f.forwarded.length, 1, 'seeds overlays with the settled camera');
        assert.equal(frames.length, 0, 'stops after correcting');
    } finally {
        delete globalThis.requestAnimationFrame;
        delete globalThis.cancelAnimationFrame;
    }
});
