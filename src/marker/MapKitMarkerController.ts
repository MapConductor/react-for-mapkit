import {
  AbstractMarkerController,
  createGeoPoint,
  MarkerManager,
  MarkerTilingOptions,
  type MarkerEntity,
  type MarkerState,
} from '@mapconductor/js-sdk-core';
import { MapKitMarkerRenderer } from './MapKitMarkerRenderer';
import type { MapKitActualMarker } from '../MapKitTypeAlias';

/**
 * Web port of `MapKitMarkerController` (marker/MapKitMarkerController.swift).
 *
 * MapKit JS annotations emit their own `select` and `drag-*` events, so click
 * and drag handling is attached per-annotation in {@link onMarkerAdded} rather
 * than through map-level hit testing.
 */
export class MapKitMarkerController extends AbstractMarkerController<MapKitActualMarker> {
  declare readonly renderer: MapKitMarkerRenderer;

  constructor(
    renderer: MapKitMarkerRenderer,
    tilingOptions: MarkerTilingOptions = MarkerTilingOptions.Default,
  ) {
    super({
      markerManager: MarkerManager.defaultManager<MapKitActualMarker>(null, tilingOptions.minMarkerCount),
      renderer,
    });
  }

  override async update(state: MarkerState): Promise<void> {
    if (this.isDragging(state)) return;
    await super.update(state);
  }

  protected override onMarkerAdded(entity: MarkerEntity<MapKitActualMarker>): void {
    const annotation = entity.marker;
    if (!annotation) return;
    const state = entity.state;

    annotation.addEventListener('select', () => {
      // Suppress MapKit's built-in selection/callout; we only use it as a tap signal.
      annotation.selected = false;
      if (state.clickable) this.dispatchClick(state);
    });

    if (!state.draggable) return;

    annotation.addEventListener('drag-start', () => {
      this.setDraggingState(state, true);
      this.dispatchDragStart(state);
    });
    annotation.addEventListener('dragging', (event) => {
      const coordinate = (event as unknown as { coordinate?: mapkit.Coordinate }).coordinate;
      if (!coordinate) return;
      state.setPosition(createGeoPoint({ latitude: coordinate.latitude, longitude: coordinate.longitude }));
      this.dispatchDrag(state);
    });
    annotation.addEventListener('drag-end', () => {
      this.setDraggingState(state, false);
      this.dispatchDragEnd(state);
    });
  }
}
