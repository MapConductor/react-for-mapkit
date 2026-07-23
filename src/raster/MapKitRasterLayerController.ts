import { RasterLayerController, RasterLayerManager } from '@mapconductor/js-sdk-core';
import { MapKitRasterLayerOverlayRenderer } from './MapKitRasterLayerOverlayRenderer';
import type { MapKitActualRasterLayer } from '../MapKitTypeAlias';

/**
 * Web port of `MapKitRasterLayerController` (raster/MapKitRasterLayerController.swift).
 * Raster layers are not tappable, so there is no click handling here.
 */
export class MapKitRasterLayerController extends RasterLayerController<MapKitActualRasterLayer> {
  declare readonly renderer: MapKitRasterLayerOverlayRenderer;

  constructor(renderer: MapKitRasterLayerOverlayRenderer) {
    super({
      rasterLayerManager: new RasterLayerManager<MapKitActualRasterLayer>(),
      renderer,
    });
  }
}
