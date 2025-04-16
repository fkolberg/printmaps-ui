// map.service.ts
// by xgadkob

import {Injectable} from "@angular/core";

import {Logger, LogLevel} from "../utils/logger.util";

@Injectable({ providedIn: 'root' })
export class MapService {
  private map!: L.Map;

  setMap(map: L.Map) {
    this.map = map;
  }

  setZoom(zoomLevel: number) {
    Logger.debug(`>>>>>> map.service this.map.getZoom(): ` + this.map.getZoom());
    Logger.debug(`>>>>>> map.service zoomLevel: ${zoomLevel}`);
    if (this.map && this.map.getZoom() !== zoomLevel) {        
        this.map.setZoom(zoomLevel);
    } else {
        Logger.debug(`>>>>>> NOP`);
    }
  }
}
