import {HttpClient, HttpErrorResponse, HttpHeaders, HttpResponse} from "@angular/common/http";
import {Injectable} from "@angular/core";
import {EMPTY, Observable, of} from "rxjs";
import {catchError, concatMap, map, mapTo, tap} from "rxjs/operators";
import {MapRenderingJobDefinition} from "../model/api/map-rendering-job-definition";
import {MapProject, toMapRenderingJobExecution} from "../model/intern/map-project";
import {MapRenderingJobState} from "../model/api/map-rendering-job-state";
import {fromMapRenderingJobState, MapProjectState} from "../model/intern/map-project-state";
import {MapProjectReference} from "../model/intern/map-project-reference";
import {ConfigurationService} from "./configuration.service";
import {fromReductionFactor, getScaleProperties, SCALES} from "../model/intern/scale";
import {
    ADDITIONAL_ELEMENT_TYPES,
    AdditionalElementType,
    AdditionalGpxElement,
    AdditionalScaleElement,
    AdditionalTextElement,
    AnyAdditionalElement
} from "../model/intern/additional-element";
import {TemplateService} from "./template-service";
import {UserObject} from "../model/api/user-object";
import {UserObjectMetadata} from "../model/api/user-object-metadata";
import {
    AdditionalElementStyleType,
    DEFAULT_SCALE_STYLE,
    DEFAULT_TEXT_STYLE,
    DEFAULT_TRACK_STYLE,
    FONT_STYLE_BY_FONTSET_NAME
} from "../model/intern/additional-element-style";
import {v4 as uuid} from "uuid";
import {parse} from "wellknown";
import {UserFile} from "../model/api/user-file";
import {ScaleService} from "./scale.service";

const REQUEST_OPTIONS = {
    headers: new HttpHeaders({
        "Accept": "application/vnd.api+json; charset=utf-8",
        "Content-Type": "application/vnd.api+json; charset=utf-8"
    })
};

@Injectable()
export class PrintmapsService {
    constructor(private readonly configurationService: ConfigurationService, private templateService: TemplateService, private http: HttpClient, private scaleService: ScaleService) {
    }

    private get baseUrl() {
        return this.configurationService.appConf.printmapsApiBaseUri;
    }

    private static convertUserObjectToAdditionalElement(userObject: UserObject): AnyAdditionalElement {
        if (!userObject.Style.match(/^<!--(.*)-->/)) {
            return undefined;
        }
        let metadata = JSON.parse(userObject.Style.match(/^<!--(.*)-->/)[1]) as UserObjectMetadata;
        if (metadata?.Type == AdditionalElementType.TEXT_BOX || metadata?.Type == AdditionalElementType.ATTRIBUTION) {
            return this.extractTextElement(userObject, metadata);
        } else if (metadata?.Type == AdditionalElementType.SCALE) {
            return this.extractScaleElement(userObject, metadata);
        } else if (metadata?.Type == AdditionalElementType.GPX_TRACK) {
            return this.extractGpxElement(userObject, metadata);
        }
        return undefined;
    }

    private static extractTextElement(userObject: UserObject, metadata: UserObjectMetadata): AdditionalTextElement {
        let parser = new DOMParser();
        let styleXml = parser.parseFromString(userObject.Style, "application/xml");
        let wkt = parse(userObject.WellKnownText);
        let c_x = 0;
        let c_y = 0;
        if (wkt && 'coordinates' in wkt) {
            let c_x = wkt.coordinates[0];
            let c_y = wkt.coordinates[1];
        }
        let textSymbolizerAttributes = styleXml.getElementsByTagName("TextSymbolizer")[0].attributes;
        return {
            type: metadata.Type as AdditionalElementType,
            id: metadata.ID ?? uuid(),
            text: metadata.Text ?? "",
            style: {
                type: AdditionalElementStyleType.TEXT,
                fontStyle: FONT_STYLE_BY_FONTSET_NAME
                        .get(textSymbolizerAttributes.getNamedItem("fontset-name")?.value) ??
                    DEFAULT_TEXT_STYLE.fontStyle,
                fontSize: parseInt(textSymbolizerAttributes.getNamedItem("size")?.value ??
                    DEFAULT_TEXT_STYLE.fontSize.toString()),
                textOrientation: parseInt(textSymbolizerAttributes.getNamedItem("orientation")?.value ??
                    DEFAULT_TEXT_STYLE.textOrientation.toString()),
                fontColor: {
                    rgbHexValue: textSymbolizerAttributes.getNamedItem("fill")?.value ??
                        DEFAULT_TEXT_STYLE.fontColor.rgbHexValue,
                    opacity: parseFloat(textSymbolizerAttributes.getNamedItem("opacity")?.value ??
                        DEFAULT_TEXT_STYLE.fontColor.opacity.toString())
                }
            },
            location: {x: c_x, y: c_y}
        };
    }

