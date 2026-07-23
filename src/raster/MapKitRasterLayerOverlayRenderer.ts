import {
  RasterLayerEntity,
  TileScheme,
  type MapCameraPosition,
  type RasterLayerAddParams,
  type RasterLayerChangeParams,
  type RasterLayerOverlayRenderer,
  type RasterLayerSource,
  type RasterLayerState,
} from '@mapconductor/js-sdk-core';
import { MapKitViewHolder } from '../MapKitViewHolder';
import type { MapKitActualRasterLayer } from '../MapKitTypeAlias';

const DEFAULT_MIN_ZOOM = 0;
const DEFAULT_MAX_ZOOM = 22;

/**
 * Web port of `MapKitRasterLayerOverlayRenderer` (raster/MapKitRasterLayerOverlayRenderer.swift).
 * Uses `mapkit.TileOverlay` in place of the native `MKTileOverlay`.
 */
export class MapKitRasterLayerOverlayRenderer implements RasterLayerOverlayRenderer<MapKitActualRasterLayer> {
  constructor(readonly holder: MapKitViewHolder) {}

  private get map(): mapkit.Map {
    return this.holder.map;
  }

  createRasterLayer(entity: RasterLayerEntity<MapKitActualRasterLayer>): MapKitActualRasterLayer | null {
    const overlay = this.buildOverlay(entity.state);
    if (!overlay) return null;
    this.map.addTileOverlay(overlay);
    return overlay;
  }

  removeRasterLayer(overlay: MapKitActualRasterLayer): void {
    this.map.removeTileOverlay(overlay);
  }

  async onAdd(data: RasterLayerAddParams[]): Promise<(MapKitActualRasterLayer | null)[]> {
    return data.map(({ state }) =>
      state.visible ? this.createRasterLayer({ state } as RasterLayerEntity<MapKitActualRasterLayer>) : null,
    );
  }

  async onChange(data: RasterLayerChangeParams<MapKitActualRasterLayer>[]): Promise<(MapKitActualRasterLayer | null)[]> {
    return data.map(({ current, prev }) => {
      if (prev.layer) this.removeRasterLayer(prev.layer);
      return current.state.visible ? this.createRasterLayer(current) : null;
    });
  }

  async onRemove(data: RasterLayerEntity<MapKitActualRasterLayer>[]): Promise<void> {
    data.forEach(({ layer }) => {
      if (layer) this.removeRasterLayer(layer);
    });
  }

  async onCameraChanged(_mapCameraPosition: MapCameraPosition): Promise<void> {}

  async onPostProcess(): Promise<void> {}

  private buildOverlay(state: RasterLayerState): MapKitActualRasterLayer | null {
    const source = state.source;
    if (source.type === 'TileJson') {
      console.warn('[MapKit] MapKit raster layers do not support TileJson sources.');
      return null;
    }

    if (source.type === 'ArcGisService') {
      const serviceUrl = source.serviceUrl.replace(/\/+$/, '');
      const overlay = new mapkit.TileOverlay(`${serviceUrl}/tile/{z}/{y}/{x}`, {
        minimumZ: DEFAULT_MIN_ZOOM,
        maximumZ: DEFAULT_MAX_ZOOM,
        opacity: state.opacity,
      });
      return overlay;
    }

    return this.buildUrlTemplateOverlay(source, state.opacity);
  }

  private buildUrlTemplateOverlay(
    source: Extract<RasterLayerSource, { type: 'UrlTemplate' }>,
    opacity: number,
  ): MapKitActualRasterLayer {
    const minimumZ = source.minZoom ?? DEFAULT_MIN_ZOOM;
    const maximumZ = source.maxZoom ?? DEFAULT_MAX_ZOOM;
    const options: mapkit.TileOverlayConstructorOptions = { minimumZ, maximumZ, opacity };

    // MapKit JS resolves `{x}`/`{y}`/`{z}` in a plain URL template. TMS servers
    // number tiles from the bottom, so flip the row via a callback in that case.
    if (source.scheme === TileScheme.TMS) {
      const template = source.template;
      const urlCallback: mapkit.URLTemplateCallback = (x: number, y: number, z: number) => {
        const flippedY = (1 << z) - 1 - y;
        return template
          .replace(/\{x\}/g, String(x))
          .replace(/\{y\}/g, String(flippedY))
          .replace(/\{z\}/g, String(z));
      };
      return new mapkit.TileOverlay(urlCallback, options);
    }

    return new mapkit.TileOverlay(source.template, options);
  }
}
