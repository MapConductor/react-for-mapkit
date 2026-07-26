import { createGeoPoint, type GeoPoint, type GeoPointInterface } from '@mapconductor/js-sdk-core';

/** A CSS color split into an opaque color string and a separate opacity, the
 * shape MapKit JS's `Style` (fillColor + fillOpacity / strokeColor +
 * strokeOpacity) expects. */
export interface MapKitStyleColor {
  color: string;
  opacity: number;
}

const RGBA_RE = /^rgba?\(\s*([+-]?\d*\.?\d+%?)\s*,\s*([+-]?\d*\.?\d+%?)\s*,\s*([+-]?\d*\.?\d+%?)\s*(?:,\s*([+-]?\d*\.?\d+%?)\s*)?\)$/i;
const HEX_RGBA_RE = /^#([0-9a-f]{8})$/i;
const HEX_RGB_RE = /^#([0-9a-f]{6})$/i;

function clampOpacity(value: number): number {
  if (Number.isNaN(value)) return 1;
  return Math.min(1, Math.max(0, value));
}

function alphaToOpacity(value: string | undefined): number {
  if (value == null) return 1;
  if (value.endsWith('%')) return clampOpacity(parseFloat(value) / 100);
  return clampOpacity(parseFloat(value));
}

/** Convert a MapConductor CSS color (hex, #rrggbbaa, rgb(a)) to a MapKit JS
 * color + opacity pair. Mirrors the color handling other web providers do for
 * their native style objects. */
export function toMapKitStyleColor(cssColor: string | undefined, fallback = '#000000'): MapKitStyleColor {
  const input = (cssColor ?? fallback).trim();
  if (input.toLowerCase() === 'transparent') {
    return { color: '#000000', opacity: 0 };
  }

  const hexRgba = HEX_RGBA_RE.exec(input);
  if (hexRgba) {
    const value = hexRgba[1];
    const alpha = parseInt(value.slice(6, 8), 16) / 255;
    return { color: `#${value.slice(0, 6)}`, opacity: clampOpacity(alpha) };
  }

  const hexRgb = HEX_RGB_RE.exec(input);
  if (hexRgb) {
    return { color: `#${hexRgb[1]}`, opacity: 1 };
  }

  const rgba = RGBA_RE.exec(input);
  if (rgba) {
    const r = Math.round(parseFloat(rgba[1]));
    const g = Math.round(parseFloat(rgba[2]));
    const b = Math.round(parseFloat(rgba[3]));
    return { color: `rgb(${r}, ${g}, ${b})`, opacity: alphaToOpacity(rgba[4]) };
  }

  // Named colors and any other CSS-valid string pass through untouched.
  return { color: input, opacity: 1 };
}

export function toCoordinate(point: GeoPointInterface): mapkit.Coordinate {
  return new mapkit.Coordinate(point.latitude, point.longitude);
}

export function toCoordinates(points: readonly GeoPointInterface[]): mapkit.Coordinate[] {
  return points.map(toCoordinate);
}

function normalizeLongitude(longitude: number): number {
  return ((((longitude + 180) % 360) + 360) % 360) - 180;
}

/**
 * Convert points to MapKit coordinates while keeping longitudes continuous
 * across the antimeridian. Geographic interpolation normalizes longitude to
 * [-180, 180], but MapKit accepts unwrapped longitudes, so each vertex is
 * shifted into the same world copy as its predecessor (…, +180, +190, … or …,
 * -180, -190, …). Without this a segment crossing the date line is drawn the
 * long way around the whole map. Mirrors the Leaflet/OpenLayers vector renderers.
 */
export function toUnwrappedCoordinates(points: readonly GeoPointInterface[]): mapkit.Coordinate[] {
  let previousLongitude: number | null = null;
  return points.map(point => {
    let longitude = normalizeLongitude(point.longitude);
    if (previousLongitude != null) {
      while (longitude - previousLongitude > 180) longitude -= 360;
      while (longitude - previousLongitude < -180) longitude += 360;
    }
    previousLongitude = longitude;
    return new mapkit.Coordinate(point.latitude, longitude);
  });
}

export function toGeoPoint(coordinate: mapkit.Coordinate): GeoPoint {
  return createGeoPoint({ latitude: coordinate.latitude, longitude: coordinate.longitude });
}
