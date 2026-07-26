import {
  AbstractMarkerController,
  createGeoPoint,
  createRasterLayerState,
  LocalTileServer,
  MARKER_HIT_RADIUS_MOUSE_PX,
  MarkerManager,
  MarkerTileRenderer,
  MarkerTilingOptions,
  RasterLayerSource,
  type GeoPoint,
  type MarkerEntity,
  type MarkerState,
  type RasterLayerState,
} from '@mapconductor/js-sdk-core';
import { MapKitMarkerRenderer } from './MapKitMarkerRenderer';
import type { MapKitActualMarker } from '../MapKitTypeAlias';

/**
 * Web port of `MapKitMarkerController` (marker/MapKitMarkerController.swift).
 *
 * MapKit JS annotations emit their own `select` and `drag-*` events, so click
 * and drag handling is attached per-annotation in {@link onMarkerAdded} rather
 * than through map-level hit testing.
 */
export class MapKitMarkerController extends AbstractMarkerController<MapKitActualMarker> {
  declare readonly renderer: MapKitMarkerRenderer;

  private tileRenderer: MarkerTileRenderer<MarkerState> | null = null;
  private tileRouteId: string | null = null;
  private tileVersion = 0;
  private tileGeneration = 0;

  /** Wired by MapKitViewController to drive the tiled-marker raster overlay. */
  onRasterLayerUpdate: ((state: RasterLayerState | null) => Promise<void>) | null = null;

  constructor(
    renderer: MapKitMarkerRenderer,
    private readonly tilingOptions: MarkerTilingOptions = MarkerTilingOptions.Default,
  ) {
    super({
      markerManager: MarkerManager.defaultManager<MapKitActualMarker>(null, tilingOptions.minMarkerCount),
      renderer,
    });
  }

  override async update(state: MarkerState): Promise<void> {
    if (this.isDragging(state)) return;
    await super.update(state);
  }

  /** Nearest tiled (raster) marker to a clicked point, or null. */
  findTiled(position: GeoPoint, zoom: number): MarkerEntity<MapKitActualMarker> | null {
    const found = this.tileRenderer?.findNearest(position, MARKER_HIT_RADIUS_MOUSE_PX, zoom);
    return found ? this.markerManager.getEntity(found.id) : null;
  }

  protected override shouldTile(state: MarkerState, totalCount: number): boolean {
    return (
      this.tilingOptions.enabled &&
      totalCount >= this.tilingOptions.minMarkerCount &&
      !state.draggable &&
      state.getAnimation() == null &&
      LocalTileServer.isServiceWorkerSupported()
    );
  }

  protected override async onTiledMarkersChanged(): Promise<void> {
    await this.syncTiledOverlay();
  }

  override async clear(): Promise<void> {
    await super.clear();
    await this.removeTileOverlay();
  }

  override destroy(): void {
    void this.removeTileOverlay();
    super.destroy();
  }

  protected override onMarkerAdded(entity: MarkerEntity<MapKitActualMarker>): void {
    const annotation = entity.marker;
    if (!annotation) return;
    const state = entity.state;

    annotation.addEventListener('select', () => {
      // Suppress MapKit's built-in selection/callout; we only use it as a tap signal.
      annotation.selected = false;
      if (state.clickable) this.dispatchClick(state);
    });

    if (!state.draggable) return;

    annotation.addEventListener('drag-start', () => {
      this.setDraggingState(state, true);
      this.dispatchDragStart(state);
    });
    annotation.addEventListener('dragging', (event) => {
      const coordinate = (event as unknown as { coordinate?: mapkit.Coordinate }).coordinate;
      if (!coordinate) return;
      state.setPosition(createGeoPoint({ latitude: coordinate.latitude, longitude: coordinate.longitude }));
      this.dispatchDrag(state);
    });
    annotation.addEventListener('drag-end', () => {
      this.setDraggingState(state, false);
      this.dispatchDragEnd(state);
    });
  }

  private async syncTiledOverlay(): Promise<void> {
    const generation = ++this.tileGeneration;
    const tiledStates = this.markerManager
      .allEntities()
      .filter(entity => entity.marker === null)
      .map(entity => entity.state);

    if (tiledStates.length === 0) {
      await this.removeTileOverlay();
      return;
    }

    this.tileRouteId ??= `mc-mapkit-tile-${generateId()}`;
    const server = LocalTileServer.startServer();
    const renderer = new MarkerTileRenderer<MarkerState>(tiledStates, {
      tileSize: 256,
      iconScaleCallback: this.tilingOptions.iconScaleCallback ?? undefined,
    });
    this.tileRenderer = renderer;
    this.tileVersion++;
    server.register(this.tileRouteId, renderer);

    // MapKit JS has no custom tile-protocol hook, so tiles are served through the
    // shared service worker (gated on SW support in shouldTile).
    server.startServiceWorker('/tile-sw.js');
    await server.waitForController();
    await server.sendSWRegisterAndWait(this.tileRouteId, await renderer.toSWData());
    const template = server.urlTemplate({
      routeId: this.tileRouteId,
      tileSize: 256,
      cacheKey: String(this.tileVersion),
    });

    // A newer sync (or clear()/destroy()) ran while we awaited the service worker;
    // applying this stale result would resurrect a removed overlay or clobber a newer one.
    if (generation !== this.tileGeneration) return;

    await this.onRasterLayerUpdate?.(createRasterLayerState({
      id: 'mc-marker-tiles',
      source: RasterLayerSource.UrlTemplate({ template, tileSize: 256 }),
    }));
  }

  private async removeTileOverlay(): Promise<void> {
    this.tileGeneration++;
    if (!this.tileRouteId) return;
    LocalTileServer.startServer().unregister(this.tileRouteId);
    this.tileRenderer = null;
    this.tileRouteId = null;
    await this.onRasterLayerUpdate?.(null);
  }
}

function generateId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
}
