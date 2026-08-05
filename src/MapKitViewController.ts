import {
  BaseMapViewController,
  MapUISettingsDiagnostics,
  type MapUISettings,
  computeFitBoundsCameraPosition,
  createGeoPoint,
  createGeoRectBounds,
  createMapCameraPosition,
  Earth,
  type CameraOptions,
  type CircleCapable,
  type CircleEvent,
  type CircleState,
  type GeoPoint,
  type GeoRectBounds,
  type GroundImageCapable,
  type GroundImageEvent,
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
  type PolygonEvent,
  type PolygonState,
  type PolylineCapable,
  type PolylineEvent,
  type PolylineState,
  type RasterLayerCapable,
  type RasterLayerState,
  type VisibleRegion,
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
  private readonly eventCleanup: (() => void)[] = [];
  private initialized = false;
  private moving = false;
  private rafId: number | null = null;
  private logicalTiltHint: number | null;
  private mapDesignType: MapKitMapDesignTypeInterface;
  private mapDesignTypeChangeListener: MapKitDesignTypeChangeHandler | null = null;
  private lastCameraTarget: MapCameraPosition | null = null;
  private initialAltitudeCorrected = false;
  private initialAltitudeRafId: number | null = null;

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
    this.logicalTiltHint = logicalTiltHint;
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
    this.scheduleInitialAltitudeCorrection();
  }

  // The very first moveCamera() runs before the map has laid out, so its camera
  // distance comes from the constant converter (approximate). Once the map has a
  // size, re-derive the distance from the live projection so the initial zoom
  // matches Google Maps exactly, without waiting for a user gesture.
  private scheduleInitialAltitudeCorrection(): void {
    let attempts = 0;
    const tick = () => {
      this.initialAltitudeRafId = null;
      if (this.initialAltitudeCorrected) return;
      if (this.lastCameraTarget && this.measureGoogleZoom() != null) {
        this.initialAltitudeCorrected = true;
        void this.moveCamera(this.lastCameraTarget);
        // Seed the overlay controllers with the settled camera so click
        // hit-testing works before the user moves the map.
        const camera = this.getCameraPosition();
        if (camera) this.forwardCameraToOverlays(camera);
        return;
      }
      if (++attempts > 120) return;
      this.initialAltitudeRafId = requestAnimationFrame(tick);
    };
    this.initialAltitudeRafId = requestAnimationFrame(tick);
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
    const onSingleTap = (event: mapkit.EventBase<mapkit.Map>) => this.handleSingleTap(event);
    const onLongPress = (event: mapkit.EventBase<mapkit.Map>) => {
      const point = this.pointFromEvent(event);
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

  private handleSingleTap(event: mapkit.EventBase<mapkit.Map>): void {
    const point = this.pointFromEvent(event);
    if (!point) return;

    if (this.handleCircleClick(point)) return;
    if (this.handlePolygonClick(point)) return;
    if (this.handlePolylineClick(point)) return;
    if (this.handleGroundImageClick(point)) return;

    // Tiled markers are drawn into a raster overlay (no annotation to receive a
    // select event), so hit-test them here — mirrors the Leaflet/Azure controllers.
    const camera = this.getCameraPosition();
    const tiled = this.markerController.findTiled(point, camera?.zoom ?? 0);
    if (tiled?.state.clickable) {
      this.markerController.dispatchClick(tiled.state);
      return;
    }

    this.notifyMapClick(point);
  }

  private pointFromEvent(event: mapkit.EventBase<mapkit.Map>): GeoPoint | null {
    // Interaction events carry `pointOnPage` (page coordinates) at runtime,
    // though the typed signature only exposes `type`/`target`.
    const pointOnPage = (event as unknown as { pointOnPage?: DOMPoint }).pointOnPage;
    if (!pointOnPage) return null;
    const coordinate = this.map.convertPointOnPageToCoordinate(pointOnPage);
    if (!coordinate) return null;
    return createGeoPoint({ latitude: coordinate.latitude, longitude: coordinate.longitude });
  }

  private handleCircleClick(clicked: GeoPoint): boolean {
    const entity = this.circleController.find(clicked);
    if (!entity) return false;
    const circleEvent: CircleEvent = { state: entity.state, clicked };
    this.circleController.dispatchClick(circleEvent);
    return true;
  }

  private handlePolygonClick(clicked: GeoPoint): boolean {
    const entity = this.polygonController.find(clicked);
    if (!entity) return false;
    const polygonEvent: PolygonEvent = { state: entity.state, clicked };
    this.polygonController.dispatchClick(polygonEvent);
    return true;
  }

  private handlePolylineClick(clicked: GeoPoint): boolean {
    const hit = this.polylineController.findWithClosestPoint(clicked);
    if (!hit) return false;
    const polylineEvent: PolylineEvent = { state: hit.entity.state, clicked: hit.closestPoint };
    this.polylineController.dispatchClick(polylineEvent);
    return true;
  }

  private handleGroundImageClick(clicked: GeoPoint): boolean {
    const entity = this.groundImageController.find(clicked);
    if (!entity) return false;
    const groundImageEvent: GroundImageEvent = { state: entity.state, clicked };
    this.groundImageController.dispatchClick(groundImageEvent);
    return true;
  }

  // --- Camera ---

  moveCamera(position: MapCameraPosition): Promise<boolean> {
    return this.commitCamera(position, { animated: false });
  }

  animateCamera(position: MapCameraPosition, options?: CameraOptions): Promise<boolean> {
    return this.commitCamera(position, { animated: true, duration: options?.duration });
  }

  /**
   * Shared camera commit. `snapZoom` defaults to true so explicit camera targets
   * quantize their zoom to match the Google Maps 2D reference; fitBounds passes
   * false to keep its fractional fit zoom so `padding` is honored.
   */
  private commitCamera(
    position: MapCameraPosition,
    { animated, duration, snapZoom = true }: { animated: boolean; duration?: number; snapZoom?: boolean },
  ): Promise<boolean> {
    this.logicalTiltHint = position.tilt;
    this.lastCameraTarget = position;
    // Before the map has laid out we can't derive the region from the viewport;
    // approximate with the constant converter. The initial-altitude correction
    // re-applies this exactly once the map has a size.
    const fallbackZoom = snapZoom ? snapZoomToGoogle(position.zoom) : position.zoom;
    const region = this.regionForCamera(position, snapZoom);

    if (!animated) {
      if (region) {
        this.map.region = region;
      } else {
        this.map.center = new mapkit.Coordinate(position.position.latitude, position.position.longitude);
        this.map.cameraDistance = this.converter.zoomLevelToAltitude({ zoomLevel: fallbackZoom, latitude: position.position.latitude, tilt: 0 });
      }
      this.setRotation(position.bearing);
      return Promise.resolve(true);
    }

    this.initialAltitudeCorrected = true;
    if (region) {
      // A single setRegionAnimated moves the center AND zoom together. Calling
      // separate setCenterAnimated/setCameraDistanceAnimated setters back-to-back
      // makes each new animation cancel the previous one, so the map barely moves.
      this.map.setRegionAnimated(region, true);
    } else {
      this.map.setCenterAnimated(new mapkit.Coordinate(position.position.latitude, position.position.longitude), true);
      this.map.setCameraDistanceAnimated(this.converter.zoomLevelToAltitude({ zoomLevel: fallbackZoom, latitude: position.position.latitude, tilt: 0 }), true);
    }
    // Only touch rotation when it actually changes, so it doesn't cancel the
    // region animation above. Fly-to keeps bearing at 0, so this is usually a no-op.
    if (Math.abs(normalizeAngleDelta(position.bearing - this.map.rotation)) > 0.01) {
      this.map.setRotationAnimated(position.bearing, true);
    }
    return new Promise((resolve) => setTimeout(() => resolve(true), duration ?? 500));
  }

  private setRotation(bearing: number): void {
    if (Math.abs(normalizeAngleDelta(bearing - this.map.rotation)) > 0.01) {
      this.map.rotation = bearing;
    }
  }

  // Unified fit: the core computes center + zoom; moveCamera keeps the current
  // rotation (MapKit's setRegionAnimated would reset heading to north-up).
  fitBounds(bounds: GeoRectBounds, options?: CameraOptions): Promise<boolean> {
    if (!bounds.southWest || !bounds.northEast) return Promise.resolve(false);
    const current = this.getCameraPosition();
    if (!current) return Promise.resolve(false);
    const el = this.holder.mapView;
    const fit = computeFitBoundsCameraPosition({
      bounds,
      viewportWidthPx: el.clientWidth,
      viewportHeightPx: el.clientHeight,
      padding: typeof options?.padding === 'number' ? options.padding : 0,
      bearing: current.bearing,
    });
    if (!fit) return Promise.resolve(false);
    const target = current.copy({ position: fit.center, zoom: fit.zoom });
    // snapZoom:false — keep the fractional fit zoom so `padding` is honored.
    return this.commitCamera(target, { animated: !!options?.duration, duration: options?.duration, snapZoom: false });
  }

  getCameraPosition(): MapCameraPosition | null {
    const center = this.map.center;
    if (!center) return null;
    // Prefer the zoom measured from the live projection: it inverts the exact
    // Web-Mercator formula Google Maps uses (metersPerPixel = C·cosLat / 2^zoom),
    // so the reported zoom matches Google's on any viewport. The constant
    // converter is only a fallback before the map has laid out.
    const measuredZoom = this.measureGoogleZoom();
    const zoom = measuredZoom ?? this.converter.altitudeToZoomLevel({
      altitude: this.map.cameraDistance,
      latitude: center.latitude,
      tilt: 0,
    });
    return createMapCameraPosition({
      position: createGeoPoint({ latitude: center.latitude, longitude: center.longitude }),
      zoom,
      bearing: this.map.rotation,
      tilt: this.logicalTiltHint ?? 0,
      visibleRegion: this.getVisibleRegion() ?? undefined,
    });
  }

  /**
   * Web-Mercator zoom currently shown, measured from the live projection so it
   * matches Google Maps' zoom exactly. Projects the viewport's left/right edges
   * to Web-Mercator meters (rotation-independent, since the projection is
   * conformal) and inverts `metersPerPixel = (circumference / 256) / 2^zoom`.
   * Returns null before the map is laid out.
   */
  private measureGoogleZoom(): number | null {
    const el = this.holder.mapView;
    const width = el.clientWidth;
    const height = el.clientHeight;
    if (width <= 0 || height <= 0) return null;

    const midY = height / 2;
    const left = this.holder.fromScreenOffsetSync({ x: 0, y: midY });
    const right = this.holder.fromScreenOffsetSync({ x: width, y: midY });
    if (!left || !right) return null;

    const a = toMercatorMeters(left.latitude, left.longitude);
    const b = toMercatorMeters(right.latitude, right.longitude);
    // Unwrap across the antimeridian: the horizontal span can never exceed half
    // the world, so fold a larger raw delta back into range.
    let dx = b.x - a.x;
    const worldMeters = Earth.CIRCUMFERENCE_METERS;
    if (dx > worldMeters / 2) dx -= worldMeters;
    else if (dx < -worldMeters / 2) dx += worldMeters;
    const mercatorMetersPerPixel = Math.hypot(dx, b.y - a.y) / width;
    if (!(mercatorMetersPerPixel > 0)) return null;

    const mercatorMetersPerPixelAtZoom0 = Earth.CIRCUMFERENCE_METERS / TILE_SIZE;
    const zoom = Math.log2(mercatorMetersPerPixelAtZoom0 / mercatorMetersPerPixel);
    return Number.isFinite(zoom) ? zoom : null;
  }

  /**
   * The `CoordinateRegion` whose span renders the given Google Web-Mercator zoom
   * on the current viewport. Derived from the same Web-Mercator definition Google
   * uses — at zoom z the world is `256·2^z` px wide over 360°, so the span across
   * the viewport is `(360 / (256·2^z)) · pixels` (scaled by cosLat north-south).
   * This makes MapKit's zoom match Google's exactly and lets a single
   * setRegionAnimated move both center and zoom. Returns null before layout.
   */
  private regionForCamera(position: MapCameraPosition, snapZoom = true): mapkit.CoordinateRegion | null {
    const el = this.holder.mapView;
    const width = el.clientWidth;
    const height = el.clientHeight;
    if (width <= 0 || height <= 0) return null;

    const latitude = position.position.latitude;
    // Google Maps 2D (the project-wide reference) snaps zoom to the nearest
    // integer (9.5 -> 10, 4.5 -> 5), while MapKit renders the true fractional
    // zoom, leaving the two maps up to half a level apart at fractional demo
    // targets. Quantize programmatic targets the way Google does. Live zoom
    // reported from gestures (measureGoogleZoom) stays fractional and faithful.
    // fitBounds passes snapZoom:false so its computed fractional zoom is kept —
    // rounding would break the fit and neutralize `padding`.
    const zoom = snapZoom ? snapZoomToGoogle(position.zoom) : position.zoom;
    const degreesPerPixel = 360 / (TILE_SIZE * Math.pow(2, zoom));
    const latitudeDelta = degreesPerPixel * cosLatitude(latitude) * height;
    const longitudeDelta = degreesPerPixel * width;
    if (!(latitudeDelta > 0) || !(longitudeDelta > 0)) return null;

    return new mapkit.CoordinateRegion(
      new mapkit.Coordinate(latitude, position.position.longitude),
      new mapkit.CoordinateSpan(latitudeDelta, longitudeDelta),
    );
  }

  getBounds(): GeoRectBounds | null {
    return this.getVisibleRegion()?.bounds ?? null;
  }

  private getVisibleRegion(): VisibleRegion | null {
    const el = this.holder.mapView;
    const width = el.clientWidth;
    const height = el.clientHeight;
    if (!width || !height) return null;

    const nearLeft = this.holder.fromScreenOffsetSync({ x: 0, y: height });
    const nearRight = this.holder.fromScreenOffsetSync({ x: width, y: height });
    const farLeft = this.holder.fromScreenOffsetSync({ x: 0, y: 0 });
    const farRight = this.holder.fromScreenOffsetSync({ x: width, y: 0 });
    if (!nearLeft || !nearRight || !farLeft || !farRight) return null;

    const bounds = createGeoRectBounds();
    bounds.extend(nearLeft);
    bounds.extend(nearRight);
    bounds.extend(farLeft);
    bounds.extend(farRight);

    return { bounds, nearLeft, nearRight, farLeft, farRight };
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
    if (this.initialAltitudeRafId != null) cancelAnimationFrame(this.initialAltitudeRafId);
    this.initialAltitudeRafId = null;
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

const TILE_SIZE = 256;
const MIN_COS_LAT = 0.01;
const MAX_MERCATOR_LATITUDE = 85.05112878;

function cosLatitude(latitude: number): number {
  const clamped = Math.max(-MAX_MERCATOR_LATITUDE, Math.min(MAX_MERCATOR_LATITUDE, latitude));
  return Math.max(MIN_COS_LAT, Math.cos((clamped * Math.PI) / 180));
}

/**
 * Quantize a programmatic zoom target to the nearest integer, mirroring how
 * Google Maps 2D (the project-wide camera reference) snaps zoom. Keeps MapKit
 * aligned with Google at fractional demo zooms (Oahu 9.5 -> 10, Kiribati
 * 4.5 -> 5) instead of rendering the true half level Google never shows.
 */
function snapZoomToGoogle(zoom: number): number {
  return Math.round(zoom);
}

/** Shortest signed difference between two angles (degrees), in [-180, 180]. */
function normalizeAngleDelta(delta: number): number {
  let d = delta % 360;
  if (d > 180) d -= 360;
  else if (d < -180) d += 360;
  return d;
}

function toMercatorMeters(latitude: number, longitude: number): { x: number; y: number } {
  const clampedLat = Math.max(-MAX_MERCATOR_LATITUDE, Math.min(MAX_MERCATOR_LATITUDE, latitude));
  const latRad = (clampedLat * Math.PI) / 180;
  return {
    x: Earth.RADIUS_METERS * (longitude * Math.PI) / 180,
    y: Earth.RADIUS_METERS * Math.log(Math.tan(Math.PI / 4 + latRad / 2)),
  };
}


