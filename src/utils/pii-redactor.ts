/**
 * PII Redactor for GDPR/DSGVO Compliance
 *
 * Redacts personally identifiable information from logs and error reports.
 * Patterns are optimized for German/DACH region data formats.
 */

// Redaction placeholder
const REDACTED = '[REDACTED]';

// Phone number patterns (German/international formats)
const PHONE_PATTERNS = [
  // International format: +49 123 4567890, +49-123-4567890, +491234567890
  /\+49[\s.-]?\d{2,4}[\s.-]?\d{3,8}[\s.-]?\d{0,6}/g,
  // German prefix: 0049 123 4567890
  /0049[\s.-]?\d{2,4}[\s.-]?\d{3,8}[\s.-]?\d{0,6}/g,
  // Local format: 0123 4567890, 0123-4567890, 01234567890
  /\b0\d{2,4}[\s.-]?\d{3,8}[\s.-]?\d{0,6}\b/g,
  // Generic international: +1 234 567 8901, etc.
  /\+\d{1,3}[\s.-]?\d{2,4}[\s.-]?\d{3,4}[\s.-]?\d{3,4}/g,
];

// Email pattern
const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

// German name patterns (after common labels)
const NAME_LABEL_PATTERNS = [
  // "Name: John Doe" or "Kunde: Max Mustermann"
  /(?:Name|Kunde|Kundin|Anrufer|Anruferin|Patient|Patientin|Herr|Frau|Mandant|Mandantin)[:.]?\s+([A-ZÄÖÜ][a-zäöüß]+(?:\s+[A-ZÄÖÜ][a-zäöüß]+){0,2})/gi,
];

// IBAN pattern (German bank accounts)
const IBAN_PATTERN = /\b[A-Z]{2}\d{2}[\s]?(?:\d{4}[\s]?){4}\d{2}\b/g;

/**
 * Redacts a single string value
 */
export function redactString(value: string): string {
  if (!value || typeof value !== 'string') {
    return value;
  }

  let redacted = value;

  // Redact phone numbers
  for (const pattern of PHONE_PATTERNS) {
    redacted = redacted.replace(pattern, REDACTED);
  }

  // Redact emails
  redacted = redacted.replace(EMAIL_PATTERN, REDACTED);

  // Redact IBANs
  redacted = redacted.replace(IBAN_PATTERN, REDACTED);

  // Redact names after labels (preserving the label)
  for (const pattern of NAME_LABEL_PATTERNS) {
    redacted = redacted.replace(pattern, (match, name) => {
      return match.replace(name, REDACTED);
    });
  }

  return redacted;
}

/**
 * Recursively redacts PII from an object
 */
export function redactObject<T>(obj: T, depth = 0): T {
  // Prevent infinite recursion
  if (depth > 10) {
    return obj;
  }

  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    return redactString(obj) as T;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => redactObject(item, depth + 1)) as T;
  }

  if (typeof obj === 'object') {
    const redacted: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      // Always redact these field names completely
      const sensitiveFields = [
        'callerNumber',
        'customerPhone',
        'customerEmail',
        'customerName',
        'callerName',
        'email',
        'phone',
        'phoneNumber',
        'name',
        'ipAddress',
        'ip',
      ];

      const lowerKey = key.toLowerCase();

      if (sensitiveFields.some((f) => lowerKey.includes(f.toLowerCase()))) {
        redacted[key] = REDACTED;
      } else if (typeof value === 'string') {
        redacted[key] = redactString(value);
      } else if (typeof value === 'object' && value !== null) {
        redacted[key] = redactObject(value, depth + 1);
      } else {
        redacted[key] = value;
      }
    }

    return redacted as T;
  }

  return obj;
}

/**
 * Pino redact paths configuration
 * Use with pino's built-in redaction for better performance
 */
export const pinoRedactPaths = [
  'callerNumber',
  'customerPhone',
  'customerEmail',
  'customerName',
  'callerName',
  'email',
  'phone',
  'phoneNumber',
  'ipAddress',
  'ip',
  'userAgent',
  '*.callerNumber',
  '*.customerPhone',
  '*.customerEmail',
  '*.customerName',
  '*.callerName',
  '*.email',
  '*.phone',
  '*.phoneNumber',
  '*.ipAddress',
  '*.ip',
  'req.headers.authorization',
  'req.headers.cookie',
  '*.password',
  '*.passwordHash',
  '*.token',
  '*.refreshToken',
];

/**
 * Creates a Sentry beforeSend handler that redacts PII
 */
export function createSentryBeforeSend() {
  return (event: Record<string, unknown>): Record<string, unknown> => {
    // Redact exception messages
    if (event.exception && typeof event.exception === 'object') {
      const exception = event.exception as Record<string, unknown>;
      if (Array.isArray(exception.values)) {
        exception.values = exception.values.map(
          (ex: Record<string, unknown>) => {
            if (ex.value && typeof ex.value === 'string') {
              ex.value = redactString(ex.value);
            }
            return ex;
          }
        );
      }
    }

    // Redact breadcrumbs
    if (Array.isArray(event.breadcrumbs)) {
      event.breadcrumbs = event.breadcrumbs.map(
        (crumb: Record<string, unknown>) => {
          if (crumb.message && typeof crumb.message === 'string') {
            crumb.message = redactString(crumb.message);
          }
          if (crumb.data && typeof crumb.data === 'object') {
            crumb.data = redactObject(crumb.data);
          }
          return crumb;
        }
      );
    }

    // Redact extra context
    if (event.extra && typeof event.extra === 'object') {
      event.extra = redactObject(event.extra);
    }

    // Redact tags
    if (event.tags && typeof event.tags === 'object') {
      event.tags = redactObject(event.tags);
    }

    // Redact user data (keep id for tracking)
    if (event.user && typeof event.user === 'object') {
      const user = event.user as Record<string, unknown>;
      if (user.email) user.email = REDACTED;
      if (user.username) user.username = REDACTED;
      if (user.ip_address) user.ip_address = REDACTED;
    }

    return event;
  };
}

/**
 * Utility to hash identifiers for audit logging
 * Uses a simple hash - in production, use crypto.createHash('sha256')
 */
export function hashIdentifier(identifier: string): string {
  // Simple hash for now - replace with crypto in production
  let hash = 0;
  for (let i = 0; i < identifier.length; i++) {
    const char = identifier.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}
