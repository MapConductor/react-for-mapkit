import {
  createGeoPoint,
  createMapCameraPosition,
  type MapCameraPosition,
  type VisibleRegion,
} from '@mapconductor/js-sdk-core';
import { MapKitZoomAltitudeConverter } from './zoom/ZoomAltitudeConverter';

/**
 * Web port of `MapCameraPositionExtensions.swift`.
 *
 * On iOS these are `MapCameraPosition.toMKMapCamera(on:)` and
 * `MKMapView.toMapCameraPosition(...)`. MapKit JS is a 2D map: the camera is a
 * center coordinate + a `cameraDistance` (meters) + a `rotation` (degrees).
 * Tilt has no native representation, so the logical tilt is carried through
 * unchanged for round-trip fidelity but does not affect the map.
 */
export interface MapKitCameraParams {
  center: mapkit.Coordinate;
  cameraDistance: number;
  rotation: number;
}

/** MapCameraPosition -> MapKit JS camera parameters. */
export function toMapKitCameraParams(
  pos: MapCameraPosition,
  converter: MapKitZoomAltitudeConverter,
): MapKitCameraParams {
  const cameraDistance = converter.zoomLevelToAltitude({
    zoomLevel: pos.zoom,
    latitude: pos.position.latitude,
    tilt: 0,
  });
  return {
    center: new mapkit.Coordinate(pos.position.latitude, pos.position.longitude),
    cameraDistance,
    rotation: pos.bearing,
  };
}

/** MapKit JS camera state -> MapCameraPosition. */
export function toMapCameraPosition({
  center,
  cameraDistance,
  rotation,
  converter,
  visibleRegion = null,
  logicalTiltHint = null,
}: {
  center: mapkit.Coordinate;
  cameraDistance: number;
  rotation: number;
  converter: MapKitZoomAltitudeConverter;
  visibleRegion?: VisibleRegion | null;
  logicalTiltHint?: number | null;
}): MapCameraPosition {
  const zoom = converter.altitudeToZoomLevel({
    altitude: cameraDistance,
    latitude: center.latitude,
    tilt: 0,
  });
  return createMapCameraPosition({
    position: createGeoPoint({ latitude: center.latitude, longitude: center.longitude }),
    zoom,
    bearing: rotation,
    tilt: logicalTiltHint ?? 0,
    visibleRegion: visibleRegion ?? undefined,
  });
}
