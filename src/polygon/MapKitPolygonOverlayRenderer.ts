import {
  buildUnwrappedPolygonRings,
  resolveHoles,
  PolygonEntity,
  type PolygonAddParams,
  type PolygonChangeParams,
  type PolygonState,
  type PolygonOverlayRenderer,
} from '@mapconductor/js-sdk-core';
import { MapKitViewHolder } from '../MapKitViewHolder';
import { toCoordinates, toMapKitStyleColor } from '../helpers';
import type { MapKitActualPolygon } from '../MapKitTypeAlias';

// Match the ArcGIS/native geodesic densification cap so world-mask rings stay a
// reasonable size.
const GEODESIC_MAX_SEGMENT_LENGTH_METERS = 100_000;

/**
 * Web port of `MapKitPolygonOverlayRenderer` (polygon/MapKitPolygonOverlayRenderer.swift).
 *
 * MapKit JS's `mapkit.PolygonOverlay` accepts an array of rings where the first
 * ring is the outer boundary and any following rings are holes, so holes are
 * expressed natively instead of the native SDK's raster tile-mask approach.
 */
export class MapKitPolygonOverlayRenderer implements PolygonOverlayRenderer<MapKitActualPolygon> {
  constructor(readonly holder: MapKitViewHolder) {}

  private get map(): mapkit.Map {
    return this.holder.map;
  }

  createPolygon(entity: PolygonEntity<MapKitActualPolygon>): MapKitActualPolygon | null {
    const state = entity.state;
    if (!state.points || state.points.length < 3) return null;
    const overlay = new mapkit.PolygonOverlay(this.buildRings(state), {
      style: this.createStyle(state),
      data: { id: state.id },
      // Keep the overlay non-interactive so MapKit doesn't swallow taps that land
      // inside the polygon. Click detection is done entirely in JS via a
      // point-in-polygon test from the map's single-tap coordinate (see
      // MapKitViewController.handlePolygonClick).
      enabled: false,
    });
    this.map.addOverlay(overlay);
    return overlay;
  }

  updatePolygon(overlay: MapKitActualPolygon, entity: PolygonEntity<MapKitActualPolygon>): void {
    const state = entity.state;
    if (!state.points || state.points.length < 3) return;
    overlay.points = this.buildRings(state);
    overlay.style = this.createStyle(state);
  }

  removePolygon(overlay: MapKitActualPolygon): void {
    this.map.removeOverlay(overlay);
  }

  async onAdd(data: PolygonAddParams[]): Promise<(MapKitActualPolygon | null)[]> {
    return data.map(({ state }) => this.createPolygon({ state } as PolygonEntity<MapKitActualPolygon>));
  }

  async onChange(data: PolygonChangeParams<MapKitActualPolygon>[]): Promise<(MapKitActualPolygon | null)[]> {
    return data.map(({ current }) => {
      if (!current.polygon) return this.createPolygon(current);
      this.updatePolygon(current.polygon, current);
      return current.polygon;
    });
  }

  async onRemove(data: PolygonEntity<MapKitActualPolygon>[]): Promise<void> {
    data.forEach(({ polygon }) => {
      if (polygon) this.removePolygon(polygon);
    });
  }

  async onPostProcess(): Promise<void> {}

  private buildRings(state: PolygonState): mapkit.Coordinate[][] {
    // Overlapping holes are merged here, at geometry build time, the same place
    // the Android renderers call resolveHoles(). The component-level union in
    // Polygon.tsx does not re-run when state.holes is swapped at runtime.
    const resolved = resolveHoles(state);
    // Core pipeline: densify each ring (geodesic great-circle or straight-in-
    // lat/lng linear interpolation, matching the Android renderers) and unwrap
    // the longitudes into the outer ring's world copy, so a boundary crossing
    // the antimeridian stays continuous instead of being drawn the long way
    // around the map.
    const { outerRings, holeRings } = buildUnwrappedPolygonRings(
      resolved.points,
      resolved.holes,
      resolved.geodesic,
      GEODESIC_MAX_SEGMENT_LENGTH_METERS,
    );
    return [...outerRings, ...holeRings].map(toCoordinates);
  }

  private createStyle(state: PolygonState): mapkit.Style {
    const fill = toMapKitStyleColor(state.fillColor, 'transparent');
    const stroke = toMapKitStyleColor(state.strokeColor, '#000000');
    return new mapkit.Style({
      fillColor: fill.color,
      fillOpacity: fill.opacity,
      strokeColor: stroke.color,
      strokeOpacity: stroke.opacity,
      lineWidth: state.strokeWidth ?? 2,
      // The overlay carries the outer boundary plus each hole ring (see
      // buildRings). MapKit's default 'nonzero' fill rule only cuts a hole when
      // its winding is opposite the outer ring's; the hole rings here can share
      // the outer winding, so use 'evenodd' to punch holes regardless of winding.
      fillRule: 'evenodd',
    });
  }
}
