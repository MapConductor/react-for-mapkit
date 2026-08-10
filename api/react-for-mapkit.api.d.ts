import { MapDesignTypeInterface, AttributionRule, MapConfig, MarkerTilingOptions, GeoRectBounds, MapProvider, MapViewControllerInterface, MapViewHolderBase, GeoPointInterface, Offset, GeoPoint, WebMercatorZoomAltitudeConverter, AbstractMarkerOverlayRenderer, MarkerEntity, BitmapIcon, AddParams, ChangeParams, AbstractMarkerController, RasterLayerState, MarkerState, CircleOverlayRenderer, CircleEntity, CircleAddParams, CircleChangeParams, CircleController, PolylineOverlayRenderer, PolylineEntity, PolylineAddParams, PolylineChangeParams, PolylineController, PolygonOverlayRenderer, PolygonEntity, PolygonAddParams, PolygonChangeParams, PolygonController, GroundImageState, GroundImageOverlayRenderer, GroundImageEntity, GroundImageAddParams, GroundImageChangeParams, GroundImageController, RasterLayerOverlayRenderer, RasterLayerEntity, RasterLayerAddParams, RasterLayerChangeParams, MapCameraPosition, RasterLayerController, RasterHeaderSupport, BaseMapViewController, MarkerCapable, CircleCapable, PolylineCapable, PolygonCapable, GroundImageCapable, RasterLayerCapable, MapUISettings, OnMapInitializedHandler, OnMarkerEventHandler, MarkerAnimationOverlayHost, CircleState, OnCircleEventHandler, PolylineState, OnPolylineEventHandler, PolygonState, OnPolygonEventHandler, OnGroundImageEventHandler, MapViewStateInterface, MapViewState, MapViewHolder, MapViewBaseProps, VisibleRegion } from '@mapconductor/js-sdk-core';
import React from 'react';

/**
 * Web port of `MapKitMapDesign` (MapKitMapDesign.swift).
 *
 * On iOS the design identifier is an `MKMapType`; on the web it is the matching
 * `mapkit.Map.MapTypes` string. `mapkit.Map.MapTypes` constants are only defined
 * once the MapKit JS library has loaded, so each design stores a stable string
 * id and resolves the runtime constant lazily via {@link MapKitMapDesign.toMapType}.
 */
type MapKitMapDesignTypeInterface = MapDesignTypeInterface<string>;
type MapKitMapDesignType = MapKitMapDesignTypeInterface;
declare class MapKitMapDesign implements MapKitMapDesignTypeInterface {
    readonly id: string;
    readonly attributionRules: readonly AttributionRule[];
    constructor(id: string, attributionRules?: readonly AttributionRule[]);
    getValue(): string;
    static readonly Standard: MapKitMapDesign;
    static readonly Satellite: MapKitMapDesign;
    static readonly Hybrid: MapKitMapDesign;
    static readonly SatelliteFlyover: MapKitMapDesign;
    static readonly HybridFlyover: MapKitMapDesign;
    static readonly MutedStandard: MapKitMapDesign;
    private static readonly designs;
    static Create(id: string): MapKitMapDesign;
    static toMapDesignType(id: string): MapKitMapDesignType;
    /** Resolve the runtime `mapkit.Map.MapTypes` string for a design. Must be
     * called after MapKit JS has loaded. */
    static toMapType(designType: MapKitMapDesignTypeInterface): string;
}

