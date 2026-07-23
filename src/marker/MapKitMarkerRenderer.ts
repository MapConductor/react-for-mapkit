import {
  AbstractMarkerOverlayRenderer,
  createDefaultIcon,
  MarkerEntity,
  type AddParams,
  type BitmapIcon,
  type ChangeParams,
  type GeoPoint,
} from '@mapconductor/js-sdk-core';
import { MapKitViewHolder } from '../MapKitViewHolder';
import { toCoordinate } from '../helpers';
import { createMapConductorPointAnnotation } from './MapConductorPointAnnotation';
import type { MapKitActualMarker } from '../MapKitTypeAlias';

const DEFAULT_BITMAP_ICON = createDefaultIcon().toBitmapIcon();

/**
 * Web port of `MapKitMarkerRenderer` (marker/MapKitMarkerRenderer.swift).
 * Renders each marker as a native `mapkit.ImageAnnotation`.
 */
export class MapKitMarkerRenderer extends AbstractMarkerOverlayRenderer<MapKitViewHolder, MapKitActualMarker> {
  constructor(holder: MapKitViewHolder) {
    super({ holder });
    this.supportsAnimationOverlay = true;
  }

  private get map(): mapkit.Map {
    return this.holder.map;
  }

  createMarker(
    entity: MarkerEntity<MapKitActualMarker>,
    bitmapIcon: BitmapIcon = entity.state.icon?.toBitmapIcon() ?? DEFAULT_BITMAP_ICON,
  ): MapKitActualMarker | null {
    const annotation = createMapConductorPointAnnotation(entity.state, bitmapIcon);
    this.map.addAnnotation(annotation);
    return annotation;
  }

  // MapKit JS's ImageAnnotation image URL is fixed at construction time, so only
  // the coordinate (the frequently-changing property, e.g. during a drag) is
  // updated in place; an icon change is handled by the controller's remove/add.
  updateMarker(annotation: MapKitActualMarker, entity: MarkerEntity<MapKitActualMarker>): void {
    annotation.coordinate = toCoordinate(entity.state.position);
  }

  removeMarker(annotation: MapKitActualMarker): void {
    this.map.removeAnnotation(annotation);
  }

  async onAdd(data: AddParams[]): Promise<(MapKitActualMarker | null)[]> {
    return data.map(({ state, bitmapIcon }) =>
      this.createMarker({ state } as MarkerEntity<MapKitActualMarker>, bitmapIcon),
    );
  }

  async onChange(data: ChangeParams<MapKitActualMarker>[]): Promise<(MapKitActualMarker | null)[]> {
    return data.map(({ current }) => {
      if (!current.marker) return this.createMarker(current);
      this.updateMarker(current.marker, current);
      return current.marker;
    });
  }

  async onRemove(data: MarkerEntity<MapKitActualMarker>[]): Promise<void> {
    data.forEach(({ marker }) => {
      if (marker) this.removeMarker(marker);
    });
  }

  async onPostProcess(): Promise<void> {}

  setMarkerPosition(entity: MarkerEntity<MapKitActualMarker>, position: GeoPoint): void {
    if (entity.marker) entity.marker.coordinate = toCoordinate(position);
  }

  override setMarkerVisible(entity: MarkerEntity<MapKitActualMarker>, visible: boolean): void {
    if (entity.marker) entity.marker.visible = visible;
  }
}
