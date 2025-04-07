import { Injectable } from "@angular/core";
import { Actions, createEffect, ofType } from "@ngrx/effects";
import {
  concatMap,
  debounce,
  delay,
  distinctUntilChanged,
  expand,
  filter,
  groupBy,
  ignoreElements,
  map,
  mergeAll,
  switchMap,
  takeWhile,
  tap,
  catchError,
} from "rxjs/operators";
import { Store } from "@ngrx/store";
import { PrintmapsService } from "../services/printmaps.service";
import {
  currentMapProject,
  mapProjectReferences,
} from "../model/intern/printmaps-ui-state";
import * as UiActions from "../actions/main.actions";
import { of, timer, zip } from "rxjs";
import { MapProjectReferenceService } from "../services/map-project-reference.service";
import { isEqual } from "lodash";
import { MapProjectState } from "../model/intern/map-project-state";
import { ConfigurationService } from "../services/configuration.service";

// noinspection JSUnusedGlobalSymbols
@Injectable()
export class MainEffects {
  logActions = createEffect(
    () =>
      this.actions.pipe(
        tap((action) => {
          // Extract the ID part of the action type using regular expression
          const match = action.type.match(/"id":"([^"]+)"/);

          if (match) {
            const id = match[1]; // Extract the ID
            console.log(">>> Action Dispatched:", id);
          } else {
            console.log(">>> Action Dispatched, but ID not found in action type");
          }
        })
      ),
    { dispatch: false } // Don't dispatch anything, this is just for logging purposes
  );

  init = createEffect(() =>
    this.actions.pipe(
      ofType(UiActions.init),
      map(() =>
        UiActions.updateCenterCoordinates({
          center: this.configurationService.appConf.defaultCoordinates,
        })
      )
    )
  );

  deleteMapProject = createEffect(() =>
    this.actions.pipe(
      ofType(UiActions.deleteMapProject),
      switchMap((action) =>
        zip(
          of(action.id),
          this.printmapsService.deleteMapRenderingJob(action.id)
        )
      ),
      map(([id]) => UiActions.mapProjectDeleted({ id: id }))
    )
  );

  loadMapProject = createEffect(() =>
    this.actions.pipe(
      ofType(UiActions.loadMapProject),
      switchMap((action) =>
        this.printmapsService.loadMapProject(action.mapProjectReference)
      ),
      map((mapProject) =>
        UiActions.mapProjectLoaded({ mapProject: mapProject })
      )
    )
  );
  loadMapProjectReferences = createEffect(() =>
    this.actions.pipe(
      ofType(UiActions.loadMapProjectReferences),
      switchMap(() =>
        this.mapProjectReferenceService.loadMapProjectReferences()
      ),
      map((loadedMapProjectReferences) =>
        UiActions.mapProjectReferencesLoaded({
          mapProjectReferences: loadedMapProjectReferences,
        })
      )
    )
  );

  uploadMapProject = createEffect(() =>
    this.actions.pipe(
      ofType(UiActions.uploadMapProject),
      concatMap((action) =>
        (action.mapProject.modifiedLocally
          ? this.printmapsService.createOrUpdateMapRenderingJob(
              action.mapProject
            )
          : of(action.mapProject)
        ).pipe(
          map((mapProject) =>
            UiActions.mapProjectUploaded({
              mapProjectReference: {
                id: mapProject.id,
                name: mapProject.name,
                state: mapProject.state,
              },
              followUpAction: action.followUpAction,
            })
          )
        )
      )
    )
  );

  mapProjectUploaded = createEffect(() =>
    this.actions.pipe(
      ofType(UiActions.mapProjectUploaded),
      concatMap((action) =>
        [
          UiActions.refreshMapProjectState({
            id: action.mapProjectReference.id,
          }),
          UiActions.createUploadMapProjectFollowUpAction(
            action.followUpAction,
            action.mapProjectReference.id
          ),
        ].filter((followUpAction) => !!followUpAction)
      )
    )
  );

  launchMapProjectRendering = createEffect(() =>
    this.actions.pipe(
      ofType(UiActions.launchMapProjectRendering),
      map((action) => action.id),
      switchMap((id) =>
        this.printmapsService
          .launchMapRenderingJob(id)
          .pipe(map(() => UiActions.refreshMapProjectState({ id: id })))
      )
    )
  );

  autoSaveMapProjectReferences = createEffect(
    () =>
      this.store.select(mapProjectReferences).pipe(
        filter((nextMapProjectReferences) => !!nextMapProjectReferences),
        distinctUntilChanged((previousValue, nextValue) =>
          isEqual(previousValue, nextValue)
        ),
        concatMap((nextMapProjectReferences) =>
          this.mapProjectReferenceService.saveMapProjectReferences(
            nextMapProjectReferences
          )
        ),
        ignoreElements()
      ),
    {
      dispatch: false,
    }
  );

  autoUploadMapProject = createEffect(() =>
    this.store.select(currentMapProject).pipe(
      filter((mapProject) => !!mapProject),
      debounce((mapProject) =>
        mapProject.id
          ? timer(
              this.configurationService.appConf.autoUploadIntervalInSeconds *
                1000
            )
          : of()
      ),
      filter((mapProject) => mapProject.modifiedLocally),
      tap((mapProject) => {
        // Log the mapProject before dispatching the action
        console.log('>>> Dispatching upload form autoUploadMapProject-effect in main.effects.ts for mapProject:', mapProject);
      }),
      /*
      map((mapProject) =>
        UiActions.uploadMapProject({ mapProject: mapProject }),
      )
      */
      // HACK
      map((mapProject) => {
        // Dispatch the first action
        const uploadAction = UiActions.uploadMapProject({
          mapProject: mapProject,
        });

        // Dispatch the second action
        const anotherAction = UiActions.uploadUserFile({
          mapProject: mapProject, // or any other data that you'd like to pass
        });

        // Return both actions as an array
        return [uploadAction, anotherAction];        
      }),
      // Use concatMap to handle multiple dispatches in sequence
      concatMap((actions) => actions)
      // HACK  
      )
  );

  refreshMapProjectState = createEffect(() =>
    this.actions.pipe(
      ofType(UiActions.refreshMapProjectState),
      groupBy((action) => action.id),
      map((group) =>
        group.pipe(
          switchMap((action) =>
            of(action.id).pipe(
              expand((id) =>
                of(id).pipe(
                  delay(
                    this.configurationService.appConf
                      .mapStatePollingIntervalInSeconds * 1000
                  )
                )
              ),
              switchMap((id) => this.printmapsService.loadMapProjectState(id)),
              map(
                (mapProjectState, index) =>
                  [mapProjectState, index] as [MapProjectState, number]
              ),
              takeWhile(
                ([mapProjectState, index]) =>
                  index == 0 ||
                  mapProjectState == MapProjectState.WAITING_FOR_RENDERING ||
                  mapProjectState == MapProjectState.RENDERING,
                true
              ),
              map(([mapProjectState]) => mapProjectState),
              distinctUntilChanged(),
              map((mapProjectState) =>
                UiActions.mapProjectStateUpdated({
                  id: action.id,
                  mapProjectState: mapProjectState,
                })
              )
            )
          )
        )
      ),
      mergeAll()
    )
  );

  constructor(
    private store: Store<any>,
    private actions: Actions,
    private readonly configurationService: ConfigurationService,
    private mapProjectReferenceService: MapProjectReferenceService,
    private printmapsService: PrintmapsService
  ) {}

  // Effect to handle file upload
  uploadUserFile$ = createEffect(() =>
    this.actions.pipe(
      ofType(UiActions.uploadMapProject), 
      tap((action) => {
        // Log the mapProject or any other relevant data
        console.log('!!!!!! uploadUserFile effect triggered for mapProject: ', action.mapProject);
      })
    ), { dispatch: false }  // No action is dispatched, only a side effect
  );
  
  
}
