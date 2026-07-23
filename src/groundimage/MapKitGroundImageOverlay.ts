import { createGeoPoint, type GroundImageState } from '@mapconductor/js-sdk-core';
import type { MapKitViewHolder } from '../MapKitViewHolder';

/**
 * Web port of `MapKitGroundImageOverlay` (groundimage/MapKitGroundImageOverlayRenderer.swift).
 *
 * The native SDK draws the georeferenced bitmap through an `MKOverlayRenderer`.
 * MapKit JS has no ground-overlay primitive, so this positions a plain `<img>`
 * over the map: a north-up geographic rectangle projects to a rotated rectangle
 * under MapKit's Web-Mercator projection, so the image is sized to the projected
 * edge lengths and rotated to match the top edge.
 */
export class MapKitGroundImageOverlay {
  readonly element: HTMLImageElement;
  stateId: string;

  constructor(
    private state: GroundImageState,
    parent: HTMLElement,
  ) {
    this.stateId = state.id;
    const img = document.createElement('img');
    img.src = state.imageUrl;
    img.draggable = false;
    Object.assign(img.style, {
      position: 'absolute',
      left: '0',
      top: '0',
      transformOrigin: '0 0',
      pointerEvents: 'none',
      userSelect: 'none',
      opacity: String(state.opacity),
    } as Partial<CSSStyleDeclaration>);
    this.element = img;
    parent.appendChild(img);
  }

  setState(state: GroundImageState): void {
    this.state = state;
    this.stateId = state.id;
    if (this.element.getAttribute('src') !== state.imageUrl) {
      this.element.src = state.imageUrl;
    }
    this.element.style.opacity = String(state.opacity);
  }

  layout(holder: MapKitViewHolder): void {
    const sw = this.state.bounds.southWest;
    const ne = this.state.bounds.northEast;
    if (!sw || !ne) {
      this.element.style.display = 'none';
      return;
    }

    const nw = holder.toScreenOffset(createGeoPoint({ latitude: ne.latitude, longitude: sw.longitude }));
    const neScreen = holder.toScreenOffset(createGeoPoint({ latitude: ne.latitude, longitude: ne.longitude }));
    const swScreen = holder.toScreenOffset(createGeoPoint({ latitude: sw.latitude, longitude: sw.longitude }));
    if (!nw || !neScreen || !swScreen) {
      this.element.style.display = 'none';
      return;
    }

    const topEdgeX = neScreen.x - nw.x;
    const topEdgeY = neScreen.y - nw.y;
    const width = Math.hypot(topEdgeX, topEdgeY);
    const height = Math.hypot(swScreen.x - nw.x, swScreen.y - nw.y);
    const angleRad = Math.atan2(topEdgeY, topEdgeX);

    this.element.style.display = '';
    this.element.style.width = `${width}px`;
    this.element.style.height = `${height}px`;
    this.element.style.transform = `translate(${nw.x}px, ${nw.y}px) rotate(${angleRad}rad)`;
  }

  remove(): void {
    this.element.remove();
  }
}
