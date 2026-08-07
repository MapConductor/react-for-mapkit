import { RasterLayerController, RasterLayerManager , type RasterHeaderSupport } from '@mapconductor/js-sdk-core';
import { MapKitRasterLayerOverlayRenderer } from './MapKitRasterLayerOverlayRenderer';
import type { MapKitActualRasterLayer } from '../MapKitTypeAlias';

/**
 * Web port of `MapKitRasterLayerController` (raster/MapKitRasterLayerController.swift).
 * Raster layers are not tappable, so there is no click handling here.
 */
export class MapKitRasterLayerController extends RasterLayerController<MapKitActualRasterLayer> {
  /**
   * MapKit JS の TileOverlay は URL を返す形で、リクエストに介入する口が無い。
   * ios の MapKit は対応済みなので、ここは web だけの制約。
   *
   * userAgent はブラウザが上書きを許さないので、どのプロバイダでも web では効かない。
   */
  protected override get headerSupport(): RasterHeaderSupport {
    return { provider: 'MapKit JS', extraHeaders: false };
  }

  declare readonly renderer: MapKitRasterLayerOverlayRenderer;

  constructor(renderer: MapKitRasterLayerOverlayRenderer) {
    super({
      rasterLayerManager: new RasterLayerManager<MapKitActualRasterLayer>(),
      renderer,
    });
  }
}
