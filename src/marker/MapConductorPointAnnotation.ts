import type { BitmapIcon, MarkerState } from '@mapconductor/js-sdk-core';
import { toCoordinate } from '../helpers';
import type { MapKitActualMarker } from '../MapKitTypeAlias';

/**
 * Web port of `MapConductorPointAnnotation` (marker/MapConductorPointAnnotation.swift).
 *
 * On iOS this is an `MKPointAnnotation` subclass carrying the marker id, state
 * and initial bitmap icon. MapKit JS's `ImageAnnotation` is not subclassable in
 * the same way, so the same three fields are attached through the annotation's
 * `data` property and the annotation is created via {@link createMapConductorPointAnnotation}.
 */
export interface MapConductorPointAnnotationData {
  markerId: string;
  markerState: MarkerState;
  initialBitmapIcon: BitmapIcon;
}

export function createMapConductorPointAnnotation(
  markerState: MarkerState,
  bitmapIcon: BitmapIcon,
): MapKitActualMarker {
  const width = bitmapIcon.size.width;
  const height = bitmapIcon.size.height;

  // MapKit anchors an image annotation at its bottom-center by default; shift it
  // so the bitmap's own (anchor.x, anchor.y) fraction sits on the coordinate.
  const anchorOffset = new DOMPoint((0.5 - bitmapIcon.anchor.x) * width, (1 - bitmapIcon.anchor.y) * height);

  const data: MapConductorPointAnnotationData = {
    markerId: markerState.id,
    markerState,
    initialBitmapIcon: bitmapIcon,
  };

  return new mapkit.ImageAnnotation(toCoordinate(markerState.position), {
    url: { 1: bitmapIcon.url },
    size: { width, height },
    anchorOffset,
    draggable: markerState.draggable,
    calloutEnabled: false,
    data,
  });
}
