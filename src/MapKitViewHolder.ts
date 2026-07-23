import {
  createGeoPoint,
  MapViewHolderBase,
  type GeoPoint,
  type GeoPointInterface,
  type Offset,
} from '@mapconductor/js-sdk-core';
import type { MapKitViewController } from './MapKitViewController';

/**
 * Web port of `MapKitViewHolder` (controller/MapKitViewHolder.swift).
 *
 * MapKit JS projects between geo coordinates and *page* coordinates
 * (`convertCoordinateToPointOnPage` / `convertPointOnPageToCoordinate`), whereas
 * MapConductor overlays (InfoBubble, marker animation) are positioned relative
 * to the map container. This holder translates between the two by offsetting
 * against the container's bounding rectangle.
 */
export class MapKitViewHolder extends MapViewHolderBase<HTMLElement, mapkit.Map> {
  private _controller: MapKitViewController | null = null;

  constructor(
    readonly mapView: HTMLElement,
    readonly map: mapkit.Map,
  ) {
    super();
  }

  getController(): MapKitViewController | null {
    return this._controller;
  }

  setController(controller: MapKitViewController): void {
    this._controller = controller;
  }

  private containerOrigin(): { left: number; top: number } {
    const rect = this.mapView.getBoundingClientRect();
    const scrollX = typeof window !== 'undefined' ? window.scrollX : 0;
    const scrollY = typeof window !== 'undefined' ? window.scrollY : 0;
    return { left: rect.left + scrollX, top: rect.top + scrollY };
  }

  toScreenOffset(position: GeoPointInterface): Offset | null {
    try {
      const pagePoint = this.map.convertCoordinateToPointOnPage(
        new mapkit.Coordinate(position.latitude, position.longitude),
      );
      if (!pagePoint || !Number.isFinite(pagePoint.x) || !Number.isFinite(pagePoint.y)) return null;
      const origin = this.containerOrigin();
      return { x: pagePoint.x - origin.left, y: pagePoint.y - origin.top };
    } catch {
      return null;
    }
  }

  fromScreenOffsetSync(offset: Offset): GeoPoint | null {
    try {
      const origin = this.containerOrigin();
      const coordinate = this.map.convertPointOnPageToCoordinate(
        new DOMPoint(offset.x + origin.left, offset.y + origin.top),
      );
      if (!coordinate) return null;
      return createGeoPoint({ latitude: coordinate.latitude, longitude: coordinate.longitude });
    } catch {
      return null;
    }
  }
}
