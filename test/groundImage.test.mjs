import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createGeoPoint, createGeoRectBounds, createGroundImageState } from '@mapconductor/js-sdk-core';
import { buildSources, installFakeMapkit } from './support/fakeMapkit.mjs';

// 地上画像（MapKit JS には ground overlay が無いので <img> を地図の上に置く）。
// - 投影した北西・北東・南西の 3 隅から幅・高さ・回転を出す layout の計算
// - 投影できない／bounds が無いときは隠す
// - 画像レイヤーは .mk-map-view の中、マーカー層（.mk-map-node-element）の直前に差し込む。
//   まだ無ければ外側コンテナに置き、redraw で格上げする
// - 差分（src・opacity のその場更新）、削除、destroy
// DOM は要素と document.createElement だけの小さなフェイクで足りる。
installFakeMapkit();

class FakeElement {
    constructor(tag) {
        this.tagName = tag;
        this.style = {};
        this.attributes = {};
        this.children = [];
        this.parentElement = null;
        this.classes = new Set();
        this.classList = { contains: (c) => this.classes.has(c) };
    }
    set src(v) { this.attributes.src = v; this.srcSets = (this.srcSets ?? 0) + 1; }
    get src() { return this.attributes.src; }
    getAttribute(name) { return this.attributes[name] ?? null; }
    get isConnected() { return this.parentElement != null; }
    appendChild(child) { child.remove(); child.parentElement = this; this.children.push(child); return child; }
    insertBefore(child, ref) {
        child.remove();
        child.parentElement = this;
        this.children.splice(this.children.indexOf(ref), 0, child);
        return child;
    }
    remove() {
        if (!this.parentElement) return;
        const siblings = this.parentElement.children;
        siblings.splice(siblings.indexOf(this), 1);
        this.parentElement = null;
    }
    querySelector(selector) {
        const cls = selector.replace(':scope > ', '').replace(/^\./, '');
        const direct = selector.startsWith(':scope > ');
        const walk = (el) => {
            for (const c of el.children) {
                if (c.classes.has(cls)) return c;
                if (!direct) { const found = walk(c); if (found) return found; }
            }
            return null;
        };
        return walk(this);
    }
}
const previousDocument = globalThis.document;
globalThis.document = { createElement: (tag) => new FakeElement(tag) };
after(() => { globalThis.document = previousDocument; });

const { controller, renderer, overlay } = await buildSources('groundimage-tests', {
    controller: 'src/groundimage/MapKitGroundImageController.ts',
    renderer: 'src/groundimage/MapKitGroundImageOverlayRenderer.ts',
    overlay: 'src/groundimage/MapKitGroundImageOverlay.ts',
});
const { MapKitGroundImageController } = controller;
const { MapKitGroundImageOverlayRenderer } = renderer;
const { MapKitGroundImageOverlay } = overlay;

const gp = (latitude, longitude) => createGeoPoint({ latitude, longitude });
function bounds(sw, ne) {
    const b = createGeoRectBounds();
    b.extend(sw);
    b.extend(ne);
    return b;
}
const image = (id, o = {}) => createGroundImageState({
    id,
    bounds: bounds(gp(0, 0), gp(10, 20)),
    imageUrl: 'https://img.example/a.png',
    opacity: 0.6,
    ...o,
});

/** Plate carrée projection: 10 px per degree, north up, optionally rotated. */
function projectingHolder({ rotateDeg = 0, mapView = new FakeElement('div') } = {}) {
    const r = (rotateDeg * Math.PI) / 180;
    return {
        mapView,
        toScreenOffset(p) {
            const x = p.longitude * 10;
            const y = -p.latitude * 10;
            return { x: x * Math.cos(r) - y * Math.sin(r), y: x * Math.sin(r) + y * Math.cos(r) };
        },
    };
}

test('layout sizes the image to the projected edges and places its top-left corner', () => {
    const parent = new FakeElement('div');
    const o = new MapKitGroundImageOverlay(image('g'), parent);
    assert.equal(o.element.parentElement, parent);
    assert.equal(o.element.style.opacity, '0.6');
    assert.equal(o.element.style.pointerEvents, 'none');
    assert.equal(o.element.style.transformOrigin, '0 0');

    o.layout(projectingHolder());
    assert.equal(o.element.style.width, '200px');
    assert.equal(o.element.style.height, '100px');
    assert.equal(o.element.style.transform, 'translate(0px, -100px) rotate(0rad)');
    assert.equal(o.element.style.display, '');
});

