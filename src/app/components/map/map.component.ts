// map.component.ts

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
import { MapService } from "../../services/map.service";
import { gpx } from "@mapbox/leaflet-omnivore";
import { AdditionalGpxElement } from "../../model/intern/additional-element";
import { GpxDataMap } from "./../../services/gpx-data-map.service";

import {Logger, LogLevel} from "../../utils/logger.util";

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

  // ✅ Zoom tracking additions
  zoomLevel: number;
  zoomLevel$ = new ReplaySubject<number>(1);
  @Output() zoomLevelChange = new EventEmitter<number>();

  private lastZoomLevel?: number;

  /* 
    constructor() is called first – when Angular instantiates the component class.
  */
  constructor(
    private readonly configurationService: ConfigurationService,
    private store: Store<any>,   
    private mapService: MapService // <-- add this! 
  ) {
    this.bindToStore();
  }

  
 
  /* 
    ngAfterViewInit() is called after the component's view (and all child views) 
    has been fully initialized.
    You're using it to set up the Leaflet map after the DOM element with id "map" exists.
  */
  ngAfterViewInit(): void {

    Logger.debug(`ngAfterViewInit`);

    let mapHandler = L.map("map", {
      zoom: this.zoomLevel ?? 12,  // pull from store, fallback if needed
    });

    // for future use
    /*
      setMap makes the map available through a service (likely used across other components/services).
    */
    this.mapService.setMap(mapHandler);
    
    /*
    MapComponent.addOsmLayer(mapHandler);
    */
    this.addOsmLayer(mapHandler);

    // Track zoom level
    if (true) {
      // initialize local zoom state by pulling the initial zoom from the map
      this.zoomLevel = mapHandler.getZoom();
      // a Subject or BehaviorSubject for internal reactivity
      this.zoomLevel$.next(this.zoomLevel);
      // an @Output() for parent components to react.
      this.zoomLevelChange.emit(this.zoomLevel);
  
      // Zoom Change Listener
      mapHandler.on("zoomend", () => {
        this.zoomLevel = mapHandler.getZoom();
        Logger.debug(`>>> Zoom level changed from ${this.lastZoomLevel} to: ${this.zoomLevel}`);
        // Pushes the new value to internal observers & event emitters.
        this.zoomLevel$.next(this.zoomLevel);
        this.zoomLevelChange.emit(this.zoomLevel);
        
        // Dispatches it to NgRx, which triggers reducer and updates global state.
        this.store.dispatch(
          UiActions.updateZoomLevel({ zoomLevel: this.zoomLevel })
        );
        
     });
    }

    /*
      Conditional Area Selection Tool
    */
    let areaSelectHandler;
    let areaSelectHandlerSubscriptions = [];    
    this.active$.subscribe((active) => {
      if (active) {
        Logger.trace("Conditional Area Selection Tool active: " + active);
        if (!areaSelectHandler) {
          areaSelectHandler = L.areaSelect({ keepAspectRatio: true });
          areaSelectHandler.addTo(mapHandler);
          areaSelectHandlerSubscriptions = this.handleSelectedAreaUpdate(
            mapHandler,
            areaSelectHandler
          );
        }
      } else {
        Logger.trace("Conditional Area Selection Tool active: " + active);
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
    if (true) {
      // original
      // TODO: refactor direct binding to store to make map component reusable
      this.store
      .select(currentMapProject)
      .pipe(
          distinctUntilChanged((previousValue, nextValue) =>
              isEqual(previousValue, nextValue))
      )
      .subscribe(nextCurrentMapProject => {
          if (nextCurrentMapProject) {
              this.centerCoordinates = L.latLng(nextCurrentMapProject.center.latitude, nextCurrentMapProject.center.longitude);
              let factor = getScaleProperties(nextCurrentMapProject.scale).reductionFactor / 1000;
              this.selectedArea = {
                  width: (nextCurrentMapProject.widthInMm - nextCurrentMapProject.leftMarginInMm - nextCurrentMapProject.rightMarginInMm) * factor,
                  height: (nextCurrentMapProject.heightInMm - nextCurrentMapProject.topMarginInMm - nextCurrentMapProject.bottomMarginInMm) * factor
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
                  let defaultCoordinates = this.configurationService.appConf.defaultCoordinates;
                  this.centerCoordinates =
                      L.latLng(defaultCoordinates.latitude, defaultCoordinates.longitude);
              }
              this.selectedArea = undefined;
              this.scale = undefined;
          }
      });
  this.store.select(currentAdditionalGpxElements).subscribe(additionalGpxElements => {
      this.updateGpxTracks(additionalGpxElements);
  });
  this.centerCoordinatesChange
      .pipe(
          distinctUntilChanged((previousValue, nextValue) =>
              isEqual(previousValue, nextValue))
      )
      .subscribe(nextCenterCoordinates => this.store.dispatch(
          UiActions.updateCenterCoordinates({
              center: {
                  latitude: nextCenterCoordinates.lat,
                  longitude: nextCenterCoordinates.lng
              }
          })
      ));
  this.selectedAreaChange
      .pipe(
          distinctUntilChanged((previousValue, nextValue) =>
              isEqual(previousValue, nextValue))
      )
      .subscribe(nextSelectedAreaInM => this.store.dispatch(
          UiActions.updateSelectedArea({
              widthInM: nextSelectedAreaInM.width,
              heightInM: nextSelectedAreaInM.height,
              topMarginInMm: this.topMarginInMm,
              bottomMarginInMm: this.bottomMarginInMm,
              leftMarginInMm: this.leftMarginInMm,
              rightMarginInMm: this.rightMarginInMm,
              scale: this.scale
          })
      ));      
    } else {
          // comment by Lucien Weller
        // TODO: refactor direct binding to store to make map component reusable

        /*
            Selecting the currentMapProject from the Store

            Purpose: 
            This part listens for changes in currentMapProject in the store, 
            and whenever the state of currentMapProject changes, 
            it updates the component properties 
            (such as centerCoordinates, selectedArea, scale, and others) to reflect the new values.

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
          if (nextCurrentMapProject) {
            this.centerCoordinates = L.latLng(
              nextCurrentMapProject.center.latitude,
              nextCurrentMapProject.center.longitude
            );

            /*
            // ✅ Restore zoom level from store or default to 12
            this.zoomLevel = nextCurrentMapProject.zoomLevel ?? 12;       
            // ✅ ADD THIS: Immediately push zoom level to the subject
            Logger.debug(`>>> [Store] pushing zoomLevel: ${this.zoomLevel}`);
            this.zoomLevel$.next(this.zoomLevel);
            this.zoomLevelChange.emit(this.zoomLevel);
            */
          if (true) {
            const newZoomLevel = nextCurrentMapProject.zoomLevel ?? 12;

          if (newZoomLevel !== this.lastZoomLevel) {
            Logger.debug(`>>> [Store] pushing zoomLevel: ${newZoomLevel}`);
            this.zoomLevel$.next(newZoomLevel);
            this.zoomLevelChange.emit(newZoomLevel);
            this.lastZoomLevel = newZoomLevel;
          }

            this.zoomLevel = newZoomLevel;
          }

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
      /*
          this.store.select(currentAdditionalGpxElements):
              This is selecting the currentAdditionalGpxElements from the NgRx store. 
              this.store is the instance of the Store service in Angular, 
              which provides access to the application state.
              The select() method is used to subscribe to a specific slice of the state, 
              in this case, the currentAdditionalGpxElements. 
              It allows you to get a stream of updates to that state.
          
          .subscribe((additionalGpxElements) => { ... }):
              After selecting the state (currentAdditionalGpxElements), 
              .subscribe() is used to listen to any changes in that part of the store. 
              When the currentAdditionalGpxElements state changes, 
              the callback function inside subscribe gets triggered.
              The argument additionalGpxElements inside the callback 
              represents the current value of currentAdditionalGpxElements 
              from the store at that moment. 
              This will be passed each time the state is updated.

          Logger.debug(...):
              This logs a message to the console every time the currentAdditionalGpxElements changes. 
              It appears to be primarily for debugging purposes 
              and allows you to observe when this part of the state is updated.

          this.updateGpxTracks(additionalGpxElements):
              After logging the state, the code calls this.updateGpxTracks(additionalGpxElements) 
              with the latest additionalGpxElements.
              This suggests that the method updateGpxTracks is responsible 
              for updating or rendering GPX tracks on a map 
              or processing the additionalGpxElements in some other way.
              The method likely takes the additionalGpxElements data 
              and uses it to update the UI (for example, plotting the GPX tracks on a map).
      */
      /*
          What Happens When the State Changes?
              
          Whenever the currentAdditionalGpxElements in the store is updated:
              The select() method fetches the new value of currentAdditionalGpxElements.
              The subscribe() callback is triggered, 
              and the new value of additionalGpxElements is passed to the callback function.
              The console.log prints a message showing that the store has been updated.
              The updateGpxTracks() method is called to update the GPX tracks based on the new data.
      */
      /*
      this.store
        .select(currentAdditionalGpxElements)
        .subscribe((additionalGpxElements) => {
          this.updateGpxTracks(additionalGpxElements);
        });
      */
      /*
        Ah, I see! 
        You want to pass both the id of the currentMapProject 
        and the additionalGpxElements to the updateGpxTracks method.
        You can achieve this by subscribing to both the currentMapProject 
        and the currentAdditionalGpxElements from the store, 
        and passing both values together to the updateGpxTracks method.
      */
      // Subscribe to both observables
      this.store
        .select(currentMapProject) // Select currentMapProject from the store
        .pipe(
          filter((currentMapProject) => !!currentMapProject) // Ensure the map project exists
        )
        .subscribe((currentMapProject) => {
          // Select additionalGpxElements from the store
          this.store
            .select(currentAdditionalGpxElements) // Select the additionalGpxElements from the store
            .pipe(
              filter((additionalGpxElements) => !!additionalGpxElements) // Ensure that additionalGpxElements exist
            )
            .subscribe((additionalGpxElements) => {
              // Now, call updateGpxTracks with both the id and the additionalGpxElements
              if (currentMapProject && additionalGpxElements) {
                const mapProjectId = currentMapProject.id;
                this.updateGpxTracks(additionalGpxElements);
                //this.test_updateGpxTracks(mapProjectId, additionalGpxElements);
              }
            });
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
  }

  // called from bindToStore (where listens for changes in currentAdditionalGpxElements)
  private updateGpxTracks(additionalGpxElements: AdditionalGpxElement[]) {
    
    Logger.debug(`>>> updateGpxTracks for ${additionalGpxElements.length} tracks`);

    let gpxElementIdsToRemove = new Set<string>(
      this.gpxTrackHandlerByElementId.keys()
    );
    additionalGpxElements.forEach((additionalGpxElement) => {
      if (additionalGpxElement.file?.data) {
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
          Logger.trace(">>> updateGpxTracks remove file.name:" + additionalGpxElement.file.name + " , id: " + additionalGpxElement.id);
          currentGpxTrackHandler.remove();
        }
        if (!currentGpxTrackHandler || modified) {
          let gpxTrackHandler = gpx.parse(additionalGpxElement.file.data);
          gpxTrackHandler.setStyle(() => style);
          gpxTrackHandler.addTo(this.mapHandler);
          Logger.debug(">>> !!! updateGpxTracks to display track add file.name: " + additionalGpxElement.file.name + " , id: " + additionalGpxElement.id);
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
      }
    });
    gpxElementIdsToRemove.forEach((id) => {
      let gpxHandler = this.gpxTrackHandlerByElementId.get(id);
      if (gpxHandler) {
        gpxHandler.remove();
        Logger.trace(">>> updateGpxTracks remove id:" + id);
      }
      this.gpxTrackHandlerByElementId.delete(id);
      Logger.trace(">>> updateGpxTracks delete id:" + id);
    });
  }

  // Hmmm ???
  /*
    // remove all layers
    this.mapHandler.eachLayer(function(layer) {
      this.mapHandler.removeLayer(layer);  // Remove each layer
    });

  */

  private handleCenterCoordinatesUpdate(mapHandler: L.Map) {
    Logger.debug(">>> map.component in function handleCenterCoordinatesUpdate");
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
    Logger.debug(">>> syncModelToMap ...");
    if (true) {
      // original
      startSyncModelToMap
            .pipe(switchMap(() => this.centerCoordinates$
                    .pipe(
                        skip(1),
                        takeUntil(endSyncModelToMap),
                        distinctUntilChanged((previousValue, nextValue) =>
                            isEqual(previousValue, nextValue))
                    )
                )
            )
            .subscribe(nextMapCenter => mapHandler.panTo(nextMapCenter, {noMoveStart: true}));
        startSyncModelToMap.next();
        this.centerCoordinates$.next(this.centerCoordinates);   
    } else {
      if (true) {
        // ✅ Sync CENTER from model to map
        /* 
          startSyncModelToMap: 
          This is a Subject or BehaviorSubject (or some other observable) 
          that acts as the trigger for the synchronization process. 
          Calling startSyncModelToMap.next() starts the synchronization flow.
          When startSyncModelToMap emits a value, the observable pipeline 
          (that follows .pipe(...)) will be triggered.
        */
        startSyncModelToMap
        /* 
          .pipe: 
          This is an operator that allows you to chain multiple operators on an observable 
          to transform the data or control the flow.
        */
        .pipe(
          /*
            switchMap(() => ...): 
            switchMap is an RxJS operator that switches from one observable to another. 
            In this case, it switches to this.centerCoordinates$, 
            which is an observable that emits the map's center coordinates.
            When startSyncModelToMap emits a value, it subscribes to this.centerCoordinates$.
          */
          switchMap(() =>
            /*
              this.centerCoordinates$:
              This is an observable that emits the current map center coordinates (lat, lng). 
              It’s presumably updated elsewhere in your code whenever the center coordinates change.
              The switchMap operator subscribes to this.centerCoordinates$ 
              and makes sure the map’s center is updated with these new coordinates.
           */
            this.centerCoordinates$
            .pipe(
              /* 
                skip(1):
                this operator is used to skip the first emission. 
                It's typically used to ignore the initial value emitted by the observable 
                (often the initial value of this.centerCoordinates$).
                In this case, it skips the first emitted value 
                so that it doesn't update the map with potentially stale or default coordinates 
                when the sync starts.
              */
              skip(1),
              /*
                takeUntil(endSyncModelToMap):
                This operator ensures that the observable will continue emitting values 
                until endSyncModelToMap emits a value (or is completed).
                Once endSyncModelToMap emits a value, 
                the subscription to this.centerCoordinates$ will be unsubscribed, 
                and synchronization will stop.
              */
              takeUntil(endSyncModelToMap),
              /*
                distinctUntilChanged((prev, next) => isEqual(prev, next)):
                This operator ensures that only distinct (i.e., changed) values will trigger an update.
                The isEqual function is used to perform a deep comparison 
                between the previous and the next values. 
                If the coordinates haven’t changed (i.e., isEqual returns true), 
                the update will be skipped.
                This prevents unnecessary updates to the map if the center coordinates are the same. 
              */
              distinctUntilChanged((prev, next) => isEqual(prev, next))
            )
          )
        )
        /*
          subscribe((nextMapCenter) => {...}):
          When a new center coordinate is emitted by this.centerCoordinates$ 
          (and it’s different from the previous one), 
          the subscribe block is triggered with nextMapCenter as the new coordinates.
          Inside this block:
            Logger.debug(...) logs the new center coordinates to the console for debugging purposes.
            mapHandler.panTo(nextMapCenter, { animate: false, noMoveStart: true }):
            panTo(nextMapCenter) moves the map’s center to the new coordinates.
            { animate: false } disables animation when panning to the new coordinates.
            { noMoveStart: true } prevents triggering the moveStart event 
             when panning (this can be useful to avoid triggering unnecessary events or reactions).
        */
        .subscribe((nextMapCenter) => {
          Logger.debug(
            `>>> Sync center to map: lat=${nextMapCenter.lat}, lng=${nextMapCenter.lng}`
          );
          mapHandler.panTo(nextMapCenter, { animate: false, noMoveStart: true });
        });

        // ✅ Sync ZOOM from model to map
        startSyncModelToMap
          .pipe(
            switchMap(() =>
              this.zoomLevel$.pipe(
                //skip(1), // Skip initial emission
                tap((val) => {
                  // Log the emitted zoom level to confirm it's being emitted
                  Logger.debug("*** zoomLevel$ emitted: ", val);
                }),
                takeUntil(endSyncModelToMap),
                distinctUntilChanged() // Only emit when the zoom level changes
              )
            )
          )
          .subscribe((nextZoomLevel) => {
            // Check if mapHandler is available
            Logger.debug('Map handler available:', mapHandler);

            if (mapHandler) {
              Logger.debug(`>>> Sync zoom to map: ${nextZoomLevel}`);
              mapHandler.setZoom(nextZoomLevel, { animate: false });
            } else {
              Logger.error("Map handler is undefined or null");
            }
          });

        // ✅ To start syncing (e.g., in ngAfterViewInit or after map init)
        startSyncModelToMap.next();

        // Optional: Push current values to begin with
        this.centerCoordinates$.next(this.centerCoordinates);
        this.zoomLevel$.next(this.zoomLevel);

        // ✅ To stop syncing
        // endSyncModelToMap.next();
      } else {
        startSyncModelToMap
        .pipe(
          /*
          tap(() => {  
            const zoom = mapHandler.getZoom();
            Logger.debug(
              `*** syncModelToMap mapHandler.getZoom(): ${zoom}}`
            );
          }),
          */
         /*
          tap(() => {  
            const center = mapHandler.getCenter();
            Logger.debug(
              `*** syncModelToMap mapHandler.getCenter(): ${center}}`
            );
          }),
          */

          // Combine both centerCoordinates$ and zoomLevel$
          switchMap(() =>
            combineLatest([
              this.centerCoordinates$.pipe(
                //skip(1),
                takeUntil(endSyncModelToMap),
                distinctUntilChanged((a, b) => isEqual(a, b))
              ),
              this.zoomLevel$.pipe(
                skip(1),
                takeUntil(endSyncModelToMap)
              )
            ])
          )
        )
        .subscribe(([nextMapCenter, zoomLevel]) => {
          Logger.debug(`>>> panTo() called with lat=${nextMapCenter.lat}, lng=${nextMapCenter.lng}`);
          Logger.debug(`>>> mapHandler.getZoom()=${mapHandler.getZoom()}`);
          Logger.debug(`>>> expected zoomLevel=${zoomLevel}`);
    
          // Pan to the new center
          mapHandler.panTo(nextMapCenter, { noMoveStart: true });
    
          // Apply zoom if needed
          if (mapHandler.getZoom() !== zoomLevel) {
            Logger.debug(`>>> setting zoomLevel to ${zoomLevel}`);
            mapHandler.setZoom(zoomLevel);
          }
        });
    
        // Trigger initial emission
        startSyncModelToMap.next();
      
        // Push current state to subjects
        this.centerCoordinates$.next(this.centerCoordinates);
        this.zoomLevel$.next(this.zoomLevel);
      }
      }
      
  }

  private syncMapToModel(
    mapHandler: L.Map,
    startSyncModelToMap: Subject<any>,
    endSyncModelToMap: Subject<any>
  ) {
    Logger.debug(">>> syncMapToModel ...");
    if (false) {
      // original
      fromEvent(mapHandler, "movestart")
            .pipe(
                tap(() => endSyncModelToMap.next()),
                switchMap(() => fromEvent(mapHandler, "move")
                    .pipe(
                        takeUntil(fromEvent(mapHandler, "moveend").pipe(bufferCount(1))),
                        finalize(() => startSyncModelToMap.next())
                    )
                ),
                map(event => (event as L.LeafletEvent).target.getCenter())
            )
            .subscribe(nextCenterCoordinates => {
                if (!isEqual(this.centerCoordinates, nextCenterCoordinates)) {
                    this.centerCoordinates = nextCenterCoordinates;
                    this.centerCoordinatesChange.emit(nextCenterCoordinates);
                }
            });
    } else {
      fromEvent(mapHandler, "movestart")
      .pipe(
        tap(() => Logger.debug("*** syncMapToModel mapHandler.getZoom(): " + mapHandler.getZoom())),
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

  /*
  xgadkob 20260408
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
  */
  private static moveCoordinate(
    origin: L.LatLng,
    distanceInM: number,
    azimuth: number
  ): L.LatLng {

    const result = Geodesic.WGS84.Direct(
      origin.lat,
      origin.lng,
      azimuth,
      distanceInM
    ) as unknown as { lat2: number; lon2: number };

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
        //tap(() => Logger.debug("syncModelToAreaSelect zoom " + mapHandler.getZoom())), // HACK !!!
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

  /*
  private static aaaddOsmLayer(mapHandler: L.Map) {
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors |' +
        ' Rendering powered by <a href="https://printmaps-osm.de">printmaps-osm.de</a>',
    }).addTo(mapHandler);
  }
  */
  /*
  private addOsmLayer(mapHandler: L.Map) {
    const webUrl = this.configurationService.appConf.printmapsWebUri;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors | ' +
        `Rendering powered by <a href="${webUrl}" target="_blank">${webUrl}</a>`,
    }).addTo(mapHandler);
  }
  */
  private addOsmLayer(mapHandler: L.Map) {
    const webUrl = this.configurationService.appConf.printmapsWebUri;

    let displayText = webUrl;

    try {
      const url = new URL(webUrl);

      // remove protocol and optionally normalize hostname
      displayText = url.hostname.replace("printmaps.osm.de", "printmaps-osm.de");
    } catch {
      // fallback if URL parsing fails
      displayText = "printmaps-osm.de";
    }

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors | ' +
        `Rendering powered by <a href="${webUrl}" target="_blank">${displayText}</a>`,
    }).addTo(mapHandler);
  }
}
