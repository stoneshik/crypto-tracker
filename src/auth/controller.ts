import type { RequestHandler } from 'express';
import type { Config } from '../config/types';
import { credentials } from '../validation';
import { AuthService } from './service';
import type { UserPrincipal } from './types';
import { clearRefreshCookie, readRefreshCookie, writeRefreshCookie } from './cookies';

export class AuthController {
    constructor(
        private readonly auth: AuthService,
        private readonly config: Config,
    ) {}

    register: RequestHandler = async (req, res) => {
        const { email, password } = credentials(req.body, true);
        res.status(201).json(await this.auth.register(email, password));
    };

    profile: RequestHandler = (_req, res) => {
        res.json((res.locals.principal as UserPrincipal).user);
    };

    login: RequestHandler = async (req, res) => {
        const { email, password } = credentials(req.body, false);
        const result = await this.auth.login(email, password);
        writeRefreshCookie(res, this.config, result.refreshToken, result.cookieMaxAge);
        res.status(201).json(result.body);
    };

    refresh: RequestHandler = (req, res) => {
        const result = this.auth.refresh(readRefreshCookie(req));
        writeRefreshCookie(res, this.config, result.refreshToken, result.cookieMaxAge);
        res.json(result.body);
    };

    logout: RequestHandler = (req, res) => {
        this.auth.logout(req.headers.authorization, readRefreshCookie(req));
        clearRefreshCookie(res, this.config);
        res.status(204).end();
    };
}
