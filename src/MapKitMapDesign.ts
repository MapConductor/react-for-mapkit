import type { AttributionRule, MapDesignTypeInterface } from '@mapconductor/js-sdk-core';

/**
 * Web port of `MapKitMapDesign` (MapKitMapDesign.swift).
 *
 * On iOS the design identifier is an `MKMapType`; on the web it is the matching
 * `mapkit.Map.MapTypes` string. `mapkit.Map.MapTypes` constants are only defined
 * once the MapKit JS library has loaded, so each design stores a stable string
 * id and resolves the runtime constant lazily via {@link MapKitMapDesign.toMapType}.
 */
export type MapKitMapDesignTypeInterface = MapDesignTypeInterface<string>;

export type MapKitMapDesignType = MapKitMapDesignTypeInterface;

export class MapKitMapDesign implements MapKitMapDesignTypeInterface {
  readonly id: string;
  readonly attributionRules: readonly AttributionRule[];

  constructor(id: string, attributionRules: readonly AttributionRule[] = []) {
    this.id = id;
    this.attributionRules = attributionRules;
  }

  getValue(): string {
    return this.id;
  }

  static readonly Standard = new MapKitMapDesign('standard');
  static readonly Satellite = new MapKitMapDesign('satellite');
  static readonly Hybrid = new MapKitMapDesign('hybrid');
  // MapKit JS has no dedicated flyover map types (they are iOS 3D-only), so the
  // flyover designs resolve to their closest 2D equivalents while keeping the
  // same public names as the native SDK.
  static readonly SatelliteFlyover = new MapKitMapDesign('satelliteFlyover');
  static readonly HybridFlyover = new MapKitMapDesign('hybridFlyover');
  static readonly MutedStandard = new MapKitMapDesign('mutedStandard');

  private static readonly designs = new Map<string, MapKitMapDesign>(
    Object.values(MapKitMapDesign)
      .filter((value): value is MapKitMapDesign => value instanceof MapKitMapDesign)
      .map(value => [value.id, value]),
  );

  static Create(id: string): MapKitMapDesign {
    const design = MapKitMapDesign.designs.get(id);
    if (!design) throw new Error(`unknown design id: "${id}"`);
    return design;
  }

  static toMapDesignType(id: string): MapKitMapDesignType {
    return MapKitMapDesign.Create(id);
  }

  /** Resolve the runtime `mapkit.Map.MapTypes` string for a design. Must be
   * called after MapKit JS has loaded. */
  static toMapType(designType: MapKitMapDesignTypeInterface): string {
    const types = mapkit.Map.MapTypes;
    switch (designType.getValue()) {
      case 'satellite':
      case 'satelliteFlyover':
        return types.Satellite;
      case 'hybrid':
      case 'hybridFlyover':
        return types.Hybrid;
      case 'mutedStandard':
        return types.MutedStandard;
      case 'standard':
      default:
        return types.Standard;
    }
  }
}
