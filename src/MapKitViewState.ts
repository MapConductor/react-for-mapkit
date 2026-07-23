import { useState } from 'react';
import {
  MapCameraPosition as MapCameraPositionNS,
  MapViewState,
  createRandomId,
  type GeoPoint,
  type MapCameraPosition,
  type MapViewControllerInterface,
  type MapViewHolder,
  type MapViewStateInterface,
} from '@mapconductor/js-sdk-core';
import { MapKitMapDesign, type MapKitMapDesignTypeInterface } from './MapKitMapDesign';

/**
 * Web port of `MapKitViewState` (MapKitViewState.swift). Additionally carries
 * the MapKit JS authorization `token`, which native MapKit does not require.
 */
export interface MapKitViewStateInterface extends MapViewStateInterface<MapKitMapDesignTypeInterface> {
  readonly token: string;
}

export interface MapKitViewStateParams {
  id?: string;
  token?: string;
  mapDesignType?: MapKitMapDesignTypeInterface;
  cameraPosition?: MapCameraPosition;
}

export class MapKitViewState
  extends MapViewState<MapKitMapDesignTypeInterface>
  implements MapKitViewStateInterface
{
  readonly id: string;
  readonly token: string;
  private _cameraPosition: MapCameraPosition;
  private _mapDesignType: MapKitMapDesignTypeInterface;
  private controller: MapViewControllerInterface | null = null;
  private cameraPositionChangeListener: ((camera: MapCameraPosition) => void) | null = null;

  constructor({
    id = createRandomId(),
    token = '',
    mapDesignType = MapKitMapDesign.Standard,
    cameraPosition = MapCameraPositionNS.Default,
  }: MapKitViewStateParams = {}) {
    super();
    this.id = id;
    this.token = token;
    this._mapDesignType = mapDesignType;
    this._cameraPosition = cameraPosition;
  }

  override get cameraPosition(): MapCameraPosition {
    return this._cameraPosition;
  }

  override get mapDesignType(): MapKitMapDesignTypeInterface {
    return this._mapDesignType;
  }

  override set mapDesignType(value: MapKitMapDesignTypeInterface) {
    this._mapDesignType = value;
    const controller = this.controller as { setMapDesignType?: (design: MapKitMapDesignTypeInterface) => void } | null;
    controller?.setMapDesignType?.(value);
  }

  override moveCameraTo(position: GeoPoint, durationMillis?: number): void;
  override moveCameraTo(cameraPosition: MapCameraPosition, durationMillis?: number): void;
  override moveCameraTo(positionOrCamera: GeoPoint | MapCameraPosition, durationMillis?: number): void {
    const next = 'zoom' in positionOrCamera
      ? this.resolveCameraPosition(positionOrCamera as MapCameraPosition)
      : this._cameraPosition.copy({ position: positionOrCamera as GeoPoint });
    if (!this.controller) {
      this._cameraPosition = next;
      return;
    }
    if (!durationMillis || durationMillis === 0) {
      void this.controller.moveCamera(next);
    } else {
      void this.controller.animateCamera(next, { duration: durationMillis });
    }
    this._cameraPosition = next;
    this.cameraPositionChangeListener?.(next);
  }

  override getMapViewHolder(): MapViewHolder<unknown, unknown> | null {
    return this.controller?.holder ?? null;
  }

  override setController(controller: MapViewControllerInterface | null): void {
    this.controller = controller;
    if (controller) void controller.moveCamera(this._cameraPosition);
  }

  override updateCameraPosition(camera: MapCameraPosition): void {
    this._cameraPosition = camera;
    this.cameraPositionChangeListener?.(camera);
  }

  override setCameraPositionChangeListener(listener: ((camera: MapCameraPosition) => void) | null): void {
    this.cameraPositionChangeListener = listener;
  }

  // If zoom/bearing/tilt are all 0, treat as a position-only update (matches Android/iOS).
  private resolveCameraPosition(target: MapCameraPosition): MapCameraPosition {
    const isUnspecified = target.zoom === 0 && target.bearing === 0 && target.tilt === 0;
    if (isUnspecified) return this._cameraPosition.copy({ position: target.position });
    return target;
  }
}

export function useMapKitViewState(params: MapKitViewStateParams = {}): MapKitViewState {
  const [state] = useState(() => new MapKitViewState(params));
  return state;
}
