import type { Request, Response } from 'express';
import type { Config } from '../config/types';
import { invalid } from '../errors';

const cookieName = 'refresh_token';

function cookieOptions(config: Config) {
    return {
        httpOnly: true,
        secure: config.cookieSecure,
        sameSite: 'strict' as const,
        path: '/api/v1/auth',
    };
}

export function readRefreshCookie(req: Request): string | undefined {
    const values = (req.headers.cookie ?? '')
        .split(';')
        .map((value) => value.trim())
        .filter((value) => value.startsWith(`${cookieName}=`));
    if (values.length > 1) {
        throw invalid(cookieName, 'cookie', 'Повторяющаяся cookie', 400);
    }
    return values[0]?.slice(cookieName.length + 1);
}

export function writeRefreshCookie(
    res: Response,
    config: Config,
    token: string,
    maxAge: number,
): void {
    res.cookie(cookieName, token, { ...cookieOptions(config), maxAge });
}

export function clearRefreshCookie(res: Response, config: Config): void {
    res.clearCookie(cookieName, cookieOptions(config));
}
