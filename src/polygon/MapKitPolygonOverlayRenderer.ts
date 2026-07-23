import {
  createInterpolatePoints,
  PolygonEntity,
  type GeoPoint,
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
    const densify = (points: GeoPoint[]): GeoPoint[] =>
      state.geodesic ? createInterpolatePoints(points, GEODESIC_MAX_SEGMENT_LENGTH_METERS) : points;

    const outer = toCoordinates(densify(state.points));
    const holes = state.holes
      .filter(ring => ring.length >= 3)
      .map(ring => toCoordinates(densify(ring)));
    return [outer, ...holes];
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
    });
  }
}
