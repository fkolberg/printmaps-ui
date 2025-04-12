// gpx-data-map.service.ts


import {Logger, LogLevel} from "../utils/logger.util";

export class GpxDataMap {
  // Create a Map to store GPX data
  static data: Map<string, string> = new Map();

  // Initialize the Map with initial GPX data
  static initialize() {
    this.data.set('gpx1', `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
    <gpx xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd " xmlns="http://www.topografix.com/GPX/1/1" creator="QMapShack 1.17.1 http://www.qlandkarte.org/" version="1.1">
     <metadata>
      <name>Sperrung</name>
      <time>2025-02-05T14:53:22.865Z</time>
     </metadata>
     <trk>
      <name>Sperrung</name>
      <trkseg>
       <trkpt lon="8.58484009" lat="50.08218833">
        <ele>94</ele>
       </trkpt>
       <trkpt lon="8.58311532" lat="50.07165565">
        <ele>105</ele>
       </trkpt>
       <trkpt lon="8.59863821" lat="50.07039295">
        <ele>109</ele>
       </trkpt>
       <trkpt lon="8.60138705" lat="50.07656773">
        <ele>97</ele>
       </trkpt>
       <trkpt lon="8.59664395" lat="50.07691363">
        <ele>96</ele>
       </trkpt>
       <trkpt lon="8.59429935" lat="50.08051087">
        <ele>96</ele>
       </trkpt>
       <trkpt lon="8.58888251" lat="50.08096050">
        <ele>94</ele>
       </trkpt>
       <trkpt lon="8.58486704" lat="50.08220562">
        <ele>94</ele>
       </trkpt>
       <trkpt lon="8.58486704" lat="50.08220562">
        <ele>94</ele>
       </trkpt>
      </trkseg>
     </trk>
    </gpx>`);

    this.data.set('gpx2', `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
    <gpx xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd " xmlns="http://www.topografix.com/GPX/1/1" creator="QMapShack 1.17.1 http://www.qlandkarte.org/" version="1.1">
     <metadata>
      <name>Sperrung2</name>
      <time>2025-02-05T14:53:22.865Z</time>
     </metadata>
     <trk>
      <name>Sperrung</name>
      <trkseg>
       <trkpt lon="8.58484000" lat="50.08218833">
        <ele>94</ele>
       </trkpt>
       <trkpt lon="8.58311511" lat="50.07165565">
        <ele>105</ele>
       </trkpt>
       <trkpt lon="8.59863822" lat="50.07039295">
        <ele>109</ele>
       </trkpt>
       <trkpt lon="8.60138733" lat="50.07656773">
        <ele>97</ele>
       </trkpt>
       <trkpt lon="8.58888251" lat="50.08096050">
        <ele>94</ele>
       </trkpt>
       <trkpt lon="8.58486704" lat="50.08220562">
        <ele>94</ele>
       </trkpt>
       <trkpt lon="8.58486704" lat="50.08220562">
        <ele>94</ele>
       </trkpt>
      </trkseg>
     </trk>
    </gpx>`);
  }

  // Retrieve GPX data by its key (e.g., 'gpx1' or 'gpx2')
  static getGpxData(key: string): string | undefined {
    return this.data.get(key);
  }

  // Add new GPX data to the map
  static addGpxData(key: string, gpxData: string): void {
    Logger.trace(`>>> GpxDataMap addGpxData key: ` + key);
    Logger.trace(`>>> GpxDataMap addGpxData gpxData: ` + gpxData);
    this.data.set(key, gpxData);
  }

  // Optionally, you can implement functions to parse XML data (for example, metadata and track points) as before
  static parseXmlString(gpxXmlString: string): Document {
    const parser = new DOMParser();
    return parser.parseFromString(gpxXmlString, "application/xml");
  }

  static getMetadata(gpxXmlString: string): any {
    const xmlDoc = this.parseXmlString(gpxXmlString);
    const metadata = xmlDoc.getElementsByTagName("metadata")[0];
    const name = metadata.getElementsByTagName("name")[0].textContent;
    const time = metadata.getElementsByTagName("time")[0].textContent;

    return {
      name: name,
      time: time
    };
  }

  static getTrackPoints(gpxXmlString: string): any[] {
    const xmlDoc = this.parseXmlString(gpxXmlString);
    const trackPoints: any[] = [];
    const trkpts = xmlDoc.getElementsByTagName("trkpt");

    Array.from(trkpts).forEach((trkpt) => {
      const lat = trkpt.getAttribute("lat");
      const lon = trkpt.getAttribute("lon");
      const ele = trkpt.getElementsByTagName("ele")[0].textContent;

      trackPoints.push({ lat, lon, ele });
    });

    return trackPoints;
  }
}
