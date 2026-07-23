import {
  CircleEntity,
  type CircleAddParams,
  type CircleChangeParams,
  type CircleState,
  type CircleOverlayRenderer,
} from '@mapconductor/js-sdk-core';
import { MapKitViewHolder } from '../MapKitViewHolder';
import { toCoordinate, toMapKitStyleColor } from '../helpers';
import type { MapKitActualCircle } from '../MapKitTypeAlias';

/**
 * Web port of `MapKitCircleOverlayRenderer` (circle/MapKitCircleOverlayRenderer.swift).
 *
 * On iOS a circle is drawn as a 64-segment `MKPolygon`; MapKit JS exposes a
 * native `mapkit.CircleOverlay` that honours a meters radius directly, so this
 * uses that instead. The renderer contract (create/update/remove +
 * add/change/remove/postProcess) matches the other object-overlay providers.
 */
export class MapKitCircleOverlayRenderer implements CircleOverlayRenderer<MapKitActualCircle> {
  constructor(readonly holder: MapKitViewHolder) {}

  private get map(): mapkit.Map {
    return this.holder.map;
  }

  createCircle(entity: CircleEntity<MapKitActualCircle>): MapKitActualCircle | null {
    const state = entity.state;
    const overlay = new mapkit.CircleOverlay(toCoordinate(state.center), state.radiusMeters, {
      style: this.createStyle(state),
      data: { id: state.id },
      enabled: state.clickable,
    });
    this.map.addOverlay(overlay);
    return overlay;
  }

  updateCircle(overlay: MapKitActualCircle, entity: CircleEntity<MapKitActualCircle>): void {
    const state = entity.state;
    overlay.coordinate = toCoordinate(state.center);
    overlay.radius = state.radiusMeters;
    overlay.style = this.createStyle(state);
    overlay.enabled = state.clickable;
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
