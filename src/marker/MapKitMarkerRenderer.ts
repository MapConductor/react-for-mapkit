import {
  AbstractMarkerOverlayRenderer,
  createDefaultIcon,
  MarkerDrawOrderView,
  toNativeHeading,
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
    // Re-sorting reassigns the whole annotation list, so the order catches up
    // once the region settles rather than following the rotation.
    holder.map.addEventListener('region-change-end', () => this.followHeading());
  }

  /** @internal */
  private readonly drawOrder = new MarkerDrawOrderView();
  /** Each annotation's zIndex, to recompute its draw order when the map turns. @internal */
  private readonly zIndexes = new WeakMap<MapKitActualMarker, number | null>();

  /** Each annotation's place in the shared marker draw order (see markerDrawOrder). @internal */
  private readonly drawOrders = new WeakMap<MapKitActualMarker, number>();
  /** @internal */
  private orderDirty = false;

  /** @internal */
  private setDrawOrder(
    annotation: MapKitActualMarker,
    zIndex: number | null,
    position: { latitude: number; longitude: number },
  ): void {
    this.zIndexes.set(annotation, zIndex);
    const order = this.drawOrder.order(zIndex, position);
    if (this.drawOrders.get(annotation) === order) return;
    this.drawOrders.set(annotation, order);
    this.orderDirty = true;
  }

  /** Re-sorts after the map turns: among equal zIndex, the one lower on screen is in front. @internal */
  private followHeading(): void {
    // map.rotation turns the map clockwise, like MapConductor's bearing (see
    // MapKitCameraState.setRotation), so it is the opposite of a heading.
    if (!this.drawOrder.update(toNativeHeading(this.map.rotation), this.map.center?.longitude)) return;
    for (const annotation of this.map.annotations as MapKitActualMarker[]) {
      if (!this.drawOrders.has(annotation)) continue;
      this.setDrawOrder(annotation, this.zIndexes.get(annotation) ?? null, annotation.coordinate);
    }
    void this.onPostProcess();
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
    // order (zIndex, then lower on the rotated screen, then further left) no
    // longer matches, re-add this
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
    // Assigning the list reorders it, but MapKit JS restacks the page only when
    // an annotation is added (in the same tick that worked by luck: right after
    // the composition's adds). Re-adding the topmost one keeps it last and makes
    // the new order show now. A selected one is left alone so it stays selected.
    const top = sorted[sorted.length - 1];
    if (!top.selected) {
      this.map.removeAnnotation(top);
      this.map.addAnnotation(top);
    }
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
