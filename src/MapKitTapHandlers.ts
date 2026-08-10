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

  /**
   * タップの配送。コアの `BaseMapViewController.dispatchTap` を呼ぶ。
   * marker → circle → groundImage → polyline → polygon → map を 1 つだけ配送する。
   */
  dispatchTap(point: GeoPoint): boolean;
}

export function handleSingleTap(deps: TapDeps, event: mapkit.EventBase<mapkit.Map>): void {
  const point = pointFromEvent(deps, event);
  if (!point) return;

  // marker → circle → groundImage → polyline → polygon → map の一本道。
  // 順序と先勝ちはコアの BaseMapViewController.dispatchTap が持つ。
  // 移行前はここで circle → polygon → polyline → groundImage → marker の独自順だった
  // （**マーカーが最後**で、他プロバイダと逆になっていた）。
  deps.dispatchTap(point);
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
