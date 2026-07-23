import { PolylineController, PolylineManager } from '@mapconductor/js-sdk-core';
import { MapKitPolylineOverlayRenderer } from './MapKitPolylineOverlayRenderer';
import type { MapKitActualPolyline } from '../MapKitTypeAlias';

/**
 * Web port of `MapKitPolylineController` (polyline/MapKitPolylineController.swift).
 * Click handling is performed at the view-controller level via `findWithClosestPoint(position:)`.
 */
export class MapKitPolylineController extends PolylineController<MapKitActualPolyline> {
  declare readonly renderer: MapKitPolylineOverlayRenderer;

  constructor(renderer: MapKitPolylineOverlayRenderer) {
    super({
      polylineManager: new PolylineManager<MapKitActualPolyline>(),
      renderer,
    });
  }
}
