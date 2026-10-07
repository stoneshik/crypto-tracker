export class ApiError extends Error {
    constructor(
        public readonly status: number,
        public readonly code: string,
        message: string,
        public readonly invalidParams?: { name: string; in: string; reason: string }[],
        public readonly retryAfterSeconds?: number,
    ) {
        super(message);
    }
}

export const unauthorized = () =>
    new ApiError(401, 'UNAUTHORIZED', 'Требуется действующая авторизация');

export const invalid = (name: string, location: string, reason: string, status = 422) =>
    new ApiError(status, 'VALIDATION_FAILED', 'Проверьте параметры запроса', [
        { name, in: location, reason },
    ]);

type FailureCode =
    | 'UPSTREAM_TIMEOUT'
    | 'UPSTREAM_UNAVAILABLE'
    | 'UPSTREAM_RATE_LIMITED'
    | 'UPSTREAM_AUTHENTICATION_FAILED'
    | 'UPSTREAM_INVALID_RESPONSE'
    | 'QUOTE_MISSING'
    | 'INTERNAL_ERROR';

export class UpstreamError extends Error {
    constructor(
        public readonly code: FailureCode,
        message: string,
        public readonly retryable = false,
        public readonly retryAfterSeconds = 0,
    ) {
        super(message);
    }
}
