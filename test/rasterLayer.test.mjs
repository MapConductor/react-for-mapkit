import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRasterLayerState, RasterLayerSource, TileScheme } from '@mapconductor/js-sdk-core';
import { buildSources, createFakeMap, installFakeMapkit } from './support/fakeMapkit.mjs';

// ラスターレイヤーを mapkit.TileOverlay に落とす部分を、フェイク地図で実コントローラから動かす。
// - URL テンプレートの {x}/{y}/{z} 置換、TMS の y 反転、min/max ズーム既定値
// - ArcGIS サービスの /tile/{z}/{y}/{x} 形式（末尾スラッシュ除去）
// - TileJson は MapKit JS では描かない
// - 不透明度だけの変更は既存オーバーレイを使い回す（タイルを取り直さない）。
//   ソースが変われば作り直し、visible=false で外す
installFakeMapkit();
const { controller, renderer } = await buildSources('raster-tests', {
    controller: 'src/raster/MapKitRasterLayerController.ts',
    renderer: 'src/raster/MapKitRasterLayerOverlayRenderer.ts',
});

function fixture() {
    const map = createFakeMap();
    const c = new controller.MapKitRasterLayerController(new renderer.MapKitRasterLayerOverlayRenderer({ map }));
    return { map, c };
}

const xyz = (o = {}) => RasterLayerSource.UrlTemplate({ template: 'https://t.example/{z}/{x}/{y}.png', ...o });
const layer = (id, o = {}) => createRasterLayerState({ id, source: xyz(), ...o });

test('URL templates substitute x/y/z and default to zoom 0..22', async () => {
    const f = fixture();
    await f.c.composition([layer('a', { opacity: 0.7 })]);
    assert.equal(f.map.tileOverlays.length, 1);
    const o = f.map.tileOverlays[0];
    assert.ok(o instanceof mapkit.TileOverlay);
    assert.equal(o.urlTemplate(3, 5, 4), 'https://t.example/4/3/5.png');
    assert.equal(o.minimumZ, 0);
    assert.equal(o.maximumZ, 22);
    assert.equal(o.opacity, 0.7);
});

test('TMS sources flip y, and min/max zoom pass through', async () => {
    const f = fixture();
    await f.c.composition([layer('tms', { source: xyz({ scheme: TileScheme.TMS, minZoom: 2, maxZoom: 9, template: '{z}-{x}-{y}-{x}' }) })]);
    const o = f.map.tileOverlays[0];
    // z=3: y' = 2^3 - 1 - 1 = 6; repeated placeholders are all replaced.
    assert.equal(o.urlTemplate(2, 1, 3), '3-2-6-2');
    assert.equal(o.minimumZ, 2);
    assert.equal(o.maximumZ, 9);
});

test('ArcGIS services map to /tile/{z}/{y}/{x} without a doubled slash', async () => {
    const f = fixture();
    await f.c.composition([layer('arc', { source: RasterLayerSource.ArcGisService('https://s.example/MapServer//') })]);
    assert.equal(f.map.tileOverlays[0].urlTemplate(1, 2, 3), 'https://s.example/MapServer/tile/3/2/1');
});

test('TileJson sources are not drawn', async (t) => {
    const warn = t.mock.method(console, 'warn', () => {});
    const f = fixture();
    await f.c.composition([layer('tj', { source: RasterLayerSource.TileJson('https://t.example/tiles.json') })]);
    assert.equal(f.map.tileOverlays.length, 0);
    assert.ok(warn.mock.callCount() >= 1);
});

test('an opacity-only change reuses the overlay; a source change recreates it', async () => {
    const f = fixture();
    await f.c.composition([layer('a', { opacity: 1 })]);
    const first = f.map.tileOverlays[0];

    await f.c.composition([layer('a', { opacity: 0.25 })]);
    assert.equal(f.map.tileOverlays.length, 1);
    assert.equal(f.map.tileOverlays[0], first, 'same overlay object');
    assert.equal(first.opacity, 0.25);
    assert.ok(!f.map.log.some(([op]) => op === 'removeTileOverlay'));

    await f.c.composition([layer('a', { opacity: 0.25, source: xyz({ template: 'https://other/{z}/{x}/{y}' }) })]);
    assert.equal(f.map.tileOverlays.length, 1);
    assert.notEqual(f.map.tileOverlays[0], first);
    assert.equal(f.map.tileOverlays[0].urlTemplate(0, 0, 0), 'https://other/0/0/0');
});

test('opacity is clamped to 0..1', async () => {
    const f = fixture();
    await f.c.composition([layer('a', { opacity: 3 })]);
    assert.equal(f.map.tileOverlays[0].opacity, 1);
});

test('visible=false keeps nothing on the map; showing again re-adds; removal and clear', async () => {
    const f = fixture();
    await f.c.composition([layer('hidden', { visible: false })]);
    assert.equal(f.map.tileOverlays.length, 0);

    await f.c.composition([layer('hidden', { visible: true })]);
    assert.equal(f.map.tileOverlays.length, 1);

    await f.c.composition([layer('hidden', { visible: false })]);
    assert.equal(f.map.tileOverlays.length, 0);

    await f.c.composition([layer('a'), layer('b', { source: xyz({ template: 'b/{z}/{x}/{y}' }) })]);
    assert.equal(f.map.tileOverlays.length, 2);
    await f.c.composition([layer('a')]);
    assert.equal(f.map.tileOverlays.length, 1);
    await f.c.clear();
    assert.equal(f.map.tileOverlays.length, 0);
});