    private static extractScaleElement(userObject: UserObject, metadata: UserObjectMetadata): AdditionalScaleElement {
        let wkt = parse(userObject.WellKnownText);
        let c_x = 0;
        let c_y = 0;
        if (wkt && 'coordinates' in wkt) {
            let c_x = wkt.coordinates[0];
            let c_y = wkt.coordinates[1];
        }
        return {
            type: metadata.Type as AdditionalElementType,
            id: metadata.ID ?? uuid(),
            style: DEFAULT_SCALE_STYLE,
            location: {x: c_x, y: c_y}
        };
    }

    private static extractGpxElement(userObject: UserObject, metadata: UserObjectMetadata): AdditionalGpxElement {
        let parser = new DOMParser();
        let styleXml = parser.parseFromString(userObject.Style, "application/xml");
        let lineSymbolizerAttributes = styleXml.getElementsByTagName("LineSymbolizer")[0].attributes;
        
        return {
            type: AdditionalElementType.GPX_TRACK,
            id: metadata.ID ?? uuid(),
            style: {
                type: AdditionalElementStyleType.TRACK,
                lineWidth: parseFloat(lineSymbolizerAttributes.getNamedItem("stroke-width")?.value
                    ?? DEFAULT_TRACK_STYLE.lineWidth.toString()),
                lineColor: {
                    rgbHexValue: lineSymbolizerAttributes.getNamedItem("stroke")?.value
                        ?? DEFAULT_TRACK_STYLE.lineColor.rgbHexValue,
                    opacity: parseFloat(lineSymbolizerAttributes.getNamedItem("stroke-opacity")?.value
                        ?? DEFAULT_TRACK_STYLE.lineColor.opacity.toString())
                }
            },
            file: {name: metadata.File, data: undefined, modified: new Date().getTime()}
        };
    }

    private static extractMargins(userObject: UserObject): { top: number, bottom: number, left: number, right: number } {
        if (!userObject.Style.match(/^<!--(.*)-->/)) {
            return undefined;
        }
        let metadata = JSON.parse(userObject.Style.match(/^<!--(.*)-->/)[1]) as UserObjectMetadata;
        if (metadata?.Type == "margins") {
            let wkt = parse(userObject.WellKnownText);
            let c_top = 0;
            let c_bottom = 0;
            let c_left = 0;
            let c_right = 0;

            if (wkt && 'coordinates' in wkt) {
                let c_top = wkt.coordinates[0][2][1] - wkt.coordinates[1][2][1];
                let c_bottom = wkt.coordinates[1][0][1];
                let c_left = wkt.coordinates[1][0][0];
                let c_right = wkt.coordinates[0][2][0] - wkt.coordinates[1][2][0];
            }
            return {
                top: c_top,
                bottom: c_bottom,
                left: c_left,
                right: c_right
            };
        }
        return undefined;
    }

    loadMapProjectState(id: string): Observable<MapProjectState> {
        let endpointUrl = `${this.baseUrl}/mapstate/${id}`;
        return this.http.get<MapRenderingJobState>(endpointUrl)
            .pipe(
                map(fromMapRenderingJobState),
                catchError((error: HttpErrorResponse) => {
                    if (error.status == 400) {
                        return of(MapProjectState.NONEXISTENT);
                    }
                    return of(MapProjectState.RENDERING_UNSUCCESSFUL);
                })
            );
    }

