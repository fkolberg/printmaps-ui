// configuration.ts

import {GeoCoordinates} from "./geo-coordinates";

export interface Configuration {
    printmapsApiBaseUri: string,
    printmapsWebUri: string,
    printmapsUsageUrl: string,
    defaultCoordinates: GeoCoordinates,
    autoUploadIntervalInSeconds: number,
    mapStatePollingIntervalInSeconds: number,
    loggingLevel: string
}