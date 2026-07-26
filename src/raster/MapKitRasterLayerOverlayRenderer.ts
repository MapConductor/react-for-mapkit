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
 * Whether two sources would produce the same tile overlay. Opacity is a plain
 * property on the overlay, so an opacity-only change can reuse the existing
 * overlay instead of recreating it.
 */
function sourcesRenderEquivalent(a: RasterLayerSource, b: RasterLayerSource): boolean {
  if (a.type !== b.type) return false;
  if (a.type === 'UrlTemplate' && b.type === 'UrlTemplate') {
    return (
      a.template === b.template &&
      (a.scheme ?? TileScheme.XYZ) === (b.scheme ?? TileScheme.XYZ) &&
      (a.minZoom ?? DEFAULT_MIN_ZOOM) === (b.minZoom ?? DEFAULT_MIN_ZOOM) &&
      (a.maxZoom ?? DEFAULT_MAX_ZOOM) === (b.maxZoom ?? DEFAULT_MAX_ZOOM)
    );
  }
  if (a.type === 'ArcGisService' && b.type === 'ArcGisService') {
    return a.serviceUrl === b.serviceUrl;
  }
  // TileJson never yields an overlay, so it can never be reused.
  return false;
}

/**
 * Web port of `MapKitRasterLayerOverlayRenderer` (raster/MapKitRasterLayerOverlayRenderer.swift).
 * Uses `mapkit.TileOverlay` in place of the native `MKTileOverlay`; opacity is
 * applied through the overlay's own `opacity` property.
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
      if (!current.state.visible) {
        if (prev.layer) this.removeRasterLayer(prev.layer);
        return null;
      }
      // When the source is otherwise unchanged, reuse the existing overlay and
      // just update its opacity. Recreating it would re-fetch every tile.
      if (prev.layer && sourcesRenderEquivalent(prev.state.source, current.state.source)) {
        prev.layer.opacity = normalizeOpacity(current.state.opacity);
        return prev.layer;
      }
      if (prev.layer) this.removeRasterLayer(prev.layer);
      return this.createRasterLayer(current);
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
    const opacity = normalizeOpacity(state.opacity);

    if (source.type === 'TileJson') {
      console.warn('[MapKit] MapKit raster layers do not support TileJson sources.');
      return null;
    }

    if (source.type === 'ArcGisService') {
      const serviceUrl = source.serviceUrl.replace(/\/+$/, '');
      return new mapkit.TileOverlay(
        (x, y, z) => `${serviceUrl}/tile/${z}/${y}/${x}`,
        { minimumZ: DEFAULT_MIN_ZOOM, maximumZ: DEFAULT_MAX_ZOOM, opacity },
      );
    }

    return this.buildUrlTemplateOverlay(source, opacity);
  }

  private buildUrlTemplateOverlay(
    source: Extract<RasterLayerSource, { type: 'UrlTemplate' }>,
    opacity: number,
  ): MapKitActualRasterLayer {
    const minimumZ = source.minZoom ?? DEFAULT_MIN_ZOOM;
    const maximumZ = source.maxZoom ?? DEFAULT_MAX_ZOOM;

    const urlForTile = (x: number, y: number, z: number) => {
      const resolvedY = source.scheme === TileScheme.TMS ? (1 << z) - 1 - y : y;
      return source.template
        .replace(/\{x\}/g, String(x))
        .replace(/\{y\}/g, String(resolvedY))
        .replace(/\{z\}/g, String(z));
    };
    return new mapkit.TileOverlay(urlForTile, { minimumZ, maximumZ, opacity });
  }
}

function normalizeOpacity(opacity: number): number {
  return Math.min(1, Math.max(0, opacity));
}
