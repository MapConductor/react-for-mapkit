import { PolygonController, PolygonManager } from '@mapconductor/js-sdk-core';
import { MapKitPolygonOverlayRenderer } from './MapKitPolygonOverlayRenderer';
import type { MapKitActualPolygon } from '../MapKitTypeAlias';

/**
 * Web port of `MapKitPolygonController` (polygon/MapKitPolygonController.swift).
 * Click handling is performed at the view-controller level via `find(position:)`.
 */
export class MapKitPolygonController extends PolygonController<MapKitActualPolygon> {
  declare readonly renderer: MapKitPolygonOverlayRenderer;

  constructor(renderer: MapKitPolygonOverlayRenderer) {
    super({
      polygonManager: new PolygonManager<MapKitActualPolygon>(),
      renderer,
    });
  }
}