    loadMapProject(mapProjectReference: MapProjectReference): Observable<MapProject> {
        let endpointUrl = `${this.baseUrl}/metadata/${mapProjectReference.id}`;
        return this.http.get<MapRenderingJobDefinition>(endpointUrl)
            .pipe(
                map(mapRenderingJob => this.fromMapRenderingJob(mapProjectReference.name, mapRenderingJob)),
                concatMap(mapProject =>
                    this.loadMapProjectState(mapProject.id)
                        .pipe(
                            map(mapProjectState => {
                                mapProject.state = mapProjectState;
                                return mapProject;
                            })
                        )
                ),
                catchError(() => EMPTY)
            );
    }

    deleteMapRenderingJob(id: string): Observable<boolean> {
        let endpointUrl = `${this.baseUrl}/delete/${id}`;
        return this.http.post(endpointUrl, null, REQUEST_OPTIONS)
            .pipe(
                mapTo(true),
                catchError(() => of(false))
            );
    }

    launchMapRenderingJob(id: string): Observable<boolean> {
        let endpointUrl = `${this.baseUrl}/mapfile`;
        return this.http.post(endpointUrl, toMapRenderingJobExecution(id), REQUEST_OPTIONS)
            .pipe(
                mapTo(true),
                catchError(() => of(false))
            );

    }

    createOrUpdateMapRenderingJob(mapProject: MapProject): Observable<MapProject> {
        let endpointUrl = `${this.baseUrl}/metadata${mapProject.id ? "/patch" : ""}`;
        return this.http.post<MapRenderingJobDefinition>(endpointUrl, this.toMapRenderingJob(mapProject), REQUEST_OPTIONS)
            .pipe(
                map(mapRenderingJob => this.fromMapRenderingJob(mapProject.name, mapRenderingJob)),
                tap(savedMapProject =>
                    this.toUserFiles(mapProject).forEach(userFile =>
                        this.uploadUserFile(savedMapProject.id, userFile.content, userFile.name).subscribe())),
                concatMap(savedMapProject =>
                    this.loadMapProjectState(savedMapProject.id)
                        .pipe(
                            map(mapProjectState => ({
                                    ...savedMapProject,
                                    state: mapProjectState
                                })
                            )
                        )
                ),
                catchError(() => EMPTY)
            );
    }

    uploadUserFile(mapProjectId: string, content: string | Blob, name: string): Observable<boolean> {
        let formData = new FormData();
        formData.append("file", new Blob([content], {type: "image/svg+xml"}), name);
        let endpointUrl = `${this.baseUrl}/upload/${mapProjectId}`;
        let requestOptions = {
            headers: new HttpHeaders({
                "Accept": "application/vnd.api+json; charset=utf-8"
            })
        };

        return this.http.post<HttpResponse<any>>(endpointUrl, formData, requestOptions)
            .pipe(
                map(response => response.status == 201),
                catchError(() => EMPTY)
            );
    }

    private static generateMargins(mapProject: MapProject): UserObject {
        let metadata: UserObjectMetadata = {
            ID: uuid(),
            Type: "margins",
            Text: undefined
        };
        let outerWidth = mapProject.widthInMm;
        let outerHeight = mapProject.heightInMm;
        let innerWidth1 = mapProject.leftMarginInMm;
        let innerWidth2 = mapProject.widthInMm - mapProject.rightMarginInMm;
        let innerHeight1 = mapProject.bottomMarginInMm;
        let innerHeight2 = mapProject.heightInMm - mapProject.topMarginInMm;
        return {
            Style: `<!--${JSON.stringify(metadata)}--><PolygonSymbolizer fill='white' fill-opacity='1.0' />`,
            WellKnownText: `POLYGON((0 0, 0 ${outerHeight}, ${outerWidth} ${outerHeight}, ${outerWidth} 0, 0 0), (${innerWidth1} ${innerHeight1}, ${innerWidth1} ${innerHeight2}, ${innerWidth2} ${innerHeight2}, ${innerWidth2} ${innerHeight1}, ${innerWidth1} ${innerHeight1}))`
        };
    }

