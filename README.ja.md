[English](https://github.com/MapConductor/react-for-mapkit/blob/main/README.md) | 日本語 | [Español (Latinoamérica)](https://github.com/MapConductor/react-for-mapkit/blob/main/README.es-419.md)

# @mapconductor/react-for-mapkit

MapConductor React SDK の Apple MapKit JS プロバイダです。Apple MapKit JS で MapConductor の地図を描画しますが、MapConductor のプロバイダ非依存なカメラ・マーカー・オーバーレイ API を通すため、同じアプリケーションコードが Google Maps、MapLibre、Mapbox、Leaflet、OpenLayers、ArcGIS、Cesium、HERE でもそのまま動作します。

## インストール

```shell
npm install @mapconductor/react-for-mapkit
```

`@mapconductor/js-sdk-core` と `@mapconductor/js-sdk-react`(マーカーなどの共有コンポーネントで使用)は依存関係として自動的にインストールされます。ただしアプリケーションコードはこの2つから直接 import するため、pnpm の strict(isolated)な `node_modules` を使う場合や、import するものをすべて明示的に宣言したい場合は、次のように明示的にインストールしてください:

```shell
npm install @mapconductor/react-for-mapkit @mapconductor/js-sdk-core @mapconductor/js-sdk-react
```

MapKit JS は実行時に Apple の CDN から読み込まれ、認可トークン(MapKit JS の JWT)が必要です。トークンはビューステート経由で渡します。

![](https://raw.githubusercontent.com/mapconductor/react-for-mapkit/docs/images/hello-map.jpg)

## Hello Map チュートリアル

MapConductor + Apple MapKit で作る、いちばん簡単な地図アプリです。マーカーをクリックすると「Hello, MapConductor」の吹き出しが出ます。この地図は、次の 5 ステップで作れます。Apple MapKit JS は MapKit JS のトークンが必要なので、それを設定すれば動きます。

### ステップ 1: React プロジェクトを作る

Vite で React + TypeScript のプロジェクトを作成します。

```shell
npm create vite@latest hello-map -- --template react-ts
cd hello-map
npm install
npm run dev
```

### ステップ 2: MapConductor（MapKit）をインストール

地図表示に必要なパッケージを入れます。ここでは Apple MapKit を使いますが、他の地図モジュールを使うこともできます。

```shell
npm install @mapconductor/react-for-mapkit
```

- `@mapconductor/react-for-mapkit` — Apple MapKit 用のコンポーネント/フック
- `@mapconductor/js-sdk-react` / `@mapconductor/js-sdk-core` は依存関係として自動的にインストールされます。
- MapKit JS のトークン(環境変数 `VITE_MAPKIT_TOKEN`)が必要です。MapKit JS はこのトークンでリクエストを認可します。

### ステップ 3: 地図を表示する

`useMapKitViewState` で地図の状態を作り、`<MapKitMapView>` で描画します。`style` プロパティを与えると全画面になります。

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

### ステップ 4: マーカーを置く

`createMarkerState` でマーカーの状態を作り、`<Marker>` で登録します。オーバーレイは地図コンポーネントの**子要素**として書きます。

```tsx
import { useMemo } from 'react';
import { createMarkerState } from '@mapconductor/js-sdk-core';
import { Marker } from '@mapconductor/js-sdk-react';

// ...App の中...
const marker = useMemo(
  () => createMarkerState({ id: 'hello', position: TOKYO }),
  [],
);

// ...return の中...
<MapKitMapView state={mapViewState} style={{ width: '100vw', height: '100vh' }}>
  <Marker state={marker} />
</MapKitMapView>
```

### ステップ 5: クリックで InfoBubble を表示する

選択中かどうかを `useState` で持ち、マーカーの `onClick` で true にします。選択中のときだけ `<InfoBubble>` を描画します。これが完成形です。

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

### ポイント

- 座標・カメラ・マーカーは `js-sdk-core` の関数で作る（**プロバイダー非依存**）
- 地図コンポーネントとフックは `react-for-mapkit` から来る（**プロバイダー固有**）
- オーバーレイは地図コンポーネントの**子要素**として書く
- 表示・非表示は React の `useState` で制御する

## 補足

- MapKit JS は 2D の地図です。`tilt`(傾き)にはネイティブの表現がなく、`MapCameraPosition` のラウンドトリップの整合性のためだけに保持されます。
- `ImageAnnotation` の画像 URL は生成時に固定されるため、マーカーのアイコンを変更するとアノテーションは作り直されます(位置の変更はその場で更新されます)。

## 関連パッケージ

- [`@mapconductor/js-sdk-core`](https://github.com/mapconductor/js-sdk-core) — ジオメトリ・カメラ・状態のプリミティブ
- [`@mapconductor/js-sdk-react`](https://github.com/mapconductor/js-sdk-react) — 共有の `Marker`・`Markers`・シェイプ・インフォバブル
