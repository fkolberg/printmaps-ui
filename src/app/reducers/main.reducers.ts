import {Action, createReducer, on} from "@ngrx/store";
import {round} from "lodash";
import * as UiActions from "../actions/main.actions";
import {initialState, PrintmapsUiState} from "../model/intern/printmaps-ui-state";
import {getScaleProperties, Scale} from "../model/intern/scale";
import {MapProjectState} from "../model/intern/map-project-state";
import {FileFormat, MapStyle} from "../model/api/map-rendering-job-definition";
import {AdditionalElementType, AdditionalTextElement, AnyAdditionalElement} from "../model/intern/additional-element";
import {DEFAULT_TEXT_STYLE} from "../model/intern/additional-element-style";
import {v4 as uuid} from "uuid";
import {MapProject} from "../model/intern/map-project";

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
                scale: Scale.RATIO_1_50000,
                options: {
                    fileFormat: FileFormat.SVG,
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

    on(UiActions.mapProjectLoaded,
        (state, {mapProject}) => ({
            ...state,
            currentMapProject: mapProject
        })),

    on(UiActions.closeMapProject,
        (state) => ({
            ...state,
            currentMapProject: undefined
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
        (state, {widthInM, heightInM, scale}) => ({
            ...state,
            currentMapProject: {
                ...state.currentMapProject,
                widthInMm: Math.min(Math.max(round(widthInM / getScaleProperties(scale).reductionFactor * 1000), 50), 3000),
                heightInMm: Math.min(Math.max(round(heightInM / getScaleProperties(scale).reductionFactor * 1000), 50), 2500),
                scale: scale,
                modifiedLocally: true
            }
        })),

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
            ...state,
            currentMapProject: state.currentMapProject
                ? {
                    ...state.currentMapProject,
                    modifiedLocally: true,
                    additionalElements: state.currentMapProject.additionalElements
                        .map(currentElement => currentElement.id == element.id
                            ? element
                            : currentElement)
                }
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
                location: {x: 40, y: 6}
            } as AdditionalTextElement;
        default :
            return undefined;
    }
}
