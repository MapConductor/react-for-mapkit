import {
  buildUnwrappedPolylinePath,
  PolylineEntity,
  type PolylineAddParams,
  type PolylineChangeParams,
  type PolylineState,
  type PolylineOverlayRenderer,
} from '@mapconductor/js-sdk-core';
import { MapKitViewHolder } from '../MapKitViewHolder';
import { toCoordinates, toMapKitStyleColor } from '../helpers';
import type { MapKitActualPolyline } from '../MapKitTypeAlias';

/**
 * Web port of `MapKitPolylineOverlayRenderer` (polyline/MapKitPolylineOverlayRenderer.swift).
 * Uses `mapkit.PolylineOverlay` in place of the native `MKPolyline` + renderer.
 */
export class MapKitPolylineOverlayRenderer implements PolylineOverlayRenderer<MapKitActualPolyline> {
  constructor(readonly holder: MapKitViewHolder) {}

  private get map(): mapkit.Map {
    return this.holder.map;
  }

  createPolyline(entity: PolylineEntity<MapKitActualPolyline>): MapKitActualPolyline | null {
    const state = entity.state;
    if (state.points.length < 2) return null;
    const overlay = new mapkit.PolylineOverlay(this.buildPoints(state), {
      style: this.createStyle(state),
      data: { id: state.id },
      // Keep the overlay non-interactive so MapKit doesn't swallow taps that land
      // on the stroke. Polyline click detection is done entirely in JS from the
      // map's single-tap coordinate (see MapKitViewController.handlePolylineClick).
      enabled: false,
    });
    this.map.addOverlay(overlay);
    return overlay;
  }

  updatePolyline(overlay: MapKitActualPolyline, entity: PolylineEntity<MapKitActualPolyline>): void {
    const state = entity.state;
    if (state.points.length < 2) return;
    overlay.points = this.buildPoints(state);
    overlay.style = this.createStyle(state);
  }

  removePolyline(overlay: MapKitActualPolyline): void {
    this.map.removeOverlay(overlay);
  }

  async onAdd(data: PolylineAddParams[]): Promise<(MapKitActualPolyline | null)[]> {
    return data.map(({ state }) => this.createPolyline({ state } as PolylineEntity<MapKitActualPolyline>));
  }

  async onChange(data: PolylineChangeParams<MapKitActualPolyline>[]): Promise<(MapKitActualPolyline | null)[]> {
    return data.map(({ current }) => {
      if (!current.polyline) return this.createPolyline(current);
      this.updatePolyline(current.polyline, current);
      return current.polyline;
    });
  }

  async onRemove(data: PolylineEntity<MapKitActualPolyline>[]): Promise<void> {
    data.forEach(({ polyline }) => {
      if (polyline) this.removePolyline(polyline);
    });
  }

  async onPostProcess(): Promise<void> {}

  private buildPoints(state: PolylineState): mapkit.Coordinate[] {
    // Core pipeline: densification + longitude unwrap (MapKit accepts unwrapped
    // longitudes, keeping antimeridian-crossing segments continuous).
    return toCoordinates(buildUnwrappedPolylinePath(state.points, state.geodesic));
  }

  private createStyle(state: PolylineState): mapkit.Style {
    const stroke = toMapKitStyleColor(state.strokeColor, '#000000');
    return new mapkit.Style({
      strokeColor: stroke.color,
      strokeOpacity: stroke.opacity,
      lineWidth: state.strokeWidth,
    });
  }
}
