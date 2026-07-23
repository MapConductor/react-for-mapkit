import { AbstractZoomAltitudeConverter } from '@mapconductor/js-sdk-core';

/**
 * Web port of `MapKitZoomAltitudeConverter` (ZoomAltitudeConverter.swift).
 *
 * MapKit JS exposes the camera as a `cameraDistance` in meters (the altitude of
 * the camera above the map center). This converter maps a Google-like
 * Web-Mercator zoom level to that camera distance and back, exactly like the
 * native converter does for `MKMapCamera.fromDistance`.
 */
export class MapKitZoomAltitudeConverter extends AbstractZoomAltitudeConverter {
  /** Matches the native `MapKitZoomAltitudeConverter` default. */
  static readonly MAPKIT_OPTIMIZED_ZOOM0_ALTITUDE = 171_319_879.0;

  constructor(zoom0Altitude = MapKitZoomAltitudeConverter.MAPKIT_OPTIMIZED_ZOOM0_ALTITUDE) {
    super(zoom0Altitude);
  }

  private cosLatitudeFactor(latitude: number): number {
    const clamped = Math.max(-85, Math.min(85, latitude));
    const latRad = (clamped * Math.PI) / 180;
    return Math.max(AbstractZoomAltitudeConverter.MIN_COS_LAT, Math.abs(Math.cos(latRad)));
  }

  private cosTiltFactor(tilt: number): number {
    const clamped = Math.max(0, Math.min(90, tilt));
    const tiltRad = (clamped * Math.PI) / 180;
    return Math.max(AbstractZoomAltitudeConverter.MIN_COS_TILT, Math.cos(tiltRad));
  }

  zoomLevelToAltitude({
    zoomLevel,
    latitude,
    tilt,
  }: {
    zoomLevel: number;
    latitude: number;
    tilt: number;
  }): number {
    const clampedZoom = Math.min(
      Math.max(zoomLevel, AbstractZoomAltitudeConverter.MIN_ZOOM_LEVEL),
      AbstractZoomAltitudeConverter.MAX_ZOOM_LEVEL,
    );
    const cosLat = this.cosLatitudeFactor(latitude);
    const cosTilt = this.cosTiltFactor(tilt);
    const distance = (this.zoom0Altitude * cosLat) / Math.pow(AbstractZoomAltitudeConverter.ZOOM_FACTOR, clampedZoom);
    const altitude = distance * cosTilt;
    return Math.min(Math.max(altitude, AbstractZoomAltitudeConverter.MIN_ALTITUDE), AbstractZoomAltitudeConverter.MAX_ALTITUDE);
  }

  altitudeToZoomLevel({
    altitude,
    latitude,
    tilt,
  }: {
    altitude: number;
    latitude: number;
    tilt: number;
  }): number {
    const clampedAltitude = Math.min(
      Math.max(altitude, AbstractZoomAltitudeConverter.MIN_ALTITUDE),
      AbstractZoomAltitudeConverter.MAX_ALTITUDE,
    );
    const cosLat = this.cosLatitudeFactor(latitude);
    const cosTilt = this.cosTiltFactor(tilt);
    const distance = clampedAltitude / cosTilt;
    const zoomLevel = Math.log2((this.zoom0Altitude * cosLat) / distance);
    return Math.min(Math.max(zoomLevel, AbstractZoomAltitudeConverter.MIN_ZOOM_LEVEL), AbstractZoomAltitudeConverter.MAX_ZOOM_LEVEL);
  }
}
