import {
  createGeoPoint,
  createGeoRectBounds,
  createMapCameraPosition,
  Earth,
  type MapCameraPosition,
  type VisibleRegion,
} from '@mapconductor/js-sdk-core';
import type { MapKitViewHolder } from './MapKitViewHolder';
import type { MapKitZoomAltitudeConverter } from './zoom/ZoomAltitudeConverter';

/**
 * カメラの読み書き。
 *
 * MapKit のカメラは「中心＋視点距離（メートル）」で、ズームレベルを持たない。
 * 論理ズーム（Google 基準）との往復は、可能なら**生きた投影から実測**し、
 * 地図がまだ採寸できない間だけ [MapKitZoomAltitudeConverter] の定数式で
 * 近似する。初回だけずれるので [scheduleInitialAltitudeCorrection] で
 * 採寸できた時点に撮り直す。
 *
 * tilt は MapKit が負を扱えないため、論理値を [logicalTiltHint] に別に覚える。
 */
export interface MapKitCameraDeps {
  readonly map: mapkit.Map;
  readonly holder: MapKitViewHolder;
  readonly converter: MapKitZoomAltitudeConverter;
  /** カメラが落ち着いたときに各オーバーレイへ配る。 */
  onCameraForward(camera: MapCameraPosition): void;
}

export class MapKitCameraState {
  private lastCameraTarget: MapCameraPosition | null = null;
  private initialAltitudeCorrected = false;
  private initialAltitudeRafId: number | null = null;

  constructor(
    private readonly deps: MapKitCameraDeps,
    private logicalTiltHint: number | null,
  ) {}

  dispose(): void {
    if (this.initialAltitudeRafId != null) cancelAnimationFrame(this.initialAltitudeRafId);
    this.initialAltitudeRafId = null;
  }

  /**
   * Shared camera commit. `snapZoom` defaults to true so explicit camera targets
   * quantize their zoom to match the Google Maps 2D reference; fitBounds passes
   * false to keep its fractional fit zoom so `padding` is honored.
   */
  commit(
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
        this.deps.map.region = region;
      } else {
        this.deps.map.center = new mapkit.Coordinate(position.position.latitude, position.position.longitude);
        this.deps.map.cameraDistance = this.deps.converter.zoomLevelToAltitude({ zoomLevel: fallbackZoom, latitude: position.position.latitude, tilt: 0 });
      }
      this.setRotation(position.bearing);
      return Promise.resolve(true);
    }

    this.initialAltitudeCorrected = true;
    if (region) {
      // A single setRegionAnimated moves the center AND zoom together. Calling
      // separate setCenterAnimated/setCameraDistanceAnimated setters back-to-back
      // makes each new animation cancel the previous one, so the map barely moves.
      this.deps.map.setRegionAnimated(region, true);
    } else {
      this.deps.map.setCenterAnimated(new mapkit.Coordinate(position.position.latitude, position.position.longitude), true);
      this.deps.map.setCameraDistanceAnimated(this.deps.converter.zoomLevelToAltitude({ zoomLevel: fallbackZoom, latitude: position.position.latitude, tilt: 0 }), true);
    }
    // Only touch rotation when it actually changes, so it doesn't cancel the
    // region animation above. Fly-to keeps bearing at 0, so this is usually a no-op.
    if (Math.abs(normalizeAngleDelta(position.bearing - this.deps.map.rotation)) > 0.01) {
      this.deps.map.setRotationAnimated(position.bearing, true);
    }
    return new Promise((resolve) => setTimeout(() => resolve(true), duration ?? 500));
  }

  private setRotation(bearing: number): void {
    if (Math.abs(normalizeAngleDelta(bearing - this.deps.map.rotation)) > 0.01) {
      this.deps.map.rotation = bearing;
    }
  }

  read(): MapCameraPosition | null {
    const center = this.deps.map.center;
    if (!center) return null;
    // Prefer the zoom measured from the live projection: it inverts the exact
    // Web-Mercator formula Google Maps uses (metersPerPixel = C·cosLat / 2^zoom),
    // so the reported zoom matches Google's on any viewport. The constant
    // converter is only a fallback before the map has laid out.
    const measuredZoom = this.measureGoogleZoom();
    const zoom = measuredZoom ?? this.deps.converter.altitudeToZoomLevel({
      altitude: this.deps.map.cameraDistance,
      latitude: center.latitude,
      tilt: 0,
    });
    return createMapCameraPosition({
      position: createGeoPoint({ latitude: center.latitude, longitude: center.longitude }),
      zoom,
      bearing: this.deps.map.rotation,
      tilt: this.logicalTiltHint ?? 0,
      visibleRegion: this.readVisibleRegion() ?? undefined,
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
    const el = this.deps.holder.mapView;
    const width = el.clientWidth;
    const height = el.clientHeight;
    if (width <= 0 || height <= 0) return null;

    const midY = height / 2;
    const left = this.deps.holder.fromScreenOffsetSync({ x: 0, y: midY });
    const right = this.deps.holder.fromScreenOffsetSync({ x: width, y: midY });
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
  regionForCamera(position: MapCameraPosition, snapZoom = true): mapkit.CoordinateRegion | null {
    const el = this.deps.holder.mapView;
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

  readVisibleRegion(): VisibleRegion | null {
    const el = this.deps.holder.mapView;
    const width = el.clientWidth;
    const height = el.clientHeight;
    if (!width || !height) return null;

    const nearLeft = this.deps.holder.fromScreenOffsetSync({ x: 0, y: height });
    const nearRight = this.deps.holder.fromScreenOffsetSync({ x: width, y: height });
    const farLeft = this.deps.holder.fromScreenOffsetSync({ x: 0, y: 0 });
    const farRight = this.deps.holder.fromScreenOffsetSync({ x: width, y: 0 });
    if (!nearLeft || !nearRight || !farLeft || !farRight) return null;

    const bounds = createGeoRectBounds();
    bounds.extend(nearLeft);
    bounds.extend(nearRight);
    bounds.extend(farLeft);
    bounds.extend(farRight);

    return { bounds, nearLeft, nearRight, farLeft, farRight };
  }

  // The very first moveCamera() runs before the map has laid out, so its camera
  // distance comes from the constant converter (approximate). Once the map has a
  // size, re-derive the distance from the live projection so the initial zoom
  // matches Google Maps exactly, without waiting for a user gesture.
  scheduleInitialAltitudeCorrection(): void {
    let attempts = 0;
    const tick = () => {
      this.initialAltitudeRafId = null;
      if (this.initialAltitudeCorrected) return;
      if (this.lastCameraTarget && this.measureGoogleZoom() != null) {
        this.initialAltitudeCorrected = true;
        void this.commit(this.lastCameraTarget, { animated: false });
        // Seed the overlay controllers with the settled camera so click
        // hit-testing works before the user moves the map.
        const camera = this.read();
        if (camera) this.deps.onCameraForward(camera);
        return;
      }
      if (++attempts > 120) return;
      this.initialAltitudeRafId = requestAnimationFrame(tick);
    };
    this.initialAltitudeRafId = requestAnimationFrame(tick);
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
