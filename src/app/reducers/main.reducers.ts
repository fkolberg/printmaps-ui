// main.reducers.ts

import {Action, createReducer, on} from "@ngrx/store";
import {round} from "lodash";
import * as UiActions from "../actions/main.actions";
import {initialState, PrintmapsUiState} from "../model/intern/printmaps-ui-state";
import {getScaleProperties, Scale} from "../model/intern/scale";
import {MapProjectState} from "../model/intern/map-project-state";
import {FileFormat, MapStyle} from "../model/api/map-rendering-job-definition";
import {
    AdditionalElementType,
    AdditionalGpxElement,
    AdditionalScaleElement,
    AdditionalTextElement,
    AnyAdditionalElement
} from "../model/intern/additional-element";
import {DEFAULT_SCALE_STYLE, DEFAULT_TEXT_STYLE, DEFAULT_TRACK_STYLE} from "../model/intern/additional-element-style";
import {v4 as uuid} from "uuid";
import {generateMapProjectCopyName, MapProject} from "../model/intern/map-project";

import {Logger, LogLevel} from "../utils/logger.util";

const reducer = createReducer(initialState,

    on(UiActions.mapProjectReferencesLoaded,
        (state, {mapProjectReferences}) => ({
            ...state,
            mapProjectReferences: mapProjectReferences
        })),
    
    on(UiActions.createMapProject,
        (state, {name}) => {
            let mapProject = {
                id: undefined,
                name: name,
                modifiedLocally: true,
                state: MapProjectState.NOT_RENDERED,
                center: state.mapCenter,
                widthInMm: 210,
                heightInMm: 297,
                topMarginInMm: 8,
                bottomMarginInMm: 8,
                leftMarginInMm: 8,
                rightMarginInMm: 8,
                scale: Scale.RATIO_1_50000,
                options: {
                    fileFormat: FileFormat.PNG,
                    mapStyle: MapStyle.OSM_CARTO
                },
                additionalElements: [],
                zoomLevel: 12

            };
            return {
                ...state,
                currentMapProject: {
                    ...mapProject,
                    additionalElements: [createAdditionalElement(mapProject, AdditionalElementType.ATTRIBUTION)]
                }
            };
        }),

        /*
            When an updateZoomLevel action is dispatched 
            (from somewhere in the app, like the zoomend handler), 
            this reducer:
                Logs the zoomLevel and the current map project's ID.
                Returns a new state, updating only the zoomLevel inside currentMapProject.
            This keeps your zoom level stored in NgRx, 
            making it available across components (and possibly persisted, too).
        */
        on(UiActions.updateZoomLevel, (state, { zoomLevel }) => {
            const id = state.currentMapProject?.id;
            Logger.info(`>>> reducer zoomLevel: ${zoomLevel}, map id: ${id}`);
            
            return {
                ...state,
                currentMapProject: {
                    ...state.currentMapProject,
                    zoomLevel: zoomLevel, // ✅ store zoom inside project
                },
            };
        }),

        /*
          Optional: Shorter Version

            You could even write it more concisely like this:

            on(UiActions.updateZoomLevel, (state, { zoomLevel }) => ({
                ...state,
                currentMapProject: {
                    ...state.currentMapProject,
                    zoomLevel,
                },
            })),
        */
          
    /*
    5. Optionally: Read from Store on Init

If you want to restore the zoom level from the store when initializing:

this.store
  .select(currentMapProject)
  .pipe(
    distinctUntilChanged((prev, curr) => isEqual(prev, curr))
  )
  .subscribe((project) => {
    if (project) {
      ...
      this.zoomLevel = project.zoomLevel ?? 12;
    }
  });
    */

    on(UiActions.copyMapProject,
        (state) => ({
            ...state,
            currentMapProject: state.currentMapProject?.id
                ? {
                    ...state.currentMapProject,
                    id: undefined,
                    name: generateMapProjectCopyName(state.currentMapProject.name),
                    modifiedLocally: true
                }
                : state.currentMapProject
        })
    ),

    on(UiActions.mapProjectLoaded,
        (state, {mapProject}) => ({
            ...state,
            currentMapProject: !state.currentMapProject || state.currentMapProject?.id ? mapProject : state.currentMapProject
        })),

    on(UiActions.mapProjectDeleted,
        (state, {id}) => ({
            ...state,
            currentMapProject: state.currentMapProject?.id == id ? undefined : state.currentMapProject,
            mapProjectReferences: state.mapProjectReferences.filter(mapProjectReference => mapProjectReference.id != id)
        })),

    on(UiActions.mapProjectUploaded,
        (state, {mapProjectReference}) => ({
            ...state,
            currentMapProject: {
                ...state.currentMapProject,
                id: state.currentMapProject.id ? state.currentMapProject.id : mapProjectReference.id,
                modifiedLocally: false
            },
            mapProjectReferences: [
                ...state.mapProjectReferences,
                ...(state.mapProjectReferences.filter(other => other.id == mapProjectReference.id).length == 0
                    ? [mapProjectReference]
                    : [])
            ]
        })),

    on(UiActions.updateMapName,
        (state, {name}) => ({
            ...state,
            mapProjectReferences: state.mapProjectReferences.map(
                mapProjectReference =>
                    mapProjectReference.id == state.currentMapProject.id
                        ? {...mapProjectReference, name: name}
                        : mapProjectReference
            )
        })),

    on(UiActions.updateCenterCoordinates,
        (state, {center}) => {
            let roundedCoordinates = {
                latitude: Math.min(Math.max(round(center.latitude, 9), -85), 85),
                longitude: Math.min(Math.max(round(center.longitude, 9), -180), 180)
            };
            return {
                ...state,
                mapCenter: roundedCoordinates,
                currentMapProject: state.currentMapProject
                    ? {
                        ...state.currentMapProject,
                        center: roundedCoordinates,
                        modifiedLocally: true
                    }
                    : state.currentMapProject
            };
        }),

    on(UiActions.updateSelectedArea,
        (state, {widthInM, heightInM, topMarginInMm, bottomMarginInMm, leftMarginInMm, rightMarginInMm, scale}) =>
            ({
                ...state,
                currentMapProject: {
                    ...state.currentMapProject,
                    widthInMm: Math.min(Math.max(round(widthInM / getScaleProperties(scale).reductionFactor * 1000) + leftMarginInMm * 1 + rightMarginInMm * 1, 50), 3000),
                    heightInMm: Math.min(Math.max(round(heightInM / getScaleProperties(scale).reductionFactor * 1000) + topMarginInMm * 1 + bottomMarginInMm * 1, 50), 2500),
                    topMarginInMm: topMarginInMm,
                    bottomMarginInMm: bottomMarginInMm,
                    leftMarginInMm: leftMarginInMm,
                    rightMarginInMm: rightMarginInMm,
                    scale: scale,
                    modifiedLocally: true
                }
            })
    ),

    on(UiActions.updateMapOptions,
        (state, {options}) => ({
            ...state,
            currentMapProject: {
                ...state.currentMapProject,
                options: options,
                modifiedLocally: true
            }
        })),

    on(UiActions.mapProjectStateUpdated,
        (state, {id, mapProjectState}) => ({
            ...state,
            mapProjectReferences: state.mapProjectReferences?.map(
                mapProjectReference => mapProjectReference.id == id
                    ? {
                        ...mapProjectReference,
                        state: mapProjectState
                    }
                    : mapProjectReference
            ),
            currentMapProject: state.currentMapProject?.id == id
                ? {
                    ...state.currentMapProject,
                    state: mapProjectState
                }
                : state.currentMapProject
        })),    
   
    on(UiActions.addAdditionalElement,
        (state, {elementType}) => {
            let newElement = createAdditionalElement(state.currentMapProject, elementType);
            return {
                ...state,
                currentMapProject: state.currentMapProject
                    ? {
                        ...state.currentMapProject,
                        modifiedLocally: true,
                        additionalElements: [
                            ...state.currentMapProject.additionalElements,
                            newElement
                        ]
                    }
                    : state.currentMapProject,
                selectedAdditionalElementId: newElement.id
            };
        }),
    
    on(UiActions.selectAdditionalElement,
        (state, {id}) => ({
            ...state,
            selectedAdditionalElementId: id
        })),
   
    on(UiActions.removeAdditionalElement,
        (state, {id}) => ({
            ...state,
            currentMapProject: state.currentMapProject
                ? {
                    ...state.currentMapProject,
                    modifiedLocally: true,
                    additionalElements: state.currentMapProject.additionalElements.filter(element => element.id != id)
                }
                : state.currentMapProject,
            selectedAdditionalElementId: undefined
        })),
   
    on(UiActions.updateAdditionalElement,
        (state, {element}) => ({
            /*
                Spreading the state:
                The state is being updated immutably, 
                so the first thing is to spread the existing state (...state) 
                to ensure that any unchanged properties remain intact.
            */
            ...state,
            /*
                Updating currentMapProject:
                The reducer checks if currentMapProject exists (state.currentMapProject).
                If it exists, the currentMapProject is updated by creating a new object 
                using ...state.currentMapProject. This ensures that the state remains immutable.
            */
            currentMapProject: state.currentMapProject
                ? {
                    ...state.currentMapProject,
                    /*
                        Setting modifiedLocally: true:
                        The modifiedLocally flag is set to true to indicate 
                        that the map project has been modified but not yet saved.
                    */
                    modifiedLocally: true,
                    /*
                        Modifying additionalElements:
                        The additionalElements array in currentMapProject is updated. 
                        The array is processed using the map function:
                            It checks each element (currentElement) in additionalElements.
                            If the id of currentElement matches the id of the updated element 
                            (from the action payload), it replaces that element with the updated element.
                             Otherwise, the currentElement is kept as is.
                        This ensures that only the element with the matching id gets updated, 
                        while all other elements remain unchanged.
                    */
                    additionalElements: state.currentMapProject.additionalElements
                        .map(currentElement => currentElement.id == element.id
                            ? element
                            : currentElement)
                }
                /*
                    If currentMapProject doesn't exist:
                    If for some reason currentMapProject is null or undefined 
                    (which would be an unusual case), the state is returned unchanged.
                */
                : state.currentMapProject
        }))
);

