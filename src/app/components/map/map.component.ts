import {
  AfterViewInit,
  Component,
  EventEmitter,
  Input,
  Output,
} from "@angular/core";
import { Store } from "@ngrx/store";
import { Geodesic } from "geographiclib";
import * as L from "leaflet";
import "@lweller/leaflet-areaselect";
import { isEqual } from "lodash";
import {
  combineLatest,
  fromEvent,
  merge,
  of,
  ReplaySubject,
  Subject,
  Subscription,
} from "rxjs";
import {
  bufferCount,
  distinctUntilChanged,
  filter,
  finalize,
  map,
  skip,
  switchMap,
  takeUntil,
  tap,
} from "rxjs/operators";
import { Subjectize } from "subjectize";
import * as UiActions from "../../actions/main.actions";
import {
  currentAdditionalGpxElements,
  currentMapProject,
} from "../../model/intern/printmaps-ui-state";
import { getScaleProperties, Scale } from "../../model/intern/scale";
import { ConfigurationService } from "../../services/configuration.service";
import { gpx } from "@mapbox/leaflet-omnivore";
import { AdditionalGpxElement } from "../../model/intern/additional-element";

import { LoggingService } from "./../../services/logging.service";
import { JsonStorageService } from "./../../services/json-storage.service";
import { GpxDataMap } from "./../../services/gpx-data-map.service";

@Component({
  selector: "app-map",
  template: '<div id="map"></div>',
  styles: ["#map { height: 100%;    width: 100%;}"],
})
export class MapComponent implements AfterViewInit {
  @Input() active: boolean;
  @Subjectize("active") active$ = new ReplaySubject(1);

  mapHandler: L.Map;
  gpxTrackHandlerByElementId: Map<string, any> = new Map<string, any>();

  gpxTrackLastUpdateByElementId: Map<string, number> = new Map<
    string,
    number
  >();

  @Input() centerCoordinates: L.LatLng;
  @Subjectize("centerCoordinates") centerCoordinates$ =
    new ReplaySubject<L.LatLng>(1);
  @Output() centerCoordinatesChange = new EventEmitter<L.LatLng>();

  @Input() selectedArea: L.Dimension;
  @Subjectize("selectedArea") selectedArea$ = new ReplaySubject<L.Dimension>(1);
  @Output() selectedAreaChange = new EventEmitter<L.Dimension>();

  topMarginInMm: number;
  bottomMarginInMm: number;
  leftMarginInMm: number;
  rightMarginInMm: number;

  @Input() scale: Scale;
  @Subjectize("scale") scale$ = new ReplaySubject<Scale>(1);

  constructor(
    private readonly configurationService: ConfigurationService,
    private store: Store<any>,
    private loggingService: LoggingService,
    private jsonStorageService: JsonStorageService
  ) {
    this.bindToStore();
  }

