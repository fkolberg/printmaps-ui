// logger.ts

import { environment } from '../../environments/environment';

import { ConfigurationService } from '../services/configuration.service';

// Define an enum for the log levels
export enum LogLevel {
    TRACE = 'TRACE',
    DEBUG = 'DEBUG',
    INFO = 'INFO',
    ERROR = 'ERROR',  
}

export class Logger {
    private static configService: ConfigurationService;

    // Method to initialize the logger with ConfigurationService (Singleton pattern)
    static initialize(configService: ConfigurationService): void {
      if (!Logger.configService) {
        Logger.configService = configService;
      }
    }

    // Log function that accepts the log level enum
    static log(level: LogLevel, message: string): void {
        
        //const loggingLevel = Logger.configService.getLoggingLevel();
        //const loggingLevel = Logger.configService.appConf.autoUploadIntervalInSeconds;
        let loggingLevel = LogLevel.DEBUG;

        if (loggingLevel !== LogLevel.DEBUG && level === LogLevel.DEBUG) {
            // If in production mode, do not log DEBUG level messages
            return;
        }
      
        // Check if logging is enabled based on the level and configuration
        if (Logger.shouldLog(level, loggingLevel)) {
            Logger.outputLog(level, message);
        }
        
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

    // Determine if the log level should be logged based on the config level
    private static shouldLog(level: LogLevel, configLevel: LogLevel): boolean {
        const levels = Object.values(LogLevel);
        return levels.indexOf(level) >= levels.indexOf(configLevel);
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
