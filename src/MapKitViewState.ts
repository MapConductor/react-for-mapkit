import {
  useState } from 'react';
import {
  MapCameraPosition as MapCameraPositionNS,
  MapViewState,
  createRandomId,
  type MapCameraPosition,
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
  readonly token: string;
  private _mapDesignType: MapKitMapDesignTypeInterface;

  constructor({
    id = createRandomId(),
    token = '',
    mapDesignType = MapKitMapDesign.Standard,
    cameraPosition = MapCameraPositionNS.Default,
  }: MapKitViewStateParams = {}) {
    super({ id, cameraPosition });
    this.token = token;
    this._mapDesignType = mapDesignType;
  }

  override get mapDesignType(): MapKitMapDesignTypeInterface {
    return this._mapDesignType;
  }

  override set mapDesignType(value: MapKitMapDesignTypeInterface) {
    this._mapDesignType = value;
    const controller = this.attachedMapController as { setMapDesignType?: (design: MapKitMapDesignTypeInterface) => void } | null;
    controller?.setMapDesignType?.(value);
  }

  // If zoom/bearing/tilt are all 0, treat as a position-only update (matches Android/iOS).
}

export function useMapKitViewState(params: MapKitViewStateParams = {}): MapKitViewStateInterface {
  const [state] = useState(() => new MapKitViewState(params));
  return state;
}
