import {
  BaseMapViewController,
  MapUISettingsDiagnostics,
  type MapUISettings,
  computeFitBoundsCameraPosition,
  type CircleCapable,
  type CircleState,
  type GeoRectBounds,
  type GroundImageCapable,
  type GroundImageState,
  type MapCameraPosition,
  type MapViewControllerInterface,
  type MarkerAnimationOverlayHost,
  type MarkerCapable,
  type MarkerState,
  type OnCircleEventHandler,
  type OnGroundImageEventHandler,
  type OnMapInitializedHandler,
  type OnMarkerEventHandler,
  type OnPolygonEventHandler,
  type OnPolylineEventHandler,
  type PolygonCapable,
  type PolygonState,
  type PolylineCapable,
  type PolylineState,
  type RasterLayerCapable,
  type RasterLayerState,
} from '@mapconductor/js-sdk-core';
import { MapKitViewHolder } from './MapKitViewHolder';
import { MapKitZoomAltitudeConverter } from './zoom/ZoomAltitudeConverter';
import { MapKitMapDesign, type MapKitMapDesignTypeInterface } from './MapKitMapDesign';
import { MapKitMarkerController } from './marker/MapKitMarkerController';
import { MapKitCircleController } from './circle/MapKitCircleController';
import { MapKitPolylineController } from './polyline/MapKitPolylineController';
import { MapKitPolygonController } from './polygon/MapKitPolygonController';
import { MapKitGroundImageController } from './groundimage/MapKitGroundImageController';
import { MapKitRasterLayerController } from './raster/MapKitRasterLayerController';
import { MapKitCameraState } from './MapKitCameraState';
import { handleSingleTap, pointFromEvent, type TapDeps } from './MapKitTapHandlers';

export type MapKitDesignTypeChangeHandler = (value: MapKitMapDesignTypeInterface) => void;

/**
 * Web port of `MapKitViewController` (controller/MapKitViewController.swift).
 * Implements the shared MapConductor view-controller contract on top of a
 * `mapkit.Map`.
 */
