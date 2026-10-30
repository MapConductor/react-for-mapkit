import {
  AbstractMarkerController,
  createGeoPoint,
  createRasterLayerState,
  LocalTileServer,
  MARKER_HIT_RADIUS_MOUSE_PX,
  MARKER_HIT_RADIUS_TOUCH_PX,
  MarkerManager,
  MarkerTileRenderer,
  MarkerTilingOptions,
  RasterLayerSource,
  markerHitShape,
  tilePixelRatio,
  pickMarkerHit,
  type GeoPoint,
  type MarkerEntity,
  type MarkerState,
  type RasterLayerState,
} from '@mapconductor/js-sdk-core';
import { MapKitMarkerRenderer } from './MapKitMarkerRenderer';
import type { MapKitActualMarker } from '../MapKitTypeAlias';
import type { MapConductorPointAnnotationData } from './MapConductorPointAnnotation';

/** How long after a press a `select` still counts as that press's. */
const SELECT_AFTER_PRESS_MS = 1000;

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

  /**
   * Wired by MapKitViewController: a press MapKit took as selecting an
   * annotation, but that fell beside the pin as drawn, goes back to the map's
   * tap dispatch at this page point instead.
   */
  onSelectMissed: ((pointOnPage: DOMPoint) => void) | null = null;

  /**
   * The last press on the map, in page coordinates. MapKit selects an
   * ImageAnnotation anywhere on its image, and a default pin is drawn about
   * 31 px wide in a 48 px square, so `select` is checked against the drawn pin
   * (`markerHitShape`) at this point before it counts as a click. `select`
   * itself carries no position.
   */
  private lastPress: { x: number; y: number; touch: boolean; at: number } | null = null;
  private get mapElement(): HTMLElement {
    return this.renderer.holder.map.element as HTMLElement;
  }
  private readonly onPress = (event: PointerEvent) => {
    this.lastPress = { x: event.pageX, y: event.pageY, touch: event.pointerType === 'touch', at: performance.now() };
  };

  constructor(
    renderer: MapKitMarkerRenderer,
    private readonly tilingOptions: MarkerTilingOptions = MarkerTilingOptions.Default,
  ) {
    super({
      markerManager: MarkerManager.defaultManager<MapKitActualMarker>(null, tilingOptions.minMarkerCount),
      renderer,
    });
    // Capture: MapKit stops presses on annotations from reaching the map.
    this.mapElement.addEventListener('pointerdown', this.onPress, true);
  }

  override async update(state: MarkerState): Promise<void> {
    if (this.isDragging(state)) return;
    await super.update(state);
  }

  /** Whether a press landed on the pin as drawn (a finger gets MARKER_HIT_RADIUS_TOUCH_PX of slop). */
  private pressHitsPin(annotation: MapKitActualMarker, press: { x: number; y: number; touch: boolean }): boolean {
    const bitmap = (annotation.data as MapConductorPointAnnotationData).initialBitmapIcon;
    const anchor = this.renderer.holder.map.convertCoordinateToPointOnPage(annotation.coordinate);
    const tolerance = press.touch ? MARKER_HIT_RADIUS_TOUCH_PX : MARKER_HIT_RADIUS_MOUSE_PX;
    return pickMarkerHit(
      press,
      [annotation],
      () => ({ anchorScreen: { x: anchor.x, y: anchor.y }, ...markerHitShape(bitmap) }),
      tolerance,
    ) !== null;
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
    this.mapElement.removeEventListener('pointerdown', this.onPress, true);
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
      const press = this.lastPress;
      // No recent press: selected some other way (keyboard), so it counts.
      if (press && performance.now() - press.at <= SELECT_AFTER_PRESS_MS && !this.pressHitsPin(annotation, press)) {
        this.onSelectMissed?.(new DOMPoint(press.x, press.y));
        return;
      }
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
      .filter(entity => entity.tiling)
      .map(entity => entity.state);

    if (tiledStates.length === 0) {
      await this.removeTileOverlay();
      return;
    }

    this.tileRouteId ??= `mc-mapkit-tile-${generateId()}`;
    const server = LocalTileServer.startServer();
    // MapKit JS draws every TileOverlay image into a 256 CSS-pixel tile node,
    // whatever the image's own size, so a 2x image is just sharper.
    const pixelRatio = tilePixelRatio();
    const renderer = new MarkerTileRenderer<MarkerState>(
      tiledStates,
      256,
      this.tilingOptions.iconScaleCallback ?? undefined,
      1.0,
      false,
      this.tilingOptions.declutterPx,
      pixelRatio,
    );
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
      pixelRatio,
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
