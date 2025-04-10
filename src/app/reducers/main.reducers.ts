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

    /*
        This part of the code is responsible for creating a new map project 
        and updating the state with this new project. 
        It uses default values for many of the mapProject properties 
        and adds an attribution element to the map.

        The main purpose of this logic is to handle the creation of a new map project 
        when the UiActions.createMapProject action is dispatched, 
        and update the application's state with the newly created project details.
        
        Returning the Updated State: The function then returns a new state object:
            The current state is spread (...state), preserving all other parts of the state.
            The currentMapProject is set to the newly created mapProject object 
            (with the attribution element added).
    */
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
                additionalElements: []

            };
            return {
                ...state,
                currentMapProject: {
                    ...mapProject,
                    additionalElements: [createAdditionalElement(mapProject, AdditionalElementType.ATTRIBUTION)]
                }
            };
        }),

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
    
    /*
        Summary:
        This handler listens for the addAdditionalElement action, 
        creates a new element based on the provided type, 
        updates the map project by adding that element, 
        and then sets that element as the selected one. 
        This is a common pattern in state management where changes to the state 
        (like adding elements to a list) are done immutably 
        to maintain predictable and traceable state updates.

        Purpose of the Code:
        The action adds a new additional element 
        (such as a text box or scale) to the map project.
        The state is updated to reflect the changes, 
        and the newly added element is set as the selected element, 
        which might trigger the UI to show its properties or make it editable.
    */
    /*
        This is an action handler for the addAdditionalElement action. 
        When this action is dispatched, the reducer will execute 
        the function provided here.
        The elementType is passed as part of the action payload, 
        which tells us the type of element 
        (e.g., text box, scale, attribution) that needs to be added.
    */
    on(UiActions.addAdditionalElement,
        (state, {elementType}) => {
            /*
                Create the New Element:
                The createAdditionalElement function is called with the currentMapProject 
                (from the current state) and the elementType (from the action payload).
                This function generates a new element of the specified type 
                (such as a text box or scale). 
                This new element includes properties like id, text, style, and location.
            */
            let newElement = createAdditionalElement(state.currentMapProject, elementType);
            /*
                Update the State:
                The state is being returned as a new object, 
                making use of immutable updates (spreading state).
                Updating currentMapProject:
                    If currentMapProject exists (i.e., the map project is not null or undefined), 
                    a new currentMapProject object is returned.
                    The new currentMapProject includes:
                        A modifiedLocally: true flag indicating that the map project has been changed locally (unsaved).
                        The additionalElements array is updated by appending the newly created element (newElement) to the existing array of elements.
                Selecting the New Element:
                 The selectedAdditionalElementId is updated to the ID of the newly created element
                 (newElement.id), making the newly added element the "selected" one in the UI.
                 
                 If currentMapProject does not exist (which should not happen if a map project is loaded), the state would remain unchanged.
            */
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
    /*    
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
    */
        on(UiActions.removeAdditionalElement,
            (state, {id}) => {
                // Log the state before the update
                Logger.debug('zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz main.reducer.ts Before update:' + state);
                
                const updatedState = {
                    ...state,
                    currentMapProject: state.currentMapProject
                        ? {
                            ...state.currentMapProject,
                            modifiedLocally: true,
                            additionalElements: state.currentMapProject.additionalElements.filter(element => element.id != id)
                        }
                        : state.currentMapProject,
                    selectedAdditionalElementId: undefined
                };
                
                // Log the updated state
                Logger.debug('zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz main.reducer.ts After update:' + state);
                                
                return updatedState;
            }
        ),
        
    /*
        This is the action handler for updateAdditionalElement. 
        When this action is dispatched, the reducer executes this function.
        The payload of the action contains an element object,
        which represents the updated version of an existing element. 
        The element has an id that is used to find and update the corresponding element 
        in the additionalElements array.
    */
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