  private static addOsmLayer(mapHandler: L.Map) {
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors |' +
        ' Rendering powered by <a href="http://printmaps-osm.de">printmaps-osm.de (Klaus Tockloth)</a>',
    }).addTo(mapHandler);
  }

  private static addTestLayer(mapHandler: L.Map) {
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "Test",
    }).addTo(mapHandler);
  }

  ngAfterViewInit(): void {
    let mapHandler = L.map("map", { zoom: 12 });
    MapComponent.addOsmLayer(mapHandler);

    // ***********************************************
    if (false) {
      //MapComponent.addTestLayer(mapHandler);

      GpxDataMap.initialize(); // Make sure this is called once to set the initial GPX data
      // Retrieve the GPX XML data for 'Sperrung' and 'Sperrung2'
      let gpx1Xml = GpxDataMap.getGpxData("gpx1");
      let gpx2Xml = GpxDataMap.getGpxData("gpx2");

      console.log(
        `zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz ngAfterViewInit` +
          " gpx1Xml " +
          gpx1Xml
      );

      let gpx1TrackHandler = gpx.parse(gpx1Xml);
      gpx1TrackHandler.addTo(mapHandler); // !!!!!!!!!!!!!!!!!!!!!!!!!!!!!

      let gpx2TrackHandler = gpx.parse(gpx2Xml);
      gpx2TrackHandler.addTo(mapHandler); // !!!!!!!!!!!!!!!!!!!!!!!!!!!!!
    }
    // ***********************************************

    let areaSelectHandler;
    let areaSelectHandlerSubscriptions = [];
    this.active$.subscribe((active) => {
      if (active) {
        if (!areaSelectHandler) {
          areaSelectHandler = L.areaSelect({ keepAspectRatio: true });
          areaSelectHandler.addTo(mapHandler);
          areaSelectHandlerSubscriptions = this.handleSelectedAreaUpdate(
            mapHandler,
            areaSelectHandler
          );
        }
      } else {
        if (areaSelectHandler) {
          areaSelectHandler.remove();
        }
        for (let areaSelectHandlerSubscription of areaSelectHandlerSubscriptions) {
          areaSelectHandlerSubscription.unsubscribe();
        }
        areaSelectHandler = undefined;
        areaSelectHandlerSubscriptions = [];
      }
    });

    this.handleCenterCoordinatesUpdate(mapHandler);
    this.mapHandler = mapHandler;
  }

  /*
    The bindToStore function in your map.component.ts file is a method 
    that binds the component's properties to the NgRx store 
    and listens for changes in specific pieces of state. 
    It ensures that when the state in the store changes, 
    the component updates accordingly. 
    Additionally, it dispatches actions to update the store 
    whenever certain component properties change.
  */
  private bindToStore() {
    // TODO: refactor direct binding to store to make map component reusable

    console.log(
      `zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz map.component.ts bindToStore`
    );

    /*
        Selecting the currentMapProject from the Store

        Purpose: 
        This part listens for changes in currentMapProject in the store, and whenever the state of currentMapProject changes, it updates the component properties (such as centerCoordinates, selectedArea, scale, and others) to reflect the new values.

        Key points:
        this.store.select(currentMapProject): This selects the current map project from the store.
        distinctUntilChanged: Ensures the component only reacts to changes in the state 
            that are different from the previous value. 
            It prevents unnecessary updates when the state hasn't actually changed.
        isEqual: A utility from lodash used to compare the current and previous values deeply.
        When the map project exists (nextCurrentMapProject is truthy), 
        it updates several properties such as the map's center coordinates, scale, and margins. 
        If there is no map project, it resets the relevant properties to their defaults.
    */
    this.store
      .select(currentMapProject)
      .pipe(
        distinctUntilChanged((previousValue, nextValue) =>
          isEqual(previousValue, nextValue)
        )
      )
      .subscribe((nextCurrentMapProject) => {
        console.log(
          `zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz map.components this.store.select(currentMapProject)`
        );

        if (nextCurrentMapProject) {
          this.centerCoordinates = L.latLng(
            nextCurrentMapProject.center.latitude,
            nextCurrentMapProject.center.longitude
          );
          let factor =
            getScaleProperties(nextCurrentMapProject.scale).reductionFactor /
            1000;
          this.selectedArea = {
            width:
              (nextCurrentMapProject.widthInMm -
                nextCurrentMapProject.leftMarginInMm -
                nextCurrentMapProject.rightMarginInMm) *
              factor,
            height:
              (nextCurrentMapProject.heightInMm -
                nextCurrentMapProject.topMarginInMm -
                nextCurrentMapProject.bottomMarginInMm) *
              factor,
          };
          this.topMarginInMm = nextCurrentMapProject.topMarginInMm;
          this.bottomMarginInMm = nextCurrentMapProject.bottomMarginInMm;
          this.leftMarginInMm = nextCurrentMapProject.leftMarginInMm;
          this.rightMarginInMm = nextCurrentMapProject.rightMarginInMm;
          this.scale = nextCurrentMapProject.scale;
          this.active = true;
        } else {
          this.active = false;
          if (!this.centerCoordinates) {
            let defaultCoordinates =
              this.configurationService.appConf.defaultCoordinates;
            this.centerCoordinates = L.latLng(
              defaultCoordinates.latitude,
              defaultCoordinates.longitude
            );
          }
          this.selectedArea = undefined;
          this.scale = undefined;
        }
      });

    /*
        Selecting currentAdditionalGpxElements from the Store

        Purpose: 
        This part listens for changes in currentAdditionalGpxElements in the store 
        and updates the GPX tracks on the map whenever they change.

        Key points:
        this.store.select(currentAdditionalGpxElements): Selects the GPX elements from the store.
        this.updateGpxTracks(additionalGpxElements): 
            Calls a method to update the GPX tracks on the map with the new GPX data.
    */
    this.store
      .select(currentAdditionalGpxElements)
      .subscribe((additionalGpxElements) => {
        console.log(
          `zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz map.components this.store.select(currentAdditionalGpxElements)`
        );

        this.updateGpxTracks(additionalGpxElements);
      });

    /*
      Handling centerCoordinatesChange
    */
    this.centerCoordinatesChange
      .pipe(
        distinctUntilChanged((previousValue, nextValue) =>
          isEqual(previousValue, nextValue)
        )
      )
      .subscribe((nextCenterCoordinates) =>
        this.store.dispatch(
          UiActions.updateCenterCoordinates({
            center: {
              latitude: nextCenterCoordinates.lat,
              longitude: nextCenterCoordinates.lng,
            },
          })
        )
      );

    /*
      Handling selectedAreaChange
    */
    this.selectedAreaChange
      .pipe(
        distinctUntilChanged((previousValue, nextValue) =>
          isEqual(previousValue, nextValue)
        )
      )
      .subscribe((nextSelectedAreaInM) =>
        this.store.dispatch(
          UiActions.updateSelectedArea({
            widthInM: nextSelectedAreaInM.width,
            heightInM: nextSelectedAreaInM.height,
            topMarginInMm: this.topMarginInMm,
            bottomMarginInMm: this.bottomMarginInMm,
            leftMarginInMm: this.leftMarginInMm,
            rightMarginInMm: this.rightMarginInMm,
            scale: this.scale,
          })
        )
      );
  }

  private updateGpxTracks_orig(additionalGpxElements: AdditionalGpxElement[]) {
    let gpxElementIdsToRemove = new Set<string>(
      this.gpxTrackHandlerByElementId.keys()
    );

    additionalGpxElements.forEach((additionalGpxElement) => {
      console.log(
        `zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz updateGpxTracks` +
          " additionalGpxElement.id " +
          additionalGpxElement.id
      );
      console.log(
        `zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz updateGpxTracks` +
          " additionalGpxElement.file?.name " +
          additionalGpxElement.file?.name
      );

      if (additionalGpxElement.file?.data) {
        this.jsonStorageService.storeJsonData(
          additionalGpxElement.file?.name,
          additionalGpxElement.file?.data
        );

        gpxElementIdsToRemove.delete(additionalGpxElement.id);
        let style = {
          weight: additionalGpxElement.style.lineWidth,
          color: additionalGpxElement.style.lineColor.rgbHexValue,
          opacity: additionalGpxElement.style.lineColor.opacity,
        };
        let currentGpxTrackHandler = this.gpxTrackHandlerByElementId.get(
          additionalGpxElement.id
        );
        let lastUpdate =
          this.gpxTrackLastUpdateByElementId.get(additionalGpxElement.id) ??
          new Date().getTime();
        let modified = additionalGpxElement.file.modified > lastUpdate;
        if (currentGpxTrackHandler && modified) {
          currentGpxTrackHandler.remove();
        }
        if (!currentGpxTrackHandler || modified) {
          let gpxTrackHandler = gpx.parse(additionalGpxElement.file.data);
          gpxTrackHandler.setStyle(() => style);
          gpxTrackHandler.addTo(this.mapHandler); // !!!!!!!!!!!!!!!!!!!!!!!!!!!!!
          this.gpxTrackHandlerByElementId.set(
            additionalGpxElement.id,
            gpxTrackHandler
          );
          this.gpxTrackLastUpdateByElementId.set(
            additionalGpxElement.id,
            additionalGpxElement.file.modified
          );
        } else {
          currentGpxTrackHandler.setStyle(() => style);
        }
      } else {
        console.log(
          `zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz updateGpxTracks else`
        );
      }
    });
    gpxElementIdsToRemove.forEach((id) => {
      let gpxHandler = this.gpxTrackHandlerByElementId.get(id);
      if (gpxHandler) {
        gpxHandler.remove();
      }
      this.gpxTrackHandlerByElementId.delete(id);
    });
  }

  private updateGpxTracks(additionalGpxElements: AdditionalGpxElement[]) {
    let gpxElementIdsToRemove = new Set<string>(
      this.gpxTrackHandlerByElementId.keys()
    );

    console.log(
      `!!!!!!!!!! zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz updateGpxTracks` +
        " top gpxElementIdsToRemove: " +
        [...gpxElementIdsToRemove]
    );

    additionalGpxElements.forEach((additionalGpxElement) => {
      console.log(
        `zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz updateGpxTracks` +
          " additionalGpxElement.id " +
          additionalGpxElement.id
      );
      console.log(
        `zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz updateGpxTracks` +
          " additionalGpxElement.file?.name " +
          additionalGpxElement.file?.name
      );

      // Hack !!!
      /*
            if (additionalGpxElement.file?.name) {
                if (additionalGpxElement.file.data) {
                    console.log('additionalGpxElement.file.data:', additionalGpxElement.file.data);
                } else {
                    this.jsonStorageService.getJsonData(additionalGpxElement.file.name);
                    console.log('Updated data:', additionalGpxElement.file.data);
                }
            } else {
                console.log('No file name found for the GPX element.');
            } 
            */

      if (additionalGpxElement.file?.data) {
        this.jsonStorageService.storeJsonData(
          additionalGpxElement.file?.name,
          additionalGpxElement.file?.data
        );

        gpxElementIdsToRemove.delete(additionalGpxElement.id);
        let style = {
          weight: additionalGpxElement.style.lineWidth,
          color: additionalGpxElement.style.lineColor.rgbHexValue,
          opacity: additionalGpxElement.style.lineColor.opacity,
        };
        let currentGpxTrackHandler = this.gpxTrackHandlerByElementId.get(
          additionalGpxElement.id
        );
        let lastUpdate =
          this.gpxTrackLastUpdateByElementId.get(additionalGpxElement.id) ??
          new Date().getTime();
        let modified = additionalGpxElement.file.modified > lastUpdate;
        if (currentGpxTrackHandler && modified) {
          //currentGpxTrackHandler.remove();
        }
        if (!currentGpxTrackHandler || modified) {
          let gpxTrackHandler = gpx.parse(additionalGpxElement.file.data);
          gpxTrackHandler.setStyle(() => style);
          gpxTrackHandler.addTo(this.mapHandler); // !!!!!!!!!!!!!!!!!!!!!!!!!!!!!

          GpxDataMap.addGpxData(
            gpxTrackHandler,
            additionalGpxElement.file?.data
          );

          this.gpxTrackHandlerByElementId.set(
            additionalGpxElement.id,
            gpxTrackHandler
          ); // !!!!!!!!!!!!!!!!!!!!!
          this.gpxTrackLastUpdateByElementId.set(
            additionalGpxElement.id,
            additionalGpxElement.file.modified
          );
        } else {
          currentGpxTrackHandler.setStyle(() => style);
        }
      } else {
        console.log(
          `zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz updateGpxTracks else`
        );
      }
    });

    console.log(
      `zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz updateGpxTracks` +
        " buttom gpxElementIdsToRemove: " +
        [...gpxElementIdsToRemove]
    );
    gpxElementIdsToRemove.forEach((id) => {
      let gpxHandler = this.gpxTrackHandlerByElementId.get(id);
      if (gpxHandler) {
        console.log(
          `zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz updateGpxTracks remove id: ` +
            id
        );

        //gpxHandler.remove();
      }
      //this.gpxTrackHandlerByElementId.delete(id);
    });
  }

  private handleCenterCoordinatesUpdate(mapHandler: L.Map) {
    let endSyncModelToMap = new Subject();
    let startSyncModelToMap = new Subject();
    this.syncModelToMap(mapHandler, startSyncModelToMap, endSyncModelToMap);
    this.syncMapToModel(mapHandler, startSyncModelToMap, endSyncModelToMap);
  }

  private syncModelToMap(
    mapHandler: L.Map,
    startSyncModelToMap: Subject<any>,
    endSyncModelToMap: Subject<any>
  ) {
    console.log(
      `zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz map.component.ts syncModelToMap`
    );

    startSyncModelToMap
      .pipe(
        switchMap(() =>
          this.centerCoordinates$.pipe(
            skip(1),
            takeUntil(endSyncModelToMap),
            distinctUntilChanged((previousValue, nextValue) =>
              isEqual(previousValue, nextValue)
            )
          )
        )
      )
      .subscribe((nextMapCenter) =>
        mapHandler.panTo(nextMapCenter, { noMoveStart: true })
      );
    startSyncModelToMap.next();
    this.centerCoordinates$.next(this.centerCoordinates);
  }

  private syncMapToModel(
    mapHandler: L.Map,
    startSyncModelToMap: Subject<any>,
    endSyncModelToMap: Subject<any>
  ) {
    console.log(
      `zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz map.component.ts syncMapToModel`
    );

    fromEvent(mapHandler, "movestart")
      .pipe(
        tap(() => endSyncModelToMap.next()),
        switchMap(() =>
          fromEvent(mapHandler, "move").pipe(
            takeUntil(fromEvent(mapHandler, "moveend").pipe(bufferCount(1))),
            finalize(() => startSyncModelToMap.next())
          )
        ),
        map((event) => (event as L.LeafletEvent).target.getCenter())
      )
      .subscribe((nextCenterCoordinates) => {
        if (!isEqual(this.centerCoordinates, nextCenterCoordinates)) {
          this.centerCoordinates = nextCenterCoordinates;
          this.centerCoordinatesChange.emit(nextCenterCoordinates);
        }
      });
  }

  private handleSelectedAreaUpdate(
    mapHandler: L.Map,
    areaSelectHandler: L.AreaSelect
  ): Subscription[] {
    return [
      this.syncModelToAreaSelect(mapHandler, areaSelectHandler),
      this.syncAreaSelectToModel(areaSelectHandler, mapHandler),
    ];
  }

  private static convertRealWidthToPixels(
    mapHandler: L.Map,
    realWidthInM: number
  ): number {
    let center = mapHandler.getCenter();
    let west = MapComponent.moveCoordinate(center, realWidthInM / 2, 90);
    let east = MapComponent.moveCoordinate(center, realWidthInM / 2, 270);
    return Math.floor(
      Math.abs(mapHandler.project(west).x - mapHandler.project(east).x)
    );
  }

  private static convertRealHeightToPixels(
    mapHandler: L.Map,
    realHeightInM: number
  ): number {
    let center = mapHandler.getCenter();
    let north = MapComponent.moveCoordinate(center, realHeightInM / 2, 0);
    let south = MapComponent.moveCoordinate(center, realHeightInM / 2, 180);
    return Math.floor(
      Math.abs(mapHandler.project(north).y - mapHandler.project(south).y)
    );
  }

  private static moveCoordinate(
    origin: L.LatLng,
    distanceInM: number,
    azimuth: number
  ): L.LatLng {
    // noinspection TypeScriptValidateJSTypes
    let result = Geodesic.WGS84.Direct(
      origin.lat,
      origin.lng,
      azimuth,
      distanceInM
    );
    return L.latLng(result.lat2, result.lon2);
  }

  private static convertPixelWidthToRealLength(
    mapHandler: L.Map,
    widthInPixel: number
  ): number {
    let centerInPixel = mapHandler.project(mapHandler.getCenter());
    let halfWidth = widthInPixel / 2;
    let west = mapHandler.unproject(
      L.point(centerInPixel.x - halfWidth, centerInPixel.y)
    );
    let east = mapHandler.unproject(
      L.point(centerInPixel.x + halfWidth, centerInPixel.y)
    );
    return Geodesic.WGS84.Inverse(west.lat, west.lng, east.lat, east.lng).s12;
  }

  private static convertPixelHeightToRealLength(
    mapHandler: L.Map,
    heightInPixel: number
  ): number {
    let centerInPixel = mapHandler.project(mapHandler.getCenter());
    let halfHeight = heightInPixel / 2;
    let south = mapHandler.unproject(
      L.point(centerInPixel.x, centerInPixel.y - halfHeight)
    );
    let north = mapHandler.unproject(
      L.point(centerInPixel.x, centerInPixel.y + halfHeight)
    );
    return Geodesic.WGS84.Inverse(south.lat, south.lng, north.lat, north.lng)
      .s12;
  }

  private syncAreaSelectToModel(
    areaSelectHandler: L.AreaSelect,
    mapHandler: L.Map
  ): Subscription {
    return combineLatest([
      this.active$,
      fromEvent(mapHandler, "move"),
      this.scale$,
      fromEvent(areaSelectHandler, "resize"),
    ])
      .pipe(
        filter(([active]) => !!active),
        map(
          ([_, leafletEvent, scale]) =>
            [leafletEvent, scale, areaSelectHandler.getDimensions()] as [
              L.LeafletEvent,
              Scale,
              L.Dimension
            ]
        ),
        map(
          ([leafletEvent, scale, areaSelectDimensionInPx]) =>
            [
              {
                width: MapComponent.convertPixelWidthToRealLength(
                  leafletEvent.target,
                  areaSelectDimensionInPx.width
                ),
                height: MapComponent.convertPixelHeightToRealLength(
                  leafletEvent.target,
                  areaSelectDimensionInPx.height
                ),
              },
              areaSelectDimensionInPx,
              scale,
            ] as [L.Dimension, L.Dimension, Scale]
        ),
        filter(([selectedAreaInM, areaSelectDimensionInPx, scale]) => {
          let selectedAreaPrecision =
            getScaleProperties(scale).reductionFactor / 1000;
          return (
            Math.abs(selectedAreaInM.width - this.selectedArea.width) /
              selectedAreaPrecision >
              Math.pow(
                10,
                Math.ceil(
                  Math.log10(
                    selectedAreaInM.width /
                      selectedAreaPrecision /
                      areaSelectDimensionInPx.width
                  )
                )
              ) ||
            Math.abs(selectedAreaInM.height - this.selectedArea.height) /
              selectedAreaPrecision >
              Math.pow(
                10,
                Math.ceil(
                  Math.log10(
                    selectedAreaInM.height /
                      selectedAreaPrecision /
                      areaSelectDimensionInPx.height
                  )
                )
              )
          );
        }),
        map(([selectedAreaInM]) => selectedAreaInM)
      )
      .subscribe((nextSelectedAreaInM) => {
        this.selectedArea = nextSelectedAreaInM;
        this.selectedAreaChange.emit(nextSelectedAreaInM);
      });
  }

  private syncModelToAreaSelect(
    mapHandler: L.Map,
    areaSelectHandler: L.AreaSelect
  ): Subscription {
    return combineLatest([
      this.active$,
      merge(of({ target: mapHandler }), fromEvent(mapHandler, "move")),
      this.selectedArea$,
    ])
      .pipe(
        filter(([active]) => !!active),
        map(
          ([_, leafletEvent, selectedAreaInM]) =>
            [leafletEvent, selectedAreaInM] as [L.LeafletEvent, L.Dimension]
        ),
        map(([leafletEvent, selectedAreaInM]) => ({
          width: MapComponent.convertRealWidthToPixels(
            leafletEvent.target,
            selectedAreaInM.width
          ),
          height: MapComponent.convertRealHeightToPixels(
            leafletEvent.target,
            selectedAreaInM.height
          ),
        }))
      )
      .subscribe((nextAreaSelectDimensionInPx) =>
        areaSelectHandler.setDimensions(nextAreaSelectDimensionInPx)
      );
  }
}