interface MapKitConfig extends MapConfig {
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
declare class MapKitProvider extends MapProvider {
    private map;
    initialize(config: MapKitConfig): Promise<MapViewControllerInterface>;
    destroy(): void;
}

/**
 * Web port of `MapKitViewHolder` (controller/MapKitViewHolder.swift).
 *
 * MapKit JS projects between geo coordinates and *page* coordinates
 * (`convertCoordinateToPointOnPage` / `convertPointOnPageToCoordinate`), whereas
 * MapConductor overlays (InfoBubble, marker animation) are positioned relative
 * to the map container. This holder translates between the two by offsetting
 * against the container's bounding rectangle.
 */
declare class MapKitViewHolder extends MapViewHolderBase<HTMLElement, mapkit.Map> {
    readonly mapView: HTMLElement;
    readonly map: mapkit.Map;
    private _controller;
    constructor(mapView: HTMLElement, map: mapkit.Map);
    getController(): MapKitViewController | null;
    setController(controller: MapKitViewController): void;
    private containerOrigin;
    toScreenOffset(position: GeoPointInterface): Offset | null;
    fromScreenOffsetSync(offset: Offset): GeoPoint | null;
}

/**
 * 統一ズーム（Google Maps 基準・256px タイル）⇄ 高度の変換。
 *
 * MapKit JS はカメラを `cameraDistance`（地図中心の上空にあるカメラの高さ、メートル）で
 * 表す。ネイティブの `MKMapCamera.fromDistance` と同じ関係でズームと結び付ける。
 * オフセットは 0。換算式はコアの {@link WebMercatorZoomAltitudeConverter} にある。
 */
declare class MapKitZoomAltitudeConverter extends WebMercatorZoomAltitudeConverter {
    /** Matches the native `MapKitZoomAltitudeConverter` default. */
    static readonly MAPKIT_OPTIMIZED_ZOOM0_ALTITUDE = 171319879;
    constructor(zoom0Altitude?: number);
}

type MapKitActualMap = mapkit.Map;
type MapKitActualMarker = mapkit.ImageAnnotation;
type MapKitActualPolyline = mapkit.PolylineOverlay;
type MapKitActualCircle = mapkit.PolygonOverlay;
type MapKitActualPolygon = mapkit.PolygonOverlay;
type MapKitActualRasterLayer = mapkit.TileOverlay;

/**
 * Web port of `MapKitMarkerRenderer` (marker/MapKitMarkerRenderer.swift).
 * Renders each marker as a native `mapkit.ImageAnnotation`.
 */
declare class MapKitMarkerRenderer extends AbstractMarkerOverlayRenderer<MapKitViewHolder, MapKitActualMarker> {
    constructor(holder: MapKitViewHolder);
    private get map();
    createMarker(entity: MarkerEntity<MapKitActualMarker>, bitmapIcon?: BitmapIcon): MapKitActualMarker | null;
    updateMarker(annotation: MapKitActualMarker, entity: MarkerEntity<MapKitActualMarker>): void;
    removeMarker(annotation: MapKitActualMarker): void;
    onAdd(data: AddParams[]): Promise<(MapKitActualMarker | null)[]>;
    onChange(data: ChangeParams<MapKitActualMarker>[]): Promise<(MapKitActualMarker | null)[]>;
    onRemove(data: MarkerEntity<MapKitActualMarker>[]): Promise<void>;
    onPostProcess(): Promise<void>;
    setMarkerPosition(entity: MarkerEntity<MapKitActualMarker>, position: GeoPoint): void;
    setMarkerVisible(entity: MarkerEntity<MapKitActualMarker>, visible: boolean): void;
}

/**
 * Web port of `MapKitMarkerController` (marker/MapKitMarkerController.swift).
 *
 * MapKit JS annotations emit their own `select` and `drag-*` events, so click
 * and drag handling is attached per-annotation in {@link onMarkerAdded} rather
 * than through map-level hit testing.
 */
declare class MapKitMarkerController extends AbstractMarkerController<MapKitActualMarker> {
    private readonly tilingOptions;
    readonly renderer: MapKitMarkerRenderer;
    private tileRenderer;
    private tileRouteId;
    private tileVersion;
    private tileGeneration;
    /** Wired by MapKitViewController to drive the tiled-marker raster overlay. */
    onRasterLayerUpdate: ((state: RasterLayerState | null) => Promise<void>) | null;
    constructor(renderer: MapKitMarkerRenderer, tilingOptions?: MarkerTilingOptions);
    update(state: MarkerState): Promise<void>;
    /** Nearest tiled (raster) marker to a clicked point, or null. */
    findTiled(position: GeoPoint, zoom: number): MarkerEntity<MapKitActualMarker> | null;
    protected shouldTile(state: MarkerState, totalCount: number): boolean;
    protected onTiledMarkersChanged(): Promise<void>;
    clear(): Promise<void>;
    destroy(): void;
    protected onMarkerAdded(entity: MarkerEntity<MapKitActualMarker>): void;
    private syncTiledOverlay;
    private removeTileOverlay;
}

/**
 * Web port of `MapKitCircleOverlayRenderer` (circle/MapKitCircleOverlayRenderer.swift).
 *
 * Like iOS (64-segment `MKPolygon`), the circle is drawn as a polygon ring from
 * the shared core geometry (`circleToRing`) instead of MapKit JS's native
 * `mapkit.CircleOverlay`, so the circle shape definition (geodesic vs planar)
 * is unified across providers. The ring is unwrapped around the center
 * longitude; MapKit accepts unwrapped longitudes (see toUnwrappedCoordinates),
 * so an antimeridian-crossing circle stays continuous without splitting. The
 * renderer contract (create/update/remove + add/change/remove/postProcess)
 * matches the other object-overlay providers.
 */
declare class MapKitCircleOverlayRenderer implements CircleOverlayRenderer<MapKitActualCircle> {
    readonly holder: MapKitViewHolder;
    constructor(holder: MapKitViewHolder);
    private get map();
    createCircle(entity: CircleEntity<MapKitActualCircle>): MapKitActualCircle | null;
    updateCircle(overlay: MapKitActualCircle, entity: CircleEntity<MapKitActualCircle>): void;
    removeCircle(overlay: MapKitActualCircle): void;
    onAdd(data: CircleAddParams[]): Promise<(MapKitActualCircle | null)[]>;
    onChange(data: CircleChangeParams<MapKitActualCircle>[]): Promise<(MapKitActualCircle | null)[]>;
    onRemove(data: CircleEntity<MapKitActualCircle>[]): Promise<void>;
    onPostProcess(): Promise<void>;
    private buildRing;
    private createStyle;
}

/**
 * Web port of `MapKitCircleController` (circle/MapKitCircleController.swift).
 * Click handling is performed at the view-controller level via `find(position:)`.
 */
declare class MapKitCircleController extends CircleController<MapKitActualCircle> {
    readonly renderer: MapKitCircleOverlayRenderer;
    constructor(renderer: MapKitCircleOverlayRenderer);
}

/**
 * Web port of `MapKitPolylineOverlayRenderer` (polyline/MapKitPolylineOverlayRenderer.swift).
 * Uses `mapkit.PolylineOverlay` in place of the native `MKPolyline` + renderer.
 */
declare class MapKitPolylineOverlayRenderer implements PolylineOverlayRenderer<MapKitActualPolyline> {
    readonly holder: MapKitViewHolder;
    constructor(holder: MapKitViewHolder);
    private get map();
    createPolyline(entity: PolylineEntity<MapKitActualPolyline>): MapKitActualPolyline | null;
    updatePolyline(overlay: MapKitActualPolyline, entity: PolylineEntity<MapKitActualPolyline>): void;
    removePolyline(overlay: MapKitActualPolyline): void;
    onAdd(data: PolylineAddParams[]): Promise<(MapKitActualPolyline | null)[]>;
    onChange(data: PolylineChangeParams<MapKitActualPolyline>[]): Promise<(MapKitActualPolyline | null)[]>;
    onRemove(data: PolylineEntity<MapKitActualPolyline>[]): Promise<void>;
    onPostProcess(): Promise<void>;
    private buildPoints;
    private createStyle;
}

/**
 * Web port of `MapKitPolylineController` (polyline/MapKitPolylineController.swift).
 * Click handling is performed at the view-controller level via `findWithClosestPoint(position:)`.
 */
declare class MapKitPolylineController extends PolylineController<MapKitActualPolyline> {
    readonly renderer: MapKitPolylineOverlayRenderer;
    constructor(renderer: MapKitPolylineOverlayRenderer);
}

/**
 * Web port of `MapKitPolygonOverlayRenderer` (polygon/MapKitPolygonOverlayRenderer.swift).
 *
 * MapKit JS's `mapkit.PolygonOverlay` accepts an array of rings where the first
 * ring is the outer boundary and any following rings are holes, so holes are
 * expressed natively instead of the native SDK's raster tile-mask approach.
 */
declare class MapKitPolygonOverlayRenderer implements PolygonOverlayRenderer<MapKitActualPolygon> {
    readonly holder: MapKitViewHolder;
    constructor(holder: MapKitViewHolder);
    private get map();
    createPolygon(entity: PolygonEntity<MapKitActualPolygon>): MapKitActualPolygon | null;
    updatePolygon(overlay: MapKitActualPolygon, entity: PolygonEntity<MapKitActualPolygon>): void;
    removePolygon(overlay: MapKitActualPolygon): void;
    onAdd(data: PolygonAddParams[]): Promise<(MapKitActualPolygon | null)[]>;
    onChange(data: PolygonChangeParams<MapKitActualPolygon>[]): Promise<(MapKitActualPolygon | null)[]>;
    onRemove(data: PolygonEntity<MapKitActualPolygon>[]): Promise<void>;
    onPostProcess(): Promise<void>;
    private buildRings;
    private createStyle;
}

/**
 * Web port of `MapKitPolygonController` (polygon/MapKitPolygonController.swift).
 * Click handling is performed at the view-controller level via `find(position:)`.
 */
declare class MapKitPolygonController extends PolygonController<MapKitActualPolygon> {
    readonly renderer: MapKitPolygonOverlayRenderer;
    constructor(renderer: MapKitPolygonOverlayRenderer);
}

/**
 * Web port of `MapKitGroundImageOverlay` (groundimage/MapKitGroundImageOverlayRenderer.swift).
 *
 * The native SDK draws the georeferenced bitmap through an `MKOverlayRenderer`.
 * MapKit JS has no ground-overlay primitive, so this positions a plain `<img>`
 * over the map: a north-up geographic rectangle projects to a rotated rectangle
 * under MapKit's Web-Mercator projection, so the image is sized to the projected
 * edge lengths and rotated to match the top edge.
 */
declare class MapKitGroundImageOverlay {
    private state;
    readonly element: HTMLImageElement;
    stateId: string;
    constructor(state: GroundImageState, parent: HTMLElement);
    setState(state: GroundImageState): void;
    layout(holder: MapKitViewHolder): void;
    remove(): void;
}

/**
 * Web port of `MapKitGroundImageOverlayRenderer` (groundimage/MapKitGroundImageOverlayRenderer.swift).
 *
 * Manages a dedicated DOM layer over the map into which each ground image is
 * rendered as a positioned `<img>`. {@link redraw} re-projects every overlay and
 * is driven by the view controller on camera changes.
 */
declare class MapKitGroundImageOverlayRenderer implements GroundImageOverlayRenderer<MapKitGroundImageOverlay> {
    readonly holder: MapKitViewHolder;
    private readonly layerElement;
    private readonly overlays;
    constructor(holder: MapKitViewHolder);
    private attachLayer;
    createGroundImage(entity: GroundImageEntity<MapKitGroundImageOverlay>): MapKitGroundImageOverlay | null;
    updateGroundImage(overlay: MapKitGroundImageOverlay, entity: GroundImageEntity<MapKitGroundImageOverlay>): void;
    removeGroundImage(overlay: MapKitGroundImageOverlay): void;
    onAdd(data: GroundImageAddParams[]): Promise<(MapKitGroundImageOverlay | null)[]>;
    onChange(data: GroundImageChangeParams<MapKitGroundImageOverlay>[]): Promise<(MapKitGroundImageOverlay | null)[]>;
    onRemove(data: GroundImageEntity<MapKitGroundImageOverlay>[]): Promise<void>;
    onPostProcess(): Promise<void>;
    /** Re-project every ground image; called by the view controller on camera changes. */
    redraw(): void;
    destroy(): void;
}

/**
 * Web port of `MapKitGroundImageController` (groundimage/MapKitGroundImageController.swift).
 * Click handling is performed at the view-controller level via `find(position:)`.
 */
declare class MapKitGroundImageController extends GroundImageController<MapKitGroundImageOverlay> {
    readonly renderer: MapKitGroundImageOverlayRenderer;
    constructor(renderer: MapKitGroundImageOverlayRenderer);
    /** Re-project every ground image; called on camera changes. */
    redraw(): void;
}

/**
 * Web port of `MapKitRasterLayerOverlayRenderer` (raster/MapKitRasterLayerOverlayRenderer.swift).
 * Uses `mapkit.TileOverlay` in place of the native `MKTileOverlay`; opacity is
 * applied through the overlay's own `opacity` property.
 */
declare class MapKitRasterLayerOverlayRenderer implements RasterLayerOverlayRenderer<MapKitActualRasterLayer> {
    readonly holder: MapKitViewHolder;
    constructor(holder: MapKitViewHolder);
    private get map();
    createRasterLayer(entity: RasterLayerEntity<MapKitActualRasterLayer>): MapKitActualRasterLayer | null;
    removeRasterLayer(overlay: MapKitActualRasterLayer): void;
    onAdd(data: RasterLayerAddParams[]): Promise<(MapKitActualRasterLayer | null)[]>;
    onChange(data: RasterLayerChangeParams<MapKitActualRasterLayer>[]): Promise<(MapKitActualRasterLayer | null)[]>;
    onRemove(data: RasterLayerEntity<MapKitActualRasterLayer>[]): Promise<void>;
    onCameraChanged(_mapCameraPosition: MapCameraPosition): Promise<void>;
    onPostProcess(): Promise<void>;
    private buildOverlay;
    private buildUrlTemplateOverlay;
}

/**
 * Web port of `MapKitRasterLayerController` (raster/MapKitRasterLayerController.swift).
 * Raster layers are not tappable, so there is no click handling here.
 */
declare class MapKitRasterLayerController extends RasterLayerController<MapKitActualRasterLayer> {
    /**
     * MapKit JS の TileOverlay は URL を返す形で、リクエストに介入する口が無い。
     * ios の MapKit は対応済みなので、ここは web だけの制約。
     *
     * userAgent はブラウザが上書きを許さないので、どのプロバイダでも web では効かない。
     */
    protected get headerSupport(): RasterHeaderSupport;
    readonly renderer: MapKitRasterLayerOverlayRenderer;
    constructor(renderer: MapKitRasterLayerOverlayRenderer);
}

type MapKitDesignTypeChangeHandler = (value: MapKitMapDesignTypeInterface) => void;
/**
 * Web port of `MapKitViewController` (controller/MapKitViewController.swift).
 * Implements the shared MapConductor view-controller contract on top of a
 * `mapkit.Map`.
 */
declare class MapKitViewController extends BaseMapViewController implements MapViewControllerInterface, MarkerCapable, CircleCapable, PolylineCapable, PolygonCapable, GroundImageCapable, RasterLayerCapable {
    readonly holder: MapKitViewHolder;
    private readonly converter;
    private readonly markerController;
    private readonly circleController;
    private readonly polylineController;
    private readonly polygonController;
    private readonly groundImageController;
    private readonly rasterLayerController;
    private readonly map;
    /** カメラの読み書き。状態を持つのでコンストラクタで組み立てて注入する。 */
    private readonly camera;
    /** タップ配送へ渡す依存一式。private を覗かせずに必要なものだけ束ねる。 */
    private get tapDeps();
    private readonly eventCleanup;
    private initialized;
    private moving;
    private rafId;
    private mapDesignType;
    private mapDesignTypeChangeListener;
    constructor(holder: MapKitViewHolder, converter: MapKitZoomAltitudeConverter, markerController: MapKitMarkerController, circleController: MapKitCircleController, polylineController: MapKitPolylineController, polygonController: MapKitPolygonController, groundImageController: MapKitGroundImageController, rasterLayerController: MapKitRasterLayerController, mapDesignType?: MapKitMapDesignTypeInterface, logicalTiltHint?: number | null);
    getMap(): mapkit.Map;
    /**
     * MapKit JS has no tilt gesture at all — its camera is always overhead — so
     * only scroll, zoom and rotation can be gated.
     */
    applyUISettings(settings: MapUISettings): void;
    setMapDesignType(value: MapKitMapDesignTypeInterface): void;
    setMapDesignTypeChangeListener(listener: MapKitDesignTypeChangeHandler | null): void;
    setMapInitializedListener(listener: OnMapInitializedHandler | null): void;
    private setupEventListeners;
    private startMoveLoop;
    private stopMoveLoop;
    private forwardCameraToOverlays;
    getCameraPosition(): MapCameraPosition | null;
    moveCamera(position: MapCameraPosition): Promise<boolean>;
    animateCamera(position: MapCameraPosition, durationMillis: number): Promise<boolean>;
    fitBounds(bounds: GeoRectBounds, padding: number): Promise<boolean>;
    compositionMarkers(data: MarkerState[]): Promise<void>;
    updateMarker(state: MarkerState): Promise<void>;
    hasMarker(state: MarkerState): boolean;
    setOnMarkerClickListener(listener: OnMarkerEventHandler | null): void;
    setOnMarkerDragStart(listener: OnMarkerEventHandler | null): void;
    setOnMarkerDrag(listener: OnMarkerEventHandler | null): void;
    setOnMarkerDragEnd(listener: OnMarkerEventHandler | null): void;
    setOnMarkerAnimateStart(listener: OnMarkerEventHandler | null): void;
    setOnMarkerAnimateEnd(listener: OnMarkerEventHandler | null): void;
    setMarkerAnimationOverlayHost(host: MarkerAnimationOverlayHost | null): void;
    compositionCircles(data: CircleState[]): Promise<void>;
    updateCircle(state: CircleState): Promise<void>;
    hasCircle(state: CircleState): boolean;
    setOnCircleClickListener(listener: OnCircleEventHandler | null): void;
    compositionPolylines(data: PolylineState[]): Promise<void>;
    updatePolyline(state: PolylineState): Promise<void>;
    hasPolyline(state: PolylineState): boolean;
    setOnPolylineClickListener(listener: OnPolylineEventHandler | null): void;
    compositionPolygons(data: PolygonState[]): Promise<void>;
    updatePolygon(state: PolygonState): Promise<void>;
    hasPolygon(state: PolygonState): boolean;
    setOnPolygonClickListener(listener: OnPolygonEventHandler | null): void;
    compositionGroundImages(data: GroundImageState[]): Promise<void>;
    updateGroundImage(state: GroundImageState): Promise<void>;
    hasGroundImage(state: GroundImageState): boolean;
    setOnGroundImageClickListener(listener: OnGroundImageEventHandler | null): void;
    compositionRasterLayers(data: RasterLayerState[]): Promise<void>;
    updateRasterLayer(state: RasterLayerState): Promise<void>;
    hasRasterLayer(state: RasterLayerState): boolean;
    clearOverlays(): Promise<void>;
    destroy(): void;
}

/**
 * Web port of `MapKitViewState` (MapKitViewState.swift). Additionally carries
 * the MapKit JS authorization `token`, which native MapKit does not require.
 */
interface MapKitViewStateInterface extends MapViewStateInterface<MapKitMapDesignTypeInterface> {
    readonly token: string;
}
interface MapKitViewStateParams {
    id?: string;
    token?: string;
    mapDesignType?: MapKitMapDesignTypeInterface;
    cameraPosition?: MapCameraPosition;
}
declare class MapKitViewState extends MapViewState<MapKitMapDesignTypeInterface> implements MapKitViewStateInterface {
    readonly id: string;
    readonly token: string;
    private _cameraPosition;
    private _mapDesignType;
    private controller;
    private cameraPositionChangeListener;
    constructor({ id, token, mapDesignType, cameraPosition, }?: MapKitViewStateParams);
    get cameraPosition(): MapCameraPosition;
    get mapDesignType(): MapKitMapDesignTypeInterface;
    set mapDesignType(value: MapKitMapDesignTypeInterface);
    moveCameraTo(position: GeoPoint, durationMillis?: number): void;
    moveCameraTo(cameraPosition: MapCameraPosition, durationMillis?: number): void;
    getMapViewHolder(): MapViewHolder<unknown, unknown> | null;
    fitBounds(bounds: GeoRectBounds, padding?: number): void;
    setController(controller: MapViewControllerInterface | null): void;
    updateCameraPosition(camera: MapCameraPosition): void;
    setCameraPositionChangeListener(listener: ((camera: MapCameraPosition) => void) | null): void;
    private resolveCameraPosition;
}
declare function useMapKitViewState(params?: MapKitViewStateParams): MapKitViewStateInterface;

interface MapKitMapViewProps extends MapViewBaseProps<MapKitViewStateInterface> {
    style?: React.CSSProperties;
    containerStyle?: React.CSSProperties;
    markerTilingOptions?: MarkerTilingOptions;
    minZoom?: number;
    maxZoom?: number;
    /** Restricts panning so the camera center cannot leave this rectangle. */
    restrictBounds?: GeoRectBounds;
    onError?: (error: Error) => void;
    children?: React.ReactNode;
}
/**
 * Apple MapKit React component. Web port of `MapKitMapView` (MapKitMapView.swift).
 */
declare function MapKitMapView({ state, className, style, containerStyle, markerTilingOptions, minZoom, maxZoom, restrictBounds, cameraRestriction, onError, onMapLoaded, onMapClick, onMapLongClick, onCameraMoveStart, onCameraMove, onCameraMoveEnd, children, }: MapKitMapViewProps): React.JSX.Element;

interface MapKitLoadOptions {
    /** A static MapKit JS authorization token (JWT). */
    token?: string;
    /** A callback that supplies (and can refresh) the authorization token. Takes
     * precedence over {@link token} when both are provided. */
    authorizationCallback?: (done: (token: string) => void) => void;
    language?: string;
    libraries?: readonly string[];
}
/**
 * Loads Apple MapKit JS from Apple's CDN (once) and initializes it with the
 * provided authorization. Mirrors the external-SDK loader other web providers
 * use (Google Maps' `LibraryLoader`, ArcGIS' `@arcgis/core`).
 */
declare function loadMapKit(options: MapKitLoadOptions): Promise<typeof mapkit>;

/**
 * Web port of `MapCameraPositionExtensions.swift`.
 *
 * On iOS these are `MapCameraPosition.toMKMapCamera(on:)` and
 * `MKMapView.toMapCameraPosition(...)`. MapKit JS is a 2D map: the camera is a
 * center coordinate + a `cameraDistance` (meters) + a `rotation` (degrees).
 * Tilt has no native representation, so the logical tilt is carried through
 * unchanged for round-trip fidelity but does not affect the map.
 */
interface MapKitCameraParams {
    center: mapkit.Coordinate;
    cameraDistance: number;
    rotation: number;
}
/** MapCameraPosition -> MapKit JS camera parameters. */
declare function toMapKitCameraParams(pos: MapCameraPosition, converter: MapKitZoomAltitudeConverter): MapKitCameraParams;
/** MapKit JS camera state -> MapCameraPosition. */
declare function toMapCameraPosition({ center, cameraDistance, rotation, converter, visibleRegion, logicalTiltHint, }: {
    center: mapkit.Coordinate;
    cameraDistance: number;
    rotation: number;
    converter: MapKitZoomAltitudeConverter;
    visibleRegion?: VisibleRegion | null;
    logicalTiltHint?: number | null;
}): MapCameraPosition;

/**
 * Web port of `MapConductorPointAnnotation` (marker/MapConductorPointAnnotation.swift).
 *
 * On iOS this is an `MKPointAnnotation` subclass carrying the marker id, state
 * and initial bitmap icon. MapKit JS's `ImageAnnotation` is not subclassable in
 * the same way, so the same three fields are attached through the annotation's
 * `data` property and the annotation is created via {@link createMapConductorPointAnnotation}.
 */
interface MapConductorPointAnnotationData {
    markerId: string;
    markerState: MarkerState;
    initialBitmapIcon: BitmapIcon;
}
declare function createMapConductorPointAnnotation(markerState: MarkerState, bitmapIcon: BitmapIcon): MapKitActualMarker;

export { type MapConductorPointAnnotationData, type MapKitActualCircle, type MapKitActualMap, type MapKitActualMarker, type MapKitActualPolygon, type MapKitActualPolyline, type MapKitActualRasterLayer, type MapKitCameraParams, MapKitCircleController, MapKitCircleOverlayRenderer, type MapKitConfig, type MapKitDesignTypeChangeHandler, MapKitGroundImageController, MapKitGroundImageOverlay, MapKitGroundImageOverlayRenderer, type MapKitLoadOptions, MapKitMapDesign, type MapKitMapDesignType, type MapKitMapDesignTypeInterface, MapKitMapView, type MapKitMapViewProps, MapKitMarkerController, MapKitMarkerRenderer, MapKitPolygonController, MapKitPolygonOverlayRenderer, MapKitPolylineController, MapKitPolylineOverlayRenderer, MapKitProvider, MapKitRasterLayerController, MapKitRasterLayerOverlayRenderer, MapKitViewController, MapKitViewHolder, MapKitViewState, type MapKitViewStateInterface, type MapKitViewStateParams, MapKitZoomAltitudeConverter, createMapConductorPointAnnotation, loadMapKit, toMapCameraPosition, toMapKitCameraParams, useMapKitViewState };
