import {
  AbstractMarkerOverlayRenderer,
  createDefaultIcon,
  markerDrawOrder,
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

  /** Each annotation's place in the shared marker draw order (see markerDrawOrder). @internal */
  private readonly drawOrders = new WeakMap<MapKitActualMarker, number>();
  /** @internal */
  private orderDirty = false;

  /** @internal */
  private setDrawOrder(annotation: MapKitActualMarker, zIndex: number | null, position: GeoPoint): void {
    const order = markerDrawOrder(zIndex, position);
    if (this.drawOrders.get(annotation) === order) return;
    this.drawOrders.set(annotation, order);
    this.orderDirty = true;
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
    this.setDrawOrder(annotation, entity.state.zIndex, entity.state.position);
    return annotation;
  }

  // MapKit JS's ImageAnnotation image URL is fixed at construction time, so only
  // the coordinate (the frequently-changing property, e.g. during a drag) is
  // updated in place; an icon change is handled by the controller's remove/add.
  updateMarker(annotation: MapKitActualMarker, entity: MarkerEntity<MapKitActualMarker>): void {
    annotation.coordinate = toCoordinate(entity.state.position);
    this.setDrawOrder(annotation, entity.state.zIndex, entity.state.position);
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

  async onPostProcess(): Promise<void> {
    // MapKit JS stacks annotations in the order they were added (later on top)
    // and has no z-order option; the annotation's `element` is only a slot
    // placeholder, so a CSS z-index on it does nothing. When the shared draw
    // order (zIndex, then south, then west) no longer matches, re-add this
    // renderer's annotations in that order. Only when needed: re-adding every
    // marker on each composition would be wasted work. The list is assigned as
    // a whole: removeAnnotations + addAnnotations of the same objects leaves
    // them detached from the map.
    if (!this.orderDirty) return;
    this.orderDirty = false;
    const ours = this.map.annotations.filter(annotation => this.drawOrders.has(annotation as MapKitActualMarker)) as MapKitActualMarker[];
    if (ours.length <= 1) return;
    const sorted = [...ours].sort((a, b) => (this.drawOrders.get(a) ?? 0) - (this.drawOrders.get(b) ?? 0));
    if (sorted.every((annotation, index) => annotation === ours[index])) return;
    const others = this.map.annotations.filter(annotation => !this.drawOrders.has(annotation as MapKitActualMarker));
    this.map.annotations = [...others, ...sorted];
  }

  setMarkerPosition(entity: MarkerEntity<MapKitActualMarker>, position: GeoPoint): void {
    if (!entity.marker) return;
    entity.marker.coordinate = toCoordinate(position);
    this.setDrawOrder(entity.marker, entity.state.zIndex, position);
  }

  override setMarkerVisible(entity: MarkerEntity<MapKitActualMarker>, visible: boolean): void {
    if (entity.marker) entity.marker.visible = visible;
  }
}
