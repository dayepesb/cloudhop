export type CloudhopErrorCode =
  | 'ALIAS_NOT_FOUND'
  | 'ALIAS_EXISTS'
  | 'SOURCE_NOT_FOUND'
  | 'SOURCE_EXISTS'
  | 'TARGET_NOT_FOUND'
  | 'PROVIDER_NOT_AVAILABLE'
  | 'PROVIDER_DISABLED'
  | 'CLI_MISSING'
  | 'INVALID_NAME'
  | 'NOT_INTERACTIVE'
  | 'LOGIN_REQUIRED'
  | 'PROD_CONFIRMATION_REQUIRED'
  | 'LOGIN_FAILED';

/** An expected failure with a message meant for the user and an optional hint. */
export class CloudhopError extends Error {
  constructor(
    readonly code: CloudhopErrorCode,
    message: string,
    readonly hint?: string,
  ) {
    super(message);
    this.name = 'CloudhopError';
  }
}
