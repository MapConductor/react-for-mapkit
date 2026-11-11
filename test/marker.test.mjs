import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDefaultIcon, createGeoPoint, createMarkerState } from '@mapconductor/js-sdk-core';
import { buildSources, createFakeMap, installFakeMapkit } from './support/fakeMapkit.mjs';

// マーカーを mapkit.ImageAnnotation に落とす部分と、select/drag イベントの扱い。
// - アイコンのアンカー → MapKit の anchorOffset（下中央基準・y 上向き）の換算
// - レンダラーの追加・位置更新・表示切替・削除
// - コントローラ: select は直前の押下が描かれたピンの上だったときだけクリック、
//   ピンの脇（画像の透明部分）なら onSelectMissed へ回す。指（touch）には余裕がある
// - ドラッグ中は外からの update を無視し、drag-* で位置とイベントを配る
// - destroy で地図要素の pointerdown（capture）を外す
installFakeMapkit();
const { annotation, renderer, controller } = await buildSources('marker-tests', {
    annotation: 'src/marker/MapConductorPointAnnotation.ts',
    renderer: 'src/marker/MapKitMarkerRenderer.ts',
    controller: 'src/marker/MapKitMarkerController.ts',
});
const { createMapConductorPointAnnotation } = annotation;
const { MapKitMarkerRenderer } = renderer;
const { MapKitMarkerController } = controller;

const gp = (latitude, longitude) => createGeoPoint({ latitude, longitude });
const bitmap = (anchor, size = { width: 40, height: 60 }) => ({ ...createDefaultIcon().toBitmapIcon(), size, anchor });

test('anchorOffset puts the bitmap anchor on the coordinate (MapKit: bottom-center, y up)', () => {
    const state = createMarkerState({ id: 'm', position: gp(35, 139), draggable: true });
    const bottom = createMapConductorPointAnnotation(state, bitmap({ x: 0.5, y: 1 }));
    assert.equal(bottom.anchorOffset.x, 0);
    assert.equal(bottom.anchorOffset.y, 0);
    const centered = createMapConductorPointAnnotation(state, bitmap({ x: 0.5, y: 0.5 }));
    assert.equal(centered.anchorOffset.y, -30);
    const topLeft = createMapConductorPointAnnotation(state, bitmap({ x: 0, y: 0 }));
    assert.equal(topLeft.anchorOffset.x, 20);
    assert.equal(topLeft.anchorOffset.y, -60);

    assert.ok(bottom instanceof mapkit.ImageAnnotation);
    assert.equal(bottom.coordinate.latitude, 35);
    assert.deepEqual(bottom.size, { width: 40, height: 60 });
    assert.equal(bottom.draggable, true);
    assert.equal(bottom.calloutEnabled, false);
    assert.equal(bottom.data.markerId, 'm');
    assert.equal(bottom.data.markerState, state);
    assert.equal(bottom.url[1], bottom.data.initialBitmapIcon.url);
});

test('renderer adds, moves, hides and removes annotations', async () => {
    const map = createFakeMap();
    const r = new MapKitMarkerRenderer({ map });
    const state = createMarkerState({ id: 'a', position: gp(1, 2) });
    const [ann] = await r.onAdd([{ state, bitmapIcon: bitmap({ x: 0.5, y: 1 }) }]);
    assert.deepEqual(map.annotations, [ann]);

    state.setPosition(gp(3, 4));
    const [same] = await r.onChange([{ current: { state, marker: ann }, prev: { state, marker: ann } }]);
    assert.equal(same, ann, 'updated in place');
    assert.equal(ann.coordinate.latitude, 3);
    assert.equal(ann.coordinate.longitude, 4);

    r.setMarkerPosition({ state, marker: ann }, gp(5, 6));
    assert.equal(ann.coordinate.longitude, 6);
    r.setMarkerVisible({ state, marker: ann }, false);
    assert.equal(ann.visible, false);

    // An entity without a native marker is created on change.
    const [created] = await r.onChange([{ current: { state }, prev: { state } }]);
    assert.notEqual(created, ann);
    assert.equal(map.annotations.length, 2);

    await r.onRemove([{ state, marker: ann }, { state, marker: null }]);
    assert.deepEqual(map.annotations, [created]);
});

