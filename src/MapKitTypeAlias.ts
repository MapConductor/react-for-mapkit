// Web (MapKit JS) equivalents of the native iOS type aliases in
// `MapKitTypeAlias.swift`. On iOS these are MKPointAnnotation / MKPolyline /
// MKCircle / MKPolygon; on the web the matching MapKit JS overlay/annotation
// classes fill the same roles.
export type MapKitActualMap = mapkit.Map;
export type MapKitActualMarker = mapkit.ImageAnnotation;
export type MapKitActualPolyline = mapkit.PolylineOverlay;
// Circles are rendered as a core-geometry polygon ring (circleToRing), not
// mapkit.CircleOverlay, so the circle shape definition (geodesic vs planar)
// is unified across providers.
export type MapKitActualCircle = mapkit.PolygonOverlay;
export type MapKitActualPolygon = mapkit.PolygonOverlay;
export type MapKitActualRasterLayer = mapkit.TileOverlay;
