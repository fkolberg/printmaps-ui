// logger.ts

import { environment } from '../../environments/environment';

// Define an enum for the log levels
export enum LogLevel {
    DEBUG = 'DEBUG',
    INFO = 'INFO',
    ERROR = 'ERROR',
    TRACE = 'TRACE'
}

export class Logger {
    // Log function that accepts the log level enum
    static log(level: LogLevel, message: string): void {
        if (environment.production) {
            // console.log('App is running in production mode');
            if (level !== LogLevel.DEBUG) {
                this.outputLog(level, message);
            }
          } else {
            // console.log('App is running in development mode');
            this.outputLog(level, message);
          }
       
    }

    // Private function to output the log message to the console
    private static outputLog(level: LogLevel, message: string): void {
        const timestamp = new Date().toISOString();
        const stack = new Error().stack;
        let callerInfo = '';

        if (stack) {
            const stackLines = stack.split('\n');
            if (stackLines.length > 2) {
                callerInfo = stackLines[2].trim(); // Extract method name
            }
        }

        const logMessage = `${timestamp} [${level}] ${callerInfo} - ${message}`;

        switch (level) {
            case LogLevel.DEBUG:
                console.debug(logMessage);
                break;
            case LogLevel.INFO:
                console.info(logMessage);
                break;
            case LogLevel.ERROR:
                console.error(logMessage);
                break;
            case LogLevel.TRACE:
                console.trace(logMessage);
                break;
        }
    }
}
