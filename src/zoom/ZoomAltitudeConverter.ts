import { WebMercatorZoomAltitudeConverter } from '@mapconductor/js-sdk-core';

/**
 * 統一ズーム（Google Maps 基準・256px タイル）⇄ 高度の変換。
 *
 * MapKit JS はカメラを `cameraDistance`（地図中心の上空にあるカメラの高さ、メートル）で
 * 表す。ネイティブの `MKMapCamera.fromDistance` と同じ関係でズームと結び付ける。
 * オフセットは 0。換算式はコアの {@link WebMercatorZoomAltitudeConverter} にある。
 */
export class MapKitZoomAltitudeConverter extends WebMercatorZoomAltitudeConverter {
    /** Matches the native `MapKitZoomAltitudeConverter` default. */
    static readonly MAPKIT_OPTIMIZED_ZOOM0_ALTITUDE = 171_319_879.0;

    constructor(zoom0Altitude = MapKitZoomAltitudeConverter.MAPKIT_OPTIMIZED_ZOOM0_ALTITUDE) {
        super(zoom0Altitude, 0.0);
    }
}
