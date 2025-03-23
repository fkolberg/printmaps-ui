// logging.service.ts
import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class LoggingService {

  constructor() { }

  // Log a message at 'info' level
  logInfo(message: string): void {
    console.info('INFO:', message);
  }

  // Log a message at 'warning' level
  logWarning(message: string): void {
    console.warn('WARNING:', message);
  }

  // Log a message at 'error' level
  logError(message: string): void {
    console.error('ERROR:', message);
  }

  // Log a generic message (you can expand this with other log levels as needed)
  log(message: string): void {
    console.log('LOG:', message);
  }
}
