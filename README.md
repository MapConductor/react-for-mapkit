# Apple MapKit provider for MapConductor React SDK

`@mapconductor/react-for-mapkit` is the web/React DOM provider that renders
MapConductor maps with **Apple MapKit JS**. It is the React counterpart of the
iOS `MapConductorForMapKit` module and exposes the same class structure,
properties, and methods so application code stays identical across providers.

## Setup

MapKit JS is loaded from Apple's CDN at runtime and requires an authorization
token (a MapKit JS JWT). Provide it through the view state:

```tsx
import {
  MapKitMapView,
  MapKitMapDesign,
  useMapKitViewState,
} from '@mapconductor/react-for-mapkit';
import { MapCameraPosition, GeoPoint } from '@mapconductor/js-sdk-core';
import { Marker } from '@mapconductor/js-sdk-react';

function MapExample() {
  const state = useMapKitViewState({
    token: import.meta.env.VITE_MAPKIT_TOKEN, // MapKit JS JWT
    mapDesignType: MapKitMapDesign.Standard,
    cameraPosition: new MapCameraPosition({
      position: new GeoPoint({ latitude: 35.6762, longitude: 139.6503 }),
      zoom: 12,
    }),
  });

  return (
    <MapKitMapView state={state} style={{ width: '100%', height: '100vh' }}>
      <Marker position={new GeoPoint({ latitude: 35.6762, longitude: 139.6503 })} />
    </MapKitMapView>
  );
}
```

## Components

- **`MapKitMapView`** — the map component (`state`, `onMapLoaded`, `onMapClick`,
  `onCameraMove*`, `minZoom`, `maxZoom`, `restrictBounds`, …).
- **`MapKitViewState` / `useMapKitViewState`** — view state holding the camera,
  map design, and MapKit JS `token`.
- **`MapKitMapDesign`** — map types: `Standard`, `Satellite`, `Hybrid`,
  `SatelliteFlyover`, `HybridFlyover`, `MutedStandard`.

Markers, circles, polylines, polygons, ground images, and raster layers are the
shared `@mapconductor/js-sdk-react` overlay components and work unchanged here.

## Feature mapping (native ↔ MapKit JS)

| MapConductor overlay | MapKit JS type |
| --- | --- |
| Marker | `mapkit.ImageAnnotation` |
| Circle | `mapkit.CircleOverlay` |
| Polyline | `mapkit.PolylineOverlay` |
| Polygon | `mapkit.PolygonOverlay` |
| Raster layer | `mapkit.TileOverlay` |
| Ground image | positioned DOM `<img>` overlay (MapKit JS has no ground-overlay primitive) |

## Notes

- MapKit JS is a 2D map: `tilt` has no native representation and is preserved
  only for round-trip fidelity of `MapCameraPosition`.
- An `ImageAnnotation`'s image URL is fixed at creation, so changing a marker's
  icon recreates the annotation; position changes update in place.
