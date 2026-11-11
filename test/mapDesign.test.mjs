import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildSources, installFakeMapkit } from './support/fakeMapkit.mjs';

// MapKitMapDesign: iOS と同じ公開名（Flyover 系を含む）を持ち、id から引けること、
// MapKit JS の mapkit.Map.MapTypes へは読み込み後に遅延解決し、Flyover 系は
// 2D の最も近い種類（Satellite / Hybrid）へ落ちること。
installFakeMapkit();
const { design } = await buildSources('design-tests', { design: 'src/MapKitMapDesign.ts' });
const { MapKitMapDesign } = design;

test('every public design is registered by id and returned as the same instance', () => {
    const ids = ['standard', 'satellite', 'hybrid', 'satelliteFlyover', 'hybridFlyover', 'mutedStandard'];
    for (const id of ids) {
        const d = MapKitMapDesign.Create(id);
        assert.equal(d.getValue(), id);
        assert.equal(MapKitMapDesign.toMapDesignType(id), d);
        assert.deepEqual(d.attributionRules, []);
    }
    assert.equal(MapKitMapDesign.Create('standard'), MapKitMapDesign.Standard);
    assert.equal(MapKitMapDesign.Create('hybridFlyover'), MapKitMapDesign.HybridFlyover);
});

test('unknown ids throw', () => {
    assert.throws(() => MapKitMapDesign.Create('terrain'), /unknown design id: "terrain"/);
});

test('toMapType resolves each design to a MapKit JS map type, flyovers to their 2D equivalents', () => {
    const t = mapkit.Map.MapTypes;
    assert.equal(MapKitMapDesign.toMapType(MapKitMapDesign.Standard), t.Standard);
    assert.equal(MapKitMapDesign.toMapType(MapKitMapDesign.Satellite), t.Satellite);
    assert.equal(MapKitMapDesign.toMapType(MapKitMapDesign.SatelliteFlyover), t.Satellite);
    assert.equal(MapKitMapDesign.toMapType(MapKitMapDesign.Hybrid), t.Hybrid);
    assert.equal(MapKitMapDesign.toMapType(MapKitMapDesign.HybridFlyover), t.Hybrid);
    assert.equal(MapKitMapDesign.toMapType(MapKitMapDesign.MutedStandard), t.MutedStandard);
    // Any other value falls back to Standard.
    assert.equal(MapKitMapDesign.toMapType({ getValue: () => 'whatever' }), t.Standard);
});

test('custom designs keep their attribution rules but are not registered', () => {
    const rules = [{ text: '© someone' }];
    const custom = new MapKitMapDesign('custom', rules);
    assert.equal(custom.attributionRules, rules);
    assert.throws(() => MapKitMapDesign.Create('custom'));
});
