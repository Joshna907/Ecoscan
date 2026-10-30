export type ApplicationErrorCode =
  | 'INVALID_SCAN' | 'ANALYSIS_NOT_FOUND' | 'ANALYSIS_EXPIRED' | 'CONFIRMATION_CONFLICT'
  | 'OFFER_NOT_FOUND' | 'ALREADY_REDEEMED' | 'INSUFFICIENT_POINTS'
  | 'SESSION_CAPACITY' | 'SCAN_STORAGE_LIMIT' | 'SESSION_EXPIRED' | 'ANALYSIS_NOT_READY' | 'ANALYSIS_FAILED'
  | 'JOB_QUEUE_FULL'

// Services describe failures without choosing HTTP status codes.
export class ApplicationError extends Error {
  constructor(public readonly code: ApplicationErrorCode, message: string) {
    super(message)
    this.name = 'ApplicationError'
  }
}
