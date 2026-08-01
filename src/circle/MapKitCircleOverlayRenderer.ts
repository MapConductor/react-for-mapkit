import {
  circleToRing,
  closeRing,
  CircleEntity,
  type CircleAddParams,
  type CircleChangeParams,
  type CircleState,
  type CircleOverlayRenderer,
} from '@mapconductor/js-sdk-core';
import { MapKitViewHolder } from '../MapKitViewHolder';
import { toCoordinates, toMapKitStyleColor } from '../helpers';
import type { MapKitActualCircle } from '../MapKitTypeAlias';

/**
 * Web port of `MapKitCircleOverlayRenderer` (circle/MapKitCircleOverlayRenderer.swift).
 *
 * Like iOS (64-segment `MKPolygon`), the circle is drawn as a polygon ring from
 * the shared core geometry (`circleToRing`) instead of MapKit JS's native
 * `mapkit.CircleOverlay`, so the circle shape definition (geodesic vs planar)
 * is unified across providers. The ring is unwrapped around the center
 * longitude; MapKit accepts unwrapped longitudes (see toUnwrappedCoordinates),
 * so an antimeridian-crossing circle stays continuous without splitting. The
 * renderer contract (create/update/remove + add/change/remove/postProcess)
 * matches the other object-overlay providers.
 */
export class MapKitCircleOverlayRenderer implements CircleOverlayRenderer<MapKitActualCircle> {
  constructor(readonly holder: MapKitViewHolder) {}

  private get map(): mapkit.Map {
    return this.holder.map;
  }

  createCircle(entity: CircleEntity<MapKitActualCircle>): MapKitActualCircle | null {
    const state = entity.state;
    const overlay = new mapkit.PolygonOverlay(this.buildRing(state), {
      style: this.createStyle(state),
      data: { id: state.id },
      // Keep the overlay non-interactive so MapKit doesn't swallow taps that
      // land inside the circle. Click detection is done entirely in JS via the
      // shared geometric hit-test from the map's single-tap coordinate (see
      // MapKitViewController.handleCircleClick).
      enabled: false,
    });
    this.map.addOverlay(overlay);
    return overlay;
  }

  updateCircle(overlay: MapKitActualCircle, entity: CircleEntity<MapKitActualCircle>): void {
    const state = entity.state;
    overlay.points = this.buildRing(state);
    overlay.style = this.createStyle(state);
  }

  removeCircle(overlay: MapKitActualCircle): void {
    this.map.removeOverlay(overlay);
  }

  async onAdd(data: CircleAddParams[]): Promise<(MapKitActualCircle | null)[]> {
    return data.map(({ state }) => this.createCircle({ state } as CircleEntity<MapKitActualCircle>));
  }

  async onChange(data: CircleChangeParams<MapKitActualCircle>[]): Promise<(MapKitActualCircle | null)[]> {
    return data.map(({ current }) => {
      if (!current.circle) return this.createCircle(current);
      this.updateCircle(current.circle, current);
      return current.circle;
    });
  }

  async onRemove(data: CircleEntity<MapKitActualCircle>[]): Promise<void> {
    data.forEach(({ circle }) => {
      if (circle) this.removeCircle(circle);
    });
  }

  async onPostProcess(): Promise<void> {}

  private buildRing(state: CircleState): mapkit.Coordinate[] {
    return toCoordinates(
      closeRing(circleToRing(state.center, state.radiusMeters, state.geodesic)),
    );
  }

  private createStyle(state: CircleState): mapkit.Style {
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
