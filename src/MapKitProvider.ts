import {
  MapProvider,
  MarkerTilingOptions,
  type GeoRectBounds,
  type MapConfig,
  type MapViewControllerInterface,
} from '@mapconductor/js-sdk-core';
import { loadMapKit } from './LibraryLoader';
import { MapKitViewController } from './MapKitViewController';
import { MapKitViewHolder } from './MapKitViewHolder';
import { MapKitZoomAltitudeConverter } from './zoom/ZoomAltitudeConverter';
import { MapKitMapDesign, type MapKitMapDesignTypeInterface } from './MapKitMapDesign';
import { MapKitMarkerController } from './marker/MapKitMarkerController';
import { MapKitMarkerRenderer } from './marker/MapKitMarkerRenderer';
import { MapKitCircleController } from './circle/MapKitCircleController';
import { MapKitCircleOverlayRenderer } from './circle/MapKitCircleOverlayRenderer';
import { MapKitPolylineController } from './polyline/MapKitPolylineController';
import { MapKitPolylineOverlayRenderer } from './polyline/MapKitPolylineOverlayRenderer';
import { MapKitPolygonController } from './polygon/MapKitPolygonController';
import { MapKitPolygonOverlayRenderer } from './polygon/MapKitPolygonOverlayRenderer';
import { MapKitGroundImageController } from './groundimage/MapKitGroundImageController';
import { MapKitGroundImageOverlayRenderer } from './groundimage/MapKitGroundImageOverlayRenderer';
import { MapKitRasterLayerController } from './raster/MapKitRasterLayerController';
import { MapKitRasterLayerOverlayRenderer } from './raster/MapKitRasterLayerOverlayRenderer';

export interface MapKitConfig extends MapConfig {
  /** A static MapKit JS authorization token (JWT). */
  token?: string;
  /** A callback that supplies (and can refresh) the authorization token. */
  authorizationCallback?: (done: (token: string) => void) => void;
  language?: string;
  mapDesignType?: MapKitMapDesignTypeInterface;
  markerTilingOptions?: MarkerTilingOptions;
  minZoom?: number;
  maxZoom?: number;
  /** Restricts panning so the camera center cannot leave this rectangle. */
  restrictBounds?: GeoRectBounds;
}

/**
 * Apple MapKit provider implementation. Loads MapKit JS, creates a
 * `mapkit.Map`, wires up the per-feature controllers, and returns a
 * {@link MapKitViewController}.
 */
export class MapKitProvider extends MapProvider {
  private map: mapkit.Map | null = null;

  async initialize(config: MapKitConfig): Promise<MapViewControllerInterface> {
    if (this.controller) {
      return this.controller;
    }

    const container =
      typeof config.container === 'string'
        ? document.getElementById(config.container)
        : config.container;

    if (!container) {
      throw new Error('Container element not found');
    }

    await loadMapKit({
      token: config.token ?? config.apiKey,
      authorizationCallback: config.authorizationCallback,
      language: config.language,
    });

    // React StrictMode can start a second initialize() call while the first one
    // is waiting for the MapKit script. Re-check after the await so both calls
    // share the first map/controller instead of appending two maps to the same
    // container and leaving the visible one disconnected from the view state.
    if (this.controller) {
      return this.controller;
    }

    const design = config.mapDesignType ?? MapKitMapDesign.Standard;
    const converter = new MapKitZoomAltitudeConverter();
    const initialCamera = config.initCameraPosition;
    const latitude = initialCamera.position.latitude;

    const map = new mapkit.Map(container, {
      mapType: MapKitMapDesign.toMapType(design),
      isRotationEnabled: true,
      center: new mapkit.Coordinate(latitude, initialCamera.position.longitude),
      rotation: initialCamera.bearing,
    });
    this.map = map;

    map.cameraDistance = converter.zoomLevelToAltitude({ zoomLevel: initialCamera.zoom, latitude, tilt: 0 });

    if (config.minZoom != null || config.maxZoom != null) {
      // Lower zoom = farther camera; higher zoom = closer camera.
      const maxCameraDistance = config.minZoom != null
        ? converter.zoomLevelToAltitude({ zoomLevel: config.minZoom, latitude, tilt: 0 })
        : undefined;
      const minCameraDistance = config.maxZoom != null
        ? converter.zoomLevelToAltitude({ zoomLevel: config.maxZoom, latitude, tilt: 0 })
        : 0;
      map.cameraZoomRange = new mapkit.CameraZoomRange(minCameraDistance ?? 0, maxCameraDistance);
    }

    const restrict = config.restrictBounds;
    if (restrict?.southWest && restrict.northEast) {
      const centerLat = (restrict.southWest.latitude + restrict.northEast.latitude) / 2;
      const centerLng = (restrict.southWest.longitude + restrict.northEast.longitude) / 2;
      const latDelta = Math.max(Math.abs(restrict.northEast.latitude - restrict.southWest.latitude), 1e-3);
      const lngDelta = Math.max(Math.abs(restrict.northEast.longitude - restrict.southWest.longitude), 1e-3);
      map.setCameraBoundaryAnimated(
        new mapkit.CoordinateRegion(
          new mapkit.Coordinate(centerLat, centerLng),
          new mapkit.CoordinateSpan(latDelta, lngDelta),
        ),
        false,
      );
    }

    Object.assign(container.style, { width: '100%', height: '100%', display: 'block' });

    const holder = new MapKitViewHolder(container, map);
    const tilingOptions = config.markerTilingOptions ?? MarkerTilingOptions.Default;

    const markerController = new MapKitMarkerController(new MapKitMarkerRenderer(holder), tilingOptions);
    const circleController = new MapKitCircleController(new MapKitCircleOverlayRenderer(holder));
    const polylineController = new MapKitPolylineController(new MapKitPolylineOverlayRenderer(holder));
    const polygonController = new MapKitPolygonController(new MapKitPolygonOverlayRenderer(holder));
    const groundImageController = new MapKitGroundImageController(new MapKitGroundImageOverlayRenderer(holder));
    const rasterLayerController = new MapKitRasterLayerController(new MapKitRasterLayerOverlayRenderer(holder));

    this.controller = new MapKitViewController(
      holder,
      converter,
      markerController,
      circleController,
      polylineController,
      polygonController,
      groundImageController,
      rasterLayerController,
      design,
      initialCamera.tilt ?? null,
    );
    return this.controller;
  }

  destroy(): void {
    if (this.controller) {
      this.controller.destroy();
      this.controller = null;
    } else if (this.map) {
      this.map.destroy();
    }
    this.map = null;
  }
}
