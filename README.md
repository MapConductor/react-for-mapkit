# @mapconductor/react-for-mapkit

Apple MapKit JS provider for the MapConductor React SDK. Renders MapConductor
maps with Apple MapKit JS through MapConductor's provider-independent camera,
marker, and overlay API, so the same application code can also run on Google
Maps, MapLibre, Mapbox, Leaflet, OpenLayers, ArcGIS, Cesium, or HERE.

## Installation

```shell
npm install @mapconductor/react-for-mapkit
```

`@mapconductor/js-sdk-core` and `@mapconductor/js-sdk-react` (used for markers and
other shared components) are installed automatically as dependencies. Your
code imports from both directly, so with pnpm's strict (isolated)
`node_modules` — or whenever you prefer to declare everything you import —
install them explicitly instead:

```shell
npm install @mapconductor/react-for-mapkit @mapconductor/js-sdk-core @mapconductor/js-sdk-react
```

MapKit JS is loaded from Apple's CDN at runtime and requires an authorization
token (a MapKit JS JWT), which you provide through the view state.

![](https://raw.githubusercontent.com/mapconductor/react-for-mapkit/docs/images/hello-map.jpg)

## Hello Map tutorial

The simplest possible map app, built with MapConductor + Apple MapKit: click
the marker and a "Hello, MapConductor" bubble pops up. You can build it in the
5 steps below. It uses Apple MapKit JS, which requires a MapKit JS token, so
add one and it just works.

### Step 1: Create a React project

Create a React + TypeScript project with Vite.

```shell
npm create vite@latest hello-map -- --template react-ts
cd hello-map
npm install
npm run dev
```

### Step 2: Install MapConductor (MapKit)

Install the package needed to show a map. We use Apple MapKit here, but you
can use other map modules too.

```shell
npm install @mapconductor/react-for-mapkit
```

- `@mapconductor/react-for-mapkit` — components / hooks for Apple MapKit
- `@mapconductor/js-sdk-react` / `@mapconductor/js-sdk-core` are installed
  automatically as dependencies.
- You'll also need a MapKit JS token (env `VITE_MAPKIT_TOKEN`); MapKit JS
  requires it to authorize requests to Apple's map tiles.

### Step 3: Show the map

Create the map state with `useMapKitViewState` and render it with
`<MapKitMapView>`. Give it a `style` prop to make it full-screen.

```tsx
import {
  MapKitMapDesign,
  MapKitMapView,
  useMapKitViewState,
} from '@mapconductor/react-for-mapkit';
import { createGeoPoint, createMapCameraPosition } from '@mapconductor/js-sdk-core';

const TOKYO = createGeoPoint({ latitude: 35.6812, longitude: 139.7671 });
const INITIAL_CAMERA = createMapCameraPosition({ position: TOKYO, zoom: 14 });

export default function App() {
  const mapViewState = useMapKitViewState({
    token: import.meta.env.VITE_MAPKIT_TOKEN,
    mapDesignType: MapKitMapDesign.Standard,
    cameraPosition: INITIAL_CAMERA,
  });

  return (
    <MapKitMapView state={mapViewState} style={{ width: '100vw', height: '100vh' }} />
  );
}
```

### Step 4: Place a marker

Create the marker state with `createMarkerState` and register it with
`<Marker>`. Write overlays as **child elements** of the map component.

```tsx
import { useMemo } from 'react';
import { createMarkerState } from '@mapconductor/js-sdk-core';
import { Marker } from '@mapconductor/js-sdk-react';

// ...inside App...
const marker = useMemo(
  () => createMarkerState({ id: 'hello', position: TOKYO }),
  [],
);

// ...inside return...
<MapKitMapView state={mapViewState} style={{ width: '100vw', height: '100vh' }}>
  <Marker state={marker} />
</MapKitMapView>
```

### Step 5: Show an InfoBubble on click

Track the selected state with `useState`, set it to true in the marker's
`onClick`, and render `<InfoBubble>` only while selected. This is the finished
app.

```tsx
import { useMemo, useState } from 'react';
import {
  MapKitMapDesign,
  MapKitMapView,
  useMapKitViewState,
} from '@mapconductor/react-for-mapkit';
import {
  createGeoPoint,
  createMapCameraPosition,
  createMarkerState,
} from '@mapconductor/js-sdk-core';
import { InfoBubble, Marker } from '@mapconductor/js-sdk-react';

const TOKYO = createGeoPoint({ latitude: 35.6812, longitude: 139.7671 });
const INITIAL_CAMERA = createMapCameraPosition({ position: TOKYO, zoom: 14 });

export default function App() {
  const mapViewState = useMapKitViewState({
    token: import.meta.env.VITE_MAPKIT_TOKEN,
    mapDesignType: MapKitMapDesign.Standard,
    cameraPosition: INITIAL_CAMERA,
  });

  const [selected, setSelected] = useState(false);

  const marker = useMemo(
    () => createMarkerState({
      id: 'hello',
      position: TOKYO,
      onClick: () => setSelected(true),
    }),
    [],
  );

  return (
    <MapKitMapView
      state={mapViewState}
      style={{ width: '100vw', height: '100vh' }}
      onMapClick={() => setSelected(false)}
    >
      <Marker state={marker} />
      {selected && (
        <InfoBubble marker={marker}>
          <div style={{ padding: '8px 12px', fontWeight: 600 }}>
            Hello, MapConductor
          </div>
        </InfoBubble>
      )}
    </MapKitMapView>
  );
}
```

### Key points

- Coordinates, cameras and markers are created with `js-sdk-core` functions
  (**provider-independent**).
- The map component and hooks come from `react-for-mapkit`
  (**provider-specific**).
- Write overlays as **child elements** of the map component.
- Control show / hide with React `useState`.

## Notes

- MapKit JS is a 2D map: `tilt` has no native representation and is preserved
  only for round-trip fidelity of `MapCameraPosition`.
- An `ImageAnnotation`'s image URL is fixed at creation, so changing a marker's
  icon recreates the annotation; position changes update in place.

## Related packages

- [`@mapconductor/js-sdk-core`](https://github.com/mapconductor/js-sdk-core) — geometry, camera, and state primitives
- [`@mapconductor/js-sdk-react`](https://github.com/mapconductor/js-sdk-react) — shared `Marker`, `Markers`, shapes, and info bubbles