export class MapKitViewController
  extends BaseMapViewController
  implements
    MapViewControllerInterface,
    MarkerCapable,
    CircleCapable,
    PolylineCapable,
    PolygonCapable,
    GroundImageCapable,
    RasterLayerCapable
{
  private readonly map: mapkit.Map;

  /** カメラの読み書き。状態を持つのでコンストラクタで組み立てて注入する。 */
  private readonly camera: MapKitCameraState;

  /** タップ配送へ渡す依存一式。private を覗かせずに必要なものだけ束ねる。 */
  private get tapDeps(): TapDeps {
    return {
      map: this.map,
      markerController: this.markerController,
      circleController: this.circleController,
      polylineController: this.polylineController,
      polygonController: this.polygonController,
      groundImageController: this.groundImageController,
      getCameraPosition: () => this.getCameraPosition(),
      onMapClick: (point) => this.notifyMapClick(point),
    };
  }
  private readonly eventCleanup: (() => void)[] = [];
  private initialized = false;
  private moving = false;
  private rafId: number | null = null;
  private mapDesignType: MapKitMapDesignTypeInterface;
  private mapDesignTypeChangeListener: MapKitDesignTypeChangeHandler | null = null;

  constructor(
    readonly holder: MapKitViewHolder,
    private readonly converter: MapKitZoomAltitudeConverter,
    private readonly markerController: MapKitMarkerController,
    private readonly circleController: MapKitCircleController,
    private readonly polylineController: MapKitPolylineController,
    private readonly polygonController: MapKitPolygonController,
    private readonly groundImageController: MapKitGroundImageController,
    private readonly rasterLayerController: MapKitRasterLayerController,
    mapDesignType: MapKitMapDesignTypeInterface = MapKitMapDesign.Standard,
    logicalTiltHint: number | null = null,
  ) {
    super();
    this.map = holder.map;
    this.holder.setController(this);
    this.mapDesignType = mapDesignType;
    this.camera = new MapKitCameraState(
      {
        map: this.map,
        holder,
        converter: this.converter,
        onCameraForward: (camera) => this.forwardCameraToOverlays(camera),
      },
      logicalTiltHint,
    );
    // Tiled markers render into a raster overlay driven by the raster controller.
    this.markerController.onRasterLayerUpdate = async (state) => {
      if (state) await this.rasterLayerController.composition([state]);
      else await this.rasterLayerController.clear();
    };
    this.setupEventListeners();
    // MapKit JS maps are usable immediately after construction; announce
    // readiness on the next microtask so listeners set up right after can fire.
    queueMicrotask(() => {
      this.initialized = true;
      this.notifyMapInitialized();
    });
    this.camera.scheduleInitialAltitudeCorrection();
  }


  getMap(): mapkit.Map {
    return this.map;
  }

  /**
   * MapKit JS has no tilt gesture at all — its camera is always overhead — so
   * only scroll, zoom and rotation can be gated.
   */
  applyUISettings(settings: MapUISettings): void {
    this.map.isScrollEnabled = settings.scrollGesture;
    this.map.isZoomEnabled = settings.zoomGesture;
    this.map.isRotationEnabled = settings.rotateGesture;

    MapUISettingsDiagnostics.warnIfRequested(
      settings.tiltGesture, 'tilt', 'MapKit',
      'MapKit JS renders a flat map and has no tilt gesture',
    );
  }

  setMapDesignType(value: MapKitMapDesignTypeInterface): void {
    this.mapDesignType = value;
    this.map.mapType = MapKitMapDesign.toMapType(value);
    this.mapDesignTypeChangeListener?.(value);
  }

  setMapDesignTypeChangeListener(listener: MapKitDesignTypeChangeHandler | null): void {
    this.mapDesignTypeChangeListener = listener;
    listener?.(this.mapDesignType);
  }

  override setMapInitializedListener(listener: OnMapInitializedHandler | null): void {
    super.setMapInitializedListener(listener);
    if (listener && this.initialized) this.notifyMapInitialized();
  }

  private setupEventListeners(): void {
    const onRegionChangeStart = () => this.startMoveLoop();
    const onRegionChangeEnd = () => this.stopMoveLoop();
    const onSingleTap = (event: mapkit.EventBase<mapkit.Map>) => handleSingleTap(this.tapDeps, event);
    const onLongPress = (event: mapkit.EventBase<mapkit.Map>) => {
      const point = pointFromEvent(this.tapDeps, event);
      if (point) this.notifyMapLongClick(point);
    };

    this.map.addEventListener('region-change-start', onRegionChangeStart);
    this.map.addEventListener('region-change-end', onRegionChangeEnd);
    this.map.addEventListener('single-tap', onSingleTap);
    this.map.addEventListener('long-press', onLongPress);

    this.eventCleanup.push(() => {
      this.map.removeEventListener('region-change-start', onRegionChangeStart);
      this.map.removeEventListener('region-change-end', onRegionChangeEnd);
      this.map.removeEventListener('single-tap', onSingleTap);
      this.map.removeEventListener('long-press', onLongPress);
    });
  }

  // MapKit JS emits region-change start/end but no continuous move event, so a
  // rAF loop bridges the gap and broadcasts the camera as it settles.
  private startMoveLoop(): void {
    if (this.moving) return;
    this.moving = true;
    const camera = this.getCameraPosition();
    if (camera) {
      this.forwardCameraToOverlays(camera);
      this.notifyCameraMoveStart(camera);
    }
    const tick = () => {
      if (!this.moving) return;
      const current = this.getCameraPosition();
      if (current) {
        this.forwardCameraToOverlays(current);
        this.notifyCameraMove(current);
      }
      this.groundImageController.redraw();
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private stopMoveLoop(): void {
    if (!this.moving) return;
    this.moving = false;
    if (this.rafId != null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    const camera = this.getCameraPosition();
    if (camera) {
      this.forwardCameraToOverlays(camera);
      this.notifyCameraMove(camera);
      this.notifyCameraMoveEnd(camera);
    }
    this.groundImageController.redraw();
  }

  // MapKit has no continuous move event and never fed the overlay controllers a
  // camera, so PolylineController.currentCameraPosition stayed null and polyline
  // click hit-testing sized its tap tolerance at zoom 0 (a ~thousands-of-km
  // band). Forward the live camera so the tolerance is computed from the real
  // zoom, mirroring notifyControllersCameraChanged in the other providers.
  private forwardCameraToOverlays(camera: MapCameraPosition): void {
    void this.polylineController.onCameraChanged(camera);
  }







  // --- Camera ---

  getCameraPosition(): MapCameraPosition | null { return this.camera.read(); }

  moveCamera(position: MapCameraPosition): Promise<boolean> {
    return this.camera.commit(position, { animated: false });
  }

  animateCamera(position: MapCameraPosition, durationMillis: number): Promise<boolean> {
    return this.camera.commit(position, { animated: true, duration: durationMillis });
  }


  // Unified fit: the core computes center + zoom; moveCamera keeps the current
  // rotation (MapKit's setRegionAnimated would reset heading to north-up).
  fitBounds(bounds: GeoRectBounds, padding: number): Promise<boolean> {
    if (!bounds.southWest || !bounds.northEast) return Promise.resolve(false);
    const current = this.getCameraPosition();
    if (!current) return Promise.resolve(false);
    const el = this.holder.mapView;
    const fit = computeFitBoundsCameraPosition({
      bounds,
      viewportWidthPx: el.clientWidth,
      viewportHeightPx: el.clientHeight,
      padding,
      bearing: current.bearing,
    });
    if (!fit) return Promise.resolve(false);
    const target = current.copy({ position: fit.center, zoom: fit.zoom });
    // fitBounds は core のインタフェース上 duration を受け取らない（android-sdk 揃え）。
    // snapZoom:false — keep the fractional fit zoom so `padding` is honored.
    return this.camera.commit(target, { animated: false, snapZoom: false });
  }






  // --- Marker ---

  async compositionMarkers(data: MarkerState[]): Promise<void> {
    await this.markerController.composition(data);
  }

  async updateMarker(state: MarkerState): Promise<void> {
    await this.markerController.update(state);
  }

  hasMarker(state: MarkerState): boolean {
    return this.markerController.has(state);
  }

  setOnMarkerClickListener(listener: OnMarkerEventHandler | null): void {
    this.markerController.setOnClickListener(listener);
  }
  setOnMarkerDragStart(listener: OnMarkerEventHandler | null): void {
    this.markerController.setOnDragStart(listener);
  }
  setOnMarkerDrag(listener: OnMarkerEventHandler | null): void {
    this.markerController.setOnDrag(listener);
  }
  setOnMarkerDragEnd(listener: OnMarkerEventHandler | null): void {
    this.markerController.setOnDragEnd(listener);
  }
  setOnMarkerAnimateStart(listener: OnMarkerEventHandler | null): void {
    this.markerController.setOnAnimateStart(listener);
  }
  setOnMarkerAnimateEnd(listener: OnMarkerEventHandler | null): void {
    this.markerController.setOnAnimateEnd(listener);
  }
  setMarkerAnimationOverlayHost(host: MarkerAnimationOverlayHost | null): void {
    this.markerController.setMarkerAnimationOverlayHost(host);
  }

  // --- Circle ---

  async compositionCircles(data: CircleState[]): Promise<void> {
    await this.circleController.composition(data);
  }
  async updateCircle(state: CircleState): Promise<void> {
    await this.circleController.update(state);
  }
  hasCircle(state: CircleState): boolean {
    return this.circleController.has(state);
  }
  setOnCircleClickListener(listener: OnCircleEventHandler | null): void {
    this.circleController.setOnClickListener(listener);
  }

  // --- Polyline ---

  async compositionPolylines(data: PolylineState[]): Promise<void> {
    await this.polylineController.composition(data);
  }
  async updatePolyline(state: PolylineState): Promise<void> {
    await this.polylineController.update(state);
  }
  hasPolyline(state: PolylineState): boolean {
    return this.polylineController.has(state);
  }
  setOnPolylineClickListener(listener: OnPolylineEventHandler | null): void {
    this.polylineController.setOnClickListener(listener);
  }

  // --- Polygon ---

  async compositionPolygons(data: PolygonState[]): Promise<void> {
    await this.polygonController.composition(data);
  }
  async updatePolygon(state: PolygonState): Promise<void> {
    await this.polygonController.update(state);
  }
  hasPolygon(state: PolygonState): boolean {
    return this.polygonController.has(state);
  }
  setOnPolygonClickListener(listener: OnPolygonEventHandler | null): void {
    this.polygonController.setOnClickListener(listener);
  }

  // --- GroundImage ---

  async compositionGroundImages(data: GroundImageState[]): Promise<void> {
    await this.groundImageController.composition(data);
    this.groundImageController.redraw();
  }
  async updateGroundImage(state: GroundImageState): Promise<void> {
    await this.groundImageController.update(state);
    this.groundImageController.redraw();
  }
  hasGroundImage(state: GroundImageState): boolean {
    return this.groundImageController.has(state);
  }
  setOnGroundImageClickListener(listener: OnGroundImageEventHandler | null): void {
    this.groundImageController.setOnClickListener(listener);
  }

  // --- RasterLayer ---

  async compositionRasterLayers(data: RasterLayerState[]): Promise<void> {
    await this.rasterLayerController.composition(data);
  }
  async updateRasterLayer(state: RasterLayerState): Promise<void> {
    await this.rasterLayerController.update(state);
  }
  hasRasterLayer(state: RasterLayerState): boolean {
    return this.rasterLayerController.has(state);
  }

  // --- Lifecycle ---

  async clearOverlays(): Promise<void> {
    await this.markerController.clear();
    await this.circleController.clear();
    await this.polylineController.clear();
    await this.polygonController.clear();
    await this.groundImageController.clear();
    await this.rasterLayerController.clear();
  }

  destroy(): void {
    if (this.rafId != null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    this.camera.dispose();
    this.moving = false;
    for (const cleanup of this.eventCleanup) cleanup();
    this.eventCleanup.length = 0;
    void this.clearOverlays().finally(() => {
      this.markerController.destroy();
      this.groundImageController.renderer.destroy();
      this.map.destroy();
    });
  }
}
