export interface AuthenticatedUserPort {
    getUserFromToken(token: string): Promise<string>;
    getTokenUserDetails(token: string): Promise<{ name: string; email: string }>;
}

export interface BoundAuthenticatedUserPort {
    getUser(): Promise<string>;
    getUserDetails(): Promise<{ name: string; email: string }>;
}
