import { CircleController, CircleManager } from '@mapconductor/js-sdk-core';
import { MapKitCircleOverlayRenderer } from './MapKitCircleOverlayRenderer';
import type { MapKitActualCircle } from '../MapKitTypeAlias';

/**
 * Web port of `MapKitCircleController` (circle/MapKitCircleController.swift).
 * Click handling is performed at the view-controller level via `find(position:)`.
 */
export class MapKitCircleController extends CircleController<MapKitActualCircle> {
  declare readonly renderer: MapKitCircleOverlayRenderer;

  constructor(renderer: MapKitCircleOverlayRenderer) {
    super({
      circleManager: new CircleManager<MapKitActualCircle>(),
      renderer,
    });
  }
}
