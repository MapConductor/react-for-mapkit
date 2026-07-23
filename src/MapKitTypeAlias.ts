// Web (MapKit JS) equivalents of the native iOS type aliases in
// `MapKitTypeAlias.swift`. On iOS these are MKPointAnnotation / MKPolyline /
// MKCircle / MKPolygon; on the web the matching MapKit JS overlay/annotation
// classes fill the same roles.
export type MapKitActualMap = mapkit.Map;
export type MapKitActualMarker = mapkit.ImageAnnotation;
export type MapKitActualPolyline = mapkit.PolylineOverlay;
export type MapKitActualCircle = mapkit.CircleOverlay;
export type MapKitActualPolygon = mapkit.PolygonOverlay;
export type MapKitActualRasterLayer = mapkit.TileOverlay;
