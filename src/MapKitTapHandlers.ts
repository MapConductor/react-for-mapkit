import { createGeoPoint } from '@mapconductor/js-sdk-core';
import type {
  CircleEvent,
  GeoPoint,
  GroundImageEvent,
  MapCameraPosition,
  PolygonEvent,
  PolylineEvent,
} from '@mapconductor/js-sdk-core';
import type { MapKitMarkerController } from './marker/MapKitMarkerController';
import type { MapKitCircleController } from './circle/MapKitCircleController';
import type { MapKitPolylineController } from './polyline/MapKitPolylineController';
import type { MapKitPolygonController } from './polygon/MapKitPolygonController';
import type { MapKitGroundImageController } from './groundimage/MapKitGroundImageController';

/**
 * 地図のタップ配送。
 *
 * MapKit のオーバーレイはタップイベントを返さないので、タップ座標から
 * コア側のマネージャに当たり判定を問い合わせる。順序は**マーカーが先**で、
 * circle → polygon → polyline → groundImage、どれにも当たらなかったときだけ
 * `onMapClick` を呼ぶ（android と同じ順序）。
 */
export interface TapDeps {
  readonly map: mapkit.Map;
  readonly markerController: MapKitMarkerController;
  readonly circleController: MapKitCircleController;
  readonly polylineController: MapKitPolylineController;
  readonly polygonController: MapKitPolygonController;
  readonly groundImageController: MapKitGroundImageController;
  getCameraPosition(): MapCameraPosition | null;
  onMapClick(point: GeoPoint): void;
}

export function handleSingleTap(deps: TapDeps, event: mapkit.EventBase<mapkit.Map>): void {
  const point = pointFromEvent(deps, event);
  if (!point) return;

  if (handleCircleClick(deps, point)) return;
  if (handlePolygonClick(deps, point)) return;
  if (handlePolylineClick(deps, point)) return;
  if (handleGroundImageClick(deps, point)) return;

  // Tiled markers are drawn into a raster overlay (no annotation to receive a
  // select event), so hit-test them here — mirrors the Leaflet/Azure controllers.
  const camera = deps.getCameraPosition();
  const tiled = deps.markerController.findTiled(point, camera?.zoom ?? 0);
  if (tiled?.state.clickable) {
    deps.markerController.dispatchClick(tiled.state);
    return;
  }

  deps.onMapClick(point);
}

export function pointFromEvent(deps: TapDeps, event: mapkit.EventBase<mapkit.Map>): GeoPoint | null {
  // Interaction events carry `pointOnPage` (page coordinates) at runtime,
  // though the typed signature only exposes `type`/`target`.
  const pointOnPage = (event as unknown as { pointOnPage?: DOMPoint }).pointOnPage;
  if (!pointOnPage) return null;
  const coordinate = deps.map.convertPointOnPageToCoordinate(pointOnPage);
  if (!coordinate) return null;
  return createGeoPoint({ latitude: coordinate.latitude, longitude: coordinate.longitude });
}

export function handleCircleClick(deps: TapDeps, clicked: GeoPoint): boolean {
  const entity = deps.circleController.find(clicked);
  if (!entity) return false;
  const circleEvent: CircleEvent = { state: entity.state, clicked };
  deps.circleController.dispatchClick(circleEvent);
  return true;
}

export function handlePolygonClick(deps: TapDeps, clicked: GeoPoint): boolean {
  const entity = deps.polygonController.find(clicked);
  if (!entity) return false;
  const polygonEvent: PolygonEvent = { state: entity.state, clicked };
  deps.polygonController.dispatchClick(polygonEvent);
  return true;
}

export function handlePolylineClick(deps: TapDeps, clicked: GeoPoint): boolean {
  const hit = deps.polylineController.findWithClosestPoint(clicked);
  if (!hit) return false;
  const polylineEvent: PolylineEvent = { state: hit.entity.state, clicked: hit.closestPoint };
  deps.polylineController.dispatchClick(polylineEvent);
  return true;
}

export function handleGroundImageClick(deps: TapDeps, clicked: GeoPoint): boolean {
  const entity = deps.groundImageController.find(clicked);
  if (!entity) return false;
  const groundImageEvent: GroundImageEvent = { state: entity.state, clicked };
  deps.groundImageController.dispatchClick(groundImageEvent);
  return true;
}