/** A fake map whose page projection puts every annotation's coordinate at (500, 500). */
function controllerFixture() {
    const map = createFakeMap();
    const listeners = [];
    map.element = {
        addEventListener: (type, fn, capture) => listeners.push({ type, fn, capture }),
        removeEventListener: (type, fn, capture) => {
            const i = listeners.findIndex((l) => l.type === type && l.fn === fn && l.capture === capture);
            if (i >= 0) listeners.splice(i, 1);
        },
    };
    map.convertCoordinateToPointOnPage = () => ({ x: 500, y: 500 });
    const c = new MapKitMarkerController(new MapKitMarkerRenderer({ map }));
    const press = (x, y, pointerType = 'mouse') => {
        for (const l of listeners.filter((l) => l.type === 'pointerdown')) l.fn({ pageX: x, pageY: y, pointerType });
    };
    const fire = (ann, type, event = {}) => { for (const fn of ann.listeners[type] ?? []) fn(event); };
    return { map, c, listeners, press, fire };
}

test('the controller listens for presses in the capture phase and stops on destroy', () => {
    const f = controllerFixture();
    assert.equal(f.listeners.length, 1);
    assert.equal(f.listeners[0].type, 'pointerdown');
    assert.equal(f.listeners[0].capture, true);
    f.c.destroy();
    assert.equal(f.listeners.length, 0);
});

test('select counts as a click only when the press hit the drawn pin', async () => {
    const f = controllerFixture();
    const clicks = [];
    const missed = [];
    f.c.setOnClickListener((s) => clicks.push(s.id));
    f.c.onSelectMissed = (p) => missed.push([p.x, p.y]);
    await f.c.composition([createMarkerState({ id: 'pin', position: gp(0, 0) })]);
    const [ann] = f.map.annotations;

    // On the pin body, just above the anchor.
    f.press(500, 480);
    f.fire(ann, 'select');
    assert.deepEqual(clicks, ['pin']);
    assert.equal(ann.selected, false, 'MapKit selection is cleared');

    // Inside the 48 px image but beside the ~31 px pin: goes back to map tap dispatch.
    f.press(521, 480);
    f.fire(ann, 'select');
    assert.deepEqual(clicks, ['pin']);
    assert.deepEqual(missed, [[521, 480]]);

    // The same spot with a finger is within the touch slop.
    f.press(521, 480, 'touch');
    f.fire(ann, 'select');
    assert.deepEqual(clicks, ['pin', 'pin']);
});

test('select without a recent press (e.g. keyboard) counts; non-clickable markers never click', async () => {
    const f = controllerFixture();
    const clicks = [];
    f.c.setOnClickListener((s) => clicks.push(s.id));
    await f.c.composition([
        createMarkerState({ id: 'a', position: gp(0, 0) }),
        createMarkerState({ id: 'quiet', position: gp(1, 1), clickable: false }),
    ]);
    const byId = (id) => f.map.annotations.find((a) => a.data.markerId === id);
    f.fire(byId('a'), 'select');
    f.fire(byId('quiet'), 'select');
    assert.deepEqual(clicks, ['a']);
});

test('drag events move the state, dispatch drag callbacks, and freeze external updates while dragging', async () => {
    const f = controllerFixture();
    const events = [];
    f.c.setOnDragStart((s) => events.push('start'));
    f.c.setOnDrag((s) => events.push(['drag', s.position.latitude, s.position.longitude]));
    f.c.setOnDragEnd((s) => events.push('end'));
    const state = createMarkerState({ id: 'd', position: gp(0, 0), draggable: true });
    await f.c.composition([state]);
    const [ann] = f.map.annotations;

    f.fire(ann, 'drag-start');
    f.fire(ann, 'dragging', { coordinate: new mapkit.Coordinate(7, 8) });
    f.fire(ann, 'dragging', {}); // no coordinate: ignored
    assert.equal(state.position.latitude, 7);

    // While dragging, an update() of the dragged state is not applied to the
    // annotation (MapKit moves it itself). The freeze is keyed by state identity.
    const before = ann.coordinate;
    state.setPosition(gp(50, 50));
    await f.c.update(state);
    assert.equal(ann.coordinate, before);

    f.fire(ann, 'drag-end');
    assert.deepEqual(events, ['start', ['drag', 7, 8], 'end']);

    // After the drag the same update goes through.
    await f.c.update(state);
    assert.equal(ann.coordinate.latitude, 50);
});

test('non-draggable markers get no drag listeners', async () => {
    const f = controllerFixture();
    await f.c.composition([createMarkerState({ id: 'fixed', position: gp(0, 0) })]);
    const [ann] = f.map.annotations;
    assert.deepEqual(Object.keys(ann.listeners), ['select']);
});
