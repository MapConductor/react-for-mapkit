import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createGeoPoint } from '@mapconductor/js-sdk-core';
import { buildSources, createFakeMap, installFakeMapkit } from './support/fakeMapkit.mjs';

// helpers.ts の純粋ロジック:
// - CSS 色 → MapKit の color + opacity 分解（#rrggbbaa / rgb(a) / transparent / 名前色）
// - 日付変更線をまたぐ経度の連続化（toUnwrappedCoordinates）
// - MapKit に z 順が無いことの代用: addStackedOverlay が polygon < circle < polyline と
//   zIndex・追加順で map.overlays を並べ直すこと
installFakeMapkit();
const { helpers } = await buildSources('helpers-tests', { helpers: 'src/helpers.ts' });
const { toMapKitStyleColor, toCoordinates, toUnwrappedCoordinates, toGeoPoint, addStackedOverlay } = helpers;

test('toMapKitStyleColor splits hex colors', () => {
    assert.deepEqual(toMapKitStyleColor('#ff0000'), { color: '#ff0000', opacity: 1 });
    const half = toMapKitStyleColor('#00ff0080');
    assert.equal(half.color, '#00ff00');
    assert.ok(Math.abs(half.opacity - 128 / 255) < 1e-9);
    assert.deepEqual(toMapKitStyleColor('#12345600'), { color: '#123456', opacity: 0 });
});

test('toMapKitStyleColor splits rgb()/rgba() and rounds the channels', () => {
    assert.deepEqual(toMapKitStyleColor('rgb(10, 20, 30)'), { color: 'rgb(10, 20, 30)', opacity: 1 });
    assert.deepEqual(toMapKitStyleColor('rgba(0, 0, 255, 0.5)'), { color: 'rgb(0, 0, 255)', opacity: 0.5 });
    assert.deepEqual(toMapKitStyleColor('RGBA(1.4, 2.6, 3, 25%)'), { color: 'rgb(1, 3, 3)', opacity: 0.25 });
});

test('toMapKitStyleColor clamps out-of-range alpha', () => {
    assert.equal(toMapKitStyleColor('rgba(0,0,0,2)').opacity, 1);
    assert.equal(toMapKitStyleColor('rgba(0,0,0,-1)').opacity, 0);
    assert.equal(toMapKitStyleColor('rgba(0,0,0,150%)').opacity, 1);
});

test('toMapKitStyleColor: transparent, named colors, fallback, whitespace', () => {
    assert.deepEqual(toMapKitStyleColor('transparent'), { color: '#000000', opacity: 0 });
    assert.deepEqual(toMapKitStyleColor('  Transparent '), { color: '#000000', opacity: 0 });
    assert.deepEqual(toMapKitStyleColor('red'), { color: 'red', opacity: 1 });
    assert.deepEqual(toMapKitStyleColor(undefined), { color: '#000000', opacity: 1 });
    assert.deepEqual(toMapKitStyleColor(undefined, 'transparent'), { color: '#000000', opacity: 0 });
    assert.deepEqual(toMapKitStyleColor(' #abcdef '), { color: '#abcdef', opacity: 1 });
    // 3-digit hex is not split; it passes through as a CSS color.
    assert.deepEqual(toMapKitStyleColor('#fff'), { color: '#fff', opacity: 1 });
});

test('toCoordinates / toGeoPoint round-trip', () => {
    const coords = toCoordinates([createGeoPoint({ latitude: 35, longitude: 139 })]);
    assert.ok(coords[0] instanceof mapkit.Coordinate);
    assert.equal(coords[0].latitude, 35);
    assert.equal(coords[0].longitude, 139);
    const back = toGeoPoint(new mapkit.Coordinate(-10, 20));
    assert.equal(back.latitude, -10);
    assert.equal(back.longitude, 20);
});

test('toUnwrappedCoordinates keeps an eastward antimeridian crossing continuous', () => {
    const coords = toUnwrappedCoordinates([
        createGeoPoint({ latitude: 0, longitude: 170 }),
        createGeoPoint({ latitude: 0, longitude: -170 }),
        createGeoPoint({ latitude: 0, longitude: -160 }),
    ]);
    assert.deepEqual(coords.map((c) => c.longitude), [170, 190, 200]);
});

test('toUnwrappedCoordinates keeps a westward crossing continuous and normalizes the first point', () => {
    const coords = toUnwrappedCoordinates([
        createGeoPoint({ latitude: 0, longitude: 190 }), // normalized to -170
        createGeoPoint({ latitude: 0, longitude: 170 }),
    ]);
    assert.deepEqual(coords.map((c) => c.longitude), [-170, -190]);
    assert.deepEqual(toUnwrappedCoordinates([]), []);
});

function overlay(name) { return { name }; }

test('addStackedOverlay keeps polygon < circle < polyline whatever the add order', () => {
    const map = createFakeMap();
    addStackedOverlay(map, overlay('line'), 'polyline');
    addStackedOverlay(map, overlay('circle'), 'circle');
    addStackedOverlay(map, overlay('poly'), 'polygon');
    assert.deepEqual(map.overlays.map((o) => o.name), ['poly', 'circle', 'line']);
});

test('addStackedOverlay orders by zIndex within a kind, then by add order', () => {
    const map = createFakeMap();
    addStackedOverlay(map, overlay('a5'), 'polygon', 5);
    addStackedOverlay(map, overlay('b1'), 'polygon', 1);
    addStackedOverlay(map, overlay('c5'), 'polygon', 5);
    addStackedOverlay(map, overlay('dnull'), 'polygon', null); // null → 0
    assert.deepEqual(map.overlays.map((o) => o.name), ['dnull', 'b1', 'a5', 'c5']);
});

test('addStackedOverlay only lifts the overlays that belong above, and leaves foreign overlays alone', () => {
    const map = createFakeMap();
    const foreign = overlay('foreign');
    map.overlays.push(foreign); // not added through addStackedOverlay: no stack key
    addStackedOverlay(map, overlay('poly'), 'polygon');
    addStackedOverlay(map, overlay('line'), 'polyline');
    map.log.length = 0;

    addStackedOverlay(map, overlay('circle'), 'circle');
    assert.deepEqual(map.overlays.map((o) => o.name), ['foreign', 'poly', 'circle', 'line']);
    assert.deepEqual(map.log.map(([op, arg]) => [op, Array.isArray(arg) ? arg.map((o) => o.name) : arg.name]), [
        ['removeOverlays', ['line']],
        ['addOverlay', 'circle'],
        ['addOverlays', ['line']],
    ]);

    // Nothing above: a plain addOverlay, no remove/re-add churn.
    map.log.length = 0;
    addStackedOverlay(map, overlay('line2'), 'polyline');
    assert.deepEqual(map.log.map(([op]) => op), ['addOverlay']);
});
