import {
  GroundImageEntity,
  type GroundImageAddParams,
  type GroundImageChangeParams,
  type GroundImageOverlayRenderer,
} from '@mapconductor/js-sdk-core';
import { MapKitViewHolder } from '../MapKitViewHolder';
import { MapKitGroundImageOverlay } from './MapKitGroundImageOverlay';

/**
 * Web port of `MapKitGroundImageOverlayRenderer` (groundimage/MapKitGroundImageOverlayRenderer.swift).
 *
 * Manages a dedicated DOM layer over the map into which each ground image is
 * rendered as a positioned `<img>`. {@link redraw} re-projects every overlay and
 * is driven by the view controller on camera changes.
 */
export class MapKitGroundImageOverlayRenderer implements GroundImageOverlayRenderer<MapKitGroundImageOverlay> {
  private readonly layerElement: HTMLDivElement;
  private readonly overlays = new Set<MapKitGroundImageOverlay>();

  constructor(readonly holder: MapKitViewHolder) {
    const layer = document.createElement('div');
    Object.assign(layer.style, {
      position: 'absolute',
      inset: '0',
      overflow: 'hidden',
      pointerEvents: 'none',
    } as Partial<CSSStyleDeclaration>);
    this.layerElement = layer;
    this.attachLayer();
  }

  // MapKit renders the base map, raster tile overlays and vector overlays
  // (polyline/polygon) into a shared <canvas> inside `.mk-map-view`, while
  // markers are DOM nodes in `.mk-map-node-element`, which paints above that
  // canvas. Insert the ground-image layer between the two so the image sits
  // above the map/raster/overlays but below the markers — markers must stay on
  // top (they are also the drag handles for the image bounds). If MapKit's inner
  // layers aren't built yet, fall back to the outer container and upgrade later.
  private attachLayer(): void {
    if (this.layerElement.parentElement?.classList.contains('mk-map-view')) return;
    const mapView = this.holder.mapView.querySelector<HTMLElement>('.mk-map-view');
    const nodeElement = mapView?.querySelector<HTMLElement>(':scope > .mk-map-node-element');
    if (mapView && nodeElement) {
      mapView.insertBefore(this.layerElement, nodeElement);
    } else if (!this.layerElement.isConnected) {
      this.holder.mapView.appendChild(this.layerElement);
    }
  }

  createGroundImage(entity: GroundImageEntity<MapKitGroundImageOverlay>): MapKitGroundImageOverlay | null {
    this.attachLayer();
    const overlay = new MapKitGroundImageOverlay(entity.state, this.layerElement);
    overlay.layout(this.holder);
    this.overlays.add(overlay);
    return overlay;
  }

  updateGroundImage(overlay: MapKitGroundImageOverlay, entity: GroundImageEntity<MapKitGroundImageOverlay>): void {
    overlay.setState(entity.state);
    overlay.layout(this.holder);
  }

  removeGroundImage(overlay: MapKitGroundImageOverlay): void {
    overlay.remove();
    this.overlays.delete(overlay);
  }

  async onAdd(data: GroundImageAddParams[]): Promise<(MapKitGroundImageOverlay | null)[]> {
    return data.map(({ state }) => this.createGroundImage({ state } as GroundImageEntity<MapKitGroundImageOverlay>));
  }

  async onChange(data: GroundImageChangeParams<MapKitGroundImageOverlay>[]): Promise<(MapKitGroundImageOverlay | null)[]> {
    return data.map(({ current }) => {
      if (!current.groundImage) return this.createGroundImage(current);
      this.updateGroundImage(current.groundImage, current);
      return current.groundImage;
    });
  }

  async onRemove(data: GroundImageEntity<MapKitGroundImageOverlay>[]): Promise<void> {
    data.forEach(({ groundImage }) => {
      if (groundImage) this.removeGroundImage(groundImage);
    });
  }

  async onPostProcess(): Promise<void> {}

  /** Re-project every ground image; called by the view controller on camera changes. */
  redraw(): void {
    this.attachLayer();
    for (const overlay of this.overlays) {
      overlay.layout(this.holder);
    }
  }

  destroy(): void {
    for (const overlay of this.overlays) overlay.remove();
    this.overlays.clear();
    this.layerElement.remove();
  }
}