test('layout rotates the image to match the projected top edge', () => {
    const o = new MapKitGroundImageOverlay(image('g'), new FakeElement('div'));
    o.layout(projectingHolder({ rotateDeg: 90 }));
    assert.ok(Math.abs(parseFloat(o.element.style.width) - 200) < 1e-9);
    assert.ok(Math.abs(parseFloat(o.element.style.height) - 100) < 1e-9);
    const angle = parseFloat(/rotate\(([-\d.e]+)rad\)/.exec(o.element.style.transform)[1]);
    assert.ok(Math.abs(angle - Math.PI / 2) < 1e-9);
});

test('layout hides the image when a corner cannot be projected', () => {
    const o = new MapKitGroundImageOverlay(image('g'), new FakeElement('div'));
    o.layout({ toScreenOffset: () => null });
    assert.equal(o.element.style.display, 'none');
    o.layout(projectingHolder());
    assert.equal(o.element.style.display, '');
});

test('setState swaps src only when it changed and updates opacity', () => {
    const o = new MapKitGroundImageOverlay(image('g'), new FakeElement('div'));
    const sets = o.element.srcSets;
    o.setState(image('g', { opacity: 0.2 }));
    assert.equal(o.element.srcSets, sets, 'same URL: not reassigned (no reload)');
    assert.equal(o.element.style.opacity, '0.2');
    o.setState(image('g', { imageUrl: 'https://img.example/b.png' }));
    assert.equal(o.element.src, 'https://img.example/b.png');
});

test('the image layer sits right below the marker layer inside .mk-map-view', () => {
    const container = new FakeElement('div');
    const mapView = container.appendChild(new FakeElement('div'));
    mapView.classes.add('mk-map-view');
    const canvas = mapView.appendChild(new FakeElement('canvas'));
    const nodes = mapView.appendChild(new FakeElement('div'));
    nodes.classes.add('mk-map-node-element');

    const r = new MapKitGroundImageOverlayRenderer(projectingHolder({ mapView: container }));
    assert.deepEqual(mapView.children.map((c) => c.tagName), ['canvas', 'div', 'div']);
    assert.equal(mapView.children[2], nodes, 'markers stay on top');
    assert.equal(mapView.children[1].style.pointerEvents, 'none');
    r.destroy();
    assert.deepEqual(mapView.children, [canvas, nodes]);
});

test('before MapKit builds its layers the image layer goes on the container, and redraw upgrades it', () => {
    const container = new FakeElement('div');
    const r = new MapKitGroundImageOverlayRenderer(projectingHolder({ mapView: container }));
    assert.equal(container.children.length, 1);
    const layer = container.children[0];

    const mapView = container.appendChild(new FakeElement('div'));
    mapView.classes.add('mk-map-view');
    const nodes = mapView.appendChild(new FakeElement('div'));
    nodes.classes.add('mk-map-node-element');
    r.redraw();
    assert.equal(layer.parentElement, mapView);
    assert.deepEqual(mapView.children, [layer, nodes]);
});

test('controller drives create / in-place update / redraw / remove through the renderer', async () => {
    const container = new FakeElement('div');
    const holder = projectingHolder({ mapView: container });
    const c = new MapKitGroundImageController(new MapKitGroundImageOverlayRenderer(holder));
    const layer = container.children[0];

    await c.composition([image('a'), image('b', { bounds: bounds(gp(-5, -5), gp(0, 0)) })]);
    assert.equal(layer.children.length, 2);
    const [imgA] = layer.children;
    assert.equal(imgA.style.width, '200px');

    await c.composition([image('a', { opacity: 0.1 }), image('b', { bounds: bounds(gp(-5, -5), gp(0, 0)) })]);
    assert.equal(layer.children[0], imgA, 'updated in place');
    assert.equal(imgA.style.opacity, '0.1');

    // A camera move re-projects every image.
    holder.toScreenOffset = (p) => ({ x: p.longitude * 20, y: -p.latitude * 20 });
    c.redraw();
    assert.equal(imgA.style.width, '400px');

    await c.composition([image('b', { bounds: bounds(gp(-5, -5), gp(0, 0)) })]);
    assert.equal(layer.children.length, 1);
    assert.notEqual(layer.children[0], imgA);
});
