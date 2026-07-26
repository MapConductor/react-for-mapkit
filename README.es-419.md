[English](https://github.com/MapConductor/react-for-mapkit/blob/main/README.md) | [日本語](https://github.com/MapConductor/react-for-mapkit/blob/main/README.ja.md) | Español (Latinoamérica)

# @mapconductor/react-for-mapkit

Proveedor de Apple MapKit JS para el SDK de React de MapConductor. Renderiza mapas de MapConductor con Apple MapKit JS a través de la API de cámara, marcadores y superposiciones independiente del proveedor de MapConductor, de modo que el mismo código de aplicación también puede ejecutarse en Google Maps, MapLibre, Mapbox, Leaflet, OpenLayers, ArcGIS, Cesium o HERE.

## Instalación

```shell
npm install @mapconductor/react-for-mapkit
```

`@mapconductor/js-sdk-core` y `@mapconductor/js-sdk-react` (usados para marcadores y otros componentes compartidos) se instalan automáticamente como dependencias. Tu código importa directamente de ambos, así que con el `node_modules` estricto (aislado) de pnpm — o siempre que prefieras declarar todo lo que importas — instálalos explícitamente:

```shell
npm install @mapconductor/react-for-mapkit @mapconductor/js-sdk-core @mapconductor/js-sdk-react
```

MapKit JS se carga en tiempo de ejecución desde la CDN de Apple y requiere un token de autorización (un JWT de MapKit JS), que proporcionas a través del estado de la vista.

![](https://raw.githubusercontent.com/mapconductor/react-for-mapkit/docs/images/hello-map.jpg)

## Tutorial Hello Map

La aplicación de mapa más sencilla posible, creada con MapConductor + Apple MapKit: haz clic en el marcador y aparecerá un globo "Hello, MapConductor". Puedes crear este mapa en los 5 pasos siguientes. Apple MapKit JS requiere un token de MapKit JS, así que agrégalo y funciona.

### Paso 1: Crea un proyecto React

Crea un proyecto React + TypeScript con Vite.

```shell
npm create vite@latest hello-map -- --template react-ts
cd hello-map
npm install
npm run dev
```

### Paso 2: Instala MapConductor (MapKit)

Instala el paquete necesario para mostrar un mapa. Aquí usamos Apple MapKit, pero también puedes usar otros módulos de mapas.

```shell
npm install @mapconductor/react-for-mapkit
```

- `@mapconductor/react-for-mapkit` — componentes / hooks para Apple MapKit
- `@mapconductor/js-sdk-react` / `@mapconductor/js-sdk-core` se instalan
  automáticamente como dependencias.
- Se requiere un token de MapKit JS (env `VITE_MAPKIT_TOKEN`); MapKit JS lo necesita para autorizar las solicitudes a las teselas del mapa de Apple.

### Paso 3: Muestra el mapa

Crea el estado del mapa con `useMapKitViewState` y renderízalo con `<MapKitMapView>`. Dale una prop `style` para que ocupe toda la pantalla.

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

### Paso 4: Coloca un marcador

Crea el estado del marcador con `createMarkerState` y regístralo con `<Marker>`. Escribe las superposiciones como **elementos hijos** del componente del mapa.

```tsx
import { useMemo } from 'react';
import { createMarkerState } from '@mapconductor/js-sdk-core';
import { Marker } from '@mapconductor/js-sdk-react';

// ...dentro de App...
const marker = useMemo(
  () => createMarkerState({ id: 'hello', position: TOKYO }),
  [],
);

// ...dentro de return...
<MapKitMapView state={mapViewState} style={{ width: '100vw', height: '100vh' }}>
  <Marker state={marker} />
</MapKitMapView>
```

### Paso 5: Muestra un InfoBubble al hacer clic

Guarda el estado de selección con `useState`, ponlo en true en el `onClick` del marcador y renderiza `<InfoBubble>` solo mientras está seleccionado. Este es el resultado final.

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

### Puntos clave

- Las coordenadas, cámaras y marcadores se crean con funciones de `js-sdk-core`
  (**independiente del proveedor**).
- El componente del mapa y los hooks vienen de `react-for-mapkit`
  (**específico del proveedor**).
- Escribe las superposiciones como **elementos hijos** del componente del mapa.
- Controla mostrar / ocultar con `useState` de React.

## Notas

- MapKit JS es un mapa 2D: `tilt` (inclinación) no tiene representación nativa y se conserva solo para la fidelidad de ida y vuelta de `MapCameraPosition`.
- La URL de imagen de un `ImageAnnotation` es fija al crearlo, así que cambiar el icono de un marcador recrea la anotación; los cambios de posición se actualizan en el lugar.

## Paquetes relacionados

- [`@mapconductor/js-sdk-core`](https://github.com/mapconductor/js-sdk-core) — primitivas de geometría, cámara y estado
- [`@mapconductor/js-sdk-react`](https://github.com/mapconductor/js-sdk-react) — `Marker`, `Markers`, formas y burbujas de información compartidos