    private fromMapRenderingJob(name: string, mapRenderingJob: MapRenderingJobDefinition): MapProject {
        let data = mapRenderingJob.Data;
        let attributes = data.Attributes;
        let margins = mapRenderingJob.Data.Attributes.UserObjects
            .map(userObject => PrintmapsService.extractMargins(userObject))
            .filter(element => !!element)[0];
        return {
            id: data.ID,
            name: name,
            state: undefined,
            scale: fromReductionFactor(attributes.Scale),
            center: {latitude: attributes.Latitude, longitude: attributes.Longitude},
            widthInMm: attributes.PrintWidth,
            heightInMm: attributes.PrintHeight,
            topMarginInMm: margins?.top ?? 8,
            bottomMarginInMm: margins?.bottom ?? 8,
            leftMarginInMm: margins?.left ?? 8,
            rightMarginInMm: margins?.right ?? 8,
            options: {
                fileFormat: attributes.Fileformat,
                mapStyle: attributes.Style
            },
            additionalElements: mapRenderingJob.Data.Attributes.UserObjects
                .map(userObject => PrintmapsService.convertUserObjectToAdditionalElement(userObject))
                .filter(additionalElement => !!additionalElement),
            modifiedLocally: false
        };
    }

    private toMapRenderingJob(mapProject: MapProject): MapRenderingJobDefinition {
        let gpxTracks = mapProject.additionalElements
            .filter(element => element.type == AdditionalElementType.GPX_TRACK)
            .map(element => ADDITIONAL_ELEMENT_TYPES.get(element.type)
                .toUserObject(this.templateService, mapProject, element));
        let otherAdditionalElementUserObjects = mapProject.additionalElements
            .filter(element => element.type != AdditionalElementType.GPX_TRACK)
            .map(element => ADDITIONAL_ELEMENT_TYPES.get(element.type)
                .toUserObject(this.templateService, mapProject, element));
        let userObject = [
            ...gpxTracks,
            PrintmapsService.generateMargins(mapProject),
            ...otherAdditionalElementUserObjects
        ];
        return {
            Data: {
                Type: "maps",
                ID: mapProject.id,
                Attributes: {
                    Fileformat: mapProject.options.fileFormat,
                    Style: mapProject.options.mapStyle,
                    Projection: "3857",
                    Scale: getScaleProperties(mapProject.scale).reductionFactor,
                    Latitude: mapProject.center.latitude,
                    Longitude: mapProject.center.longitude,
                    PrintWidth: mapProject.widthInMm,
                    PrintHeight: mapProject.heightInMm,
                    HideLayers: "",
                    UserObjects: userObject
                }
            }
        };
    }

    private toUserFiles(mapProject: MapProject): UserFile[] {
        let reductionFactor = SCALES.get(mapProject.scale).reductionFactor;
        let scaleRatio = Math.pow(10, Math.ceil(Math.log10(10 * reductionFactor))) / reductionFactor;
        let unitLengthInM;
        if (scaleRatio >= 30) {
            unitLengthInM = scaleRatio * reductionFactor / 4000;
        } else if (scaleRatio >= 15) {
            unitLengthInM = scaleRatio * reductionFactor / 2000;
        } else {
            unitLengthInM = scaleRatio * reductionFactor / 1000;
        }
        return mapProject.additionalElements
            .filter(addAdditionalElement => addAdditionalElement.type == AdditionalElementType.SCALE)
            .map(element => ({
                name: `scale_${element.id}.svg`,
                content: this.scaleService.buildScaleSvg(unitLengthInM, SCALES.get(mapProject.scale).reductionFactor)
            }))
            .concat(
                mapProject.additionalElements
                    .filter(addAdditionalElement => addAdditionalElement.type == AdditionalElementType.GPX_TRACK)
                    .map(element => element as AdditionalGpxElement)
                    .filter(element => element.file?.data)
                    .map(element => ({
                        name: element.file.name,
                        content: element.file.data
                    }))
            );
    }
}