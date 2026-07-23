import { GroundImageController, GroundImageManager } from '@mapconductor/js-sdk-core';
import { MapKitGroundImageOverlayRenderer } from './MapKitGroundImageOverlayRenderer';
import { MapKitGroundImageOverlay } from './MapKitGroundImageOverlay';

/**
 * Web port of `MapKitGroundImageController` (groundimage/MapKitGroundImageController.swift).
 * Click handling is performed at the view-controller level via `find(position:)`.
 */
export class MapKitGroundImageController extends GroundImageController<MapKitGroundImageOverlay> {
  declare readonly renderer: MapKitGroundImageOverlayRenderer;

  constructor(renderer: MapKitGroundImageOverlayRenderer) {
    super({
      groundImageManager: new GroundImageManager<MapKitGroundImageOverlay>(),
      renderer,
    });
  }

  /** Re-project every ground image; called on camera changes. */
  redraw(): void {
    this.renderer.redraw();
  }
}
