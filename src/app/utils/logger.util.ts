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
    private static loggingLevel: LogLevel = LogLevel.INFO; // default

    // Method to initialize the logger with ConfigurationService (Singleton pattern)
    static initialize(configService: ConfigurationService): void {
      if (!Logger.configService) {
        Logger.configService = configService;
        Logger.loggingLevel = Logger.parseLogLevel(configService.appConf.loggingLevel);
      }
    }

    private static parseLogLevel(value: string): LogLevel {
        if (Object.values(LogLevel).includes(value as LogLevel)) {
            return value as LogLevel;
        }
        // Fallback to INFO or any default
        return LogLevel.INFO;
    }

    // Log function that accepts the log level enum
    static log(level: LogLevel, ...args: any[]): void {

        // Temporarily add a guard in your logger to warn you when it’s not yet initialized:
        if (!Logger.configService) {
            console.warn('Logger not initialized. Call Logger.initialize(configService) before using it.');
            return;
        }      

        // Don't log DEBUG in production
        if (environment.production && level === LogLevel.DEBUG) {
            return;
    }
      
        // Check if logging is enabled based on the level and configuration
        if (Logger.shouldLog(level, Logger.loggingLevel)) {
            Logger.outputLog(level, ...args);
        }           
    }

    static trace(...args: any[]): void {
        Logger.log(LogLevel.TRACE, ...args);
    }

    static debug(...args: any[]): void {
        Logger.log(LogLevel.DEBUG, ...args);
    }

    static info(...args: any[]): void {
        Logger.log(LogLevel.INFO, ...args);
    }

    static error(...args: any[]): void {
        Logger.log(LogLevel.ERROR, ...args);
    }

    // Determine if the log level should be logged based on the config level
    private static shouldLog(level: LogLevel, configLevel: LogLevel): boolean {
        const levels = Object.values(LogLevel);
        return levels.indexOf(level) >= levels.indexOf(configLevel);
    }

    // Private function to output the log message to the console
    private static outputLog(level: LogLevel, ...args: any[]): void {
        const timestamp = new Date().toISOString();
        const stack = new Error().stack;
        let callerInfo = '';

        if (stack) {
            const stackLines = stack.split('\n');
            if (stackLines.length > 2) {
                callerInfo = stackLines[2].trim(); // Extract method name
            }
        }

        const prefix = `${timestamp} [${level}] ${callerInfo} -`;

        // Output to console with the correct method and all arguments
        switch (level) {
            case LogLevel.DEBUG:
                console.debug(prefix, ...args);
                break;
            case LogLevel.INFO:
                console.info(prefix, ...args);
                break;
            case LogLevel.ERROR:
                console.error(prefix, ...args);
                break;
            case LogLevel.TRACE:
                console.trace(prefix, ...args);
                break;
        }
    }
}