export function printmapsUiReducer(state: PrintmapsUiState | undefined, action: Action) {
    return reducer(state, action);
}

function createAdditionalElement(mapProject: MapProject, type: AdditionalElementType): AnyAdditionalElement {
    let baseElement = {
        type: type,
        id: uuid()
    };
    switch (type) {
        case AdditionalElementType.TEXT_BOX:
            return {
                ...baseElement,
                text: $localize`New Text Element`,
                style: DEFAULT_TEXT_STYLE,
                location: {
                    x: Math.round(mapProject.widthInMm / 2),
                    y: Math.round(mapProject.heightInMm / 2)
                }
            } as AdditionalTextElement;
        case AdditionalElementType.ATTRIBUTION:
            return {
                ...baseElement,
                text: "${attribution}",
                style: DEFAULT_TEXT_STYLE,
                location: {x: 40, y: 7}
            } as AdditionalTextElement;
        case AdditionalElementType.SCALE:
            return {
                ...baseElement,
                style: DEFAULT_SCALE_STYLE,
                location: {x: 160, y: 10}
            } as AdditionalScaleElement;
        case AdditionalElementType.GPX_TRACK:
            return {
                ...baseElement,
                style: DEFAULT_TRACK_STYLE
            } as AdditionalGpxElement;
        default :
            return undefined;
    }
}
