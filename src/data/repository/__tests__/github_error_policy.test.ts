import {
    getGithubErrorStatus,
    isGithubAlreadyExists,
    isGithubNotFound,
    isGithubPermissionDenied,
} from "../github/github_error_policy";

describe("github error policy", () => {
    it("extracts numeric status safely", () => {
        expect(getGithubErrorStatus({ status: 404 })).toBe(404);
        expect(getGithubErrorStatus({ status: "404" })).toBeUndefined();
        expect(getGithubErrorStatus(null)).toBeUndefined();
    });

    it("recognizes not-found errors", () => {
        expect(isGithubNotFound({ status: 404 })).toBe(true);
        expect(isGithubNotFound({ status: 403 })).toBe(false);
    });

    it.each([
        { status: 403, message: 'Resource not accessible by integration' },
        { status: 403, message: 'Resource not accessible by personal access token' },
        { status: 403, message: 'Write permission is required' },
        { status: 403, message: 'Comment deletion is not permitted' },
        { status: 403, message: 'This operation is not allowed' },
        { status: 403, message: 'Must have admin rights to Repository.' },
    ])('recognizes an explicit permission denial: %j', (error) => {
        expect(isGithubPermissionDenied(error)).toBe(true);
    });

    it.each([
        { status: 401, message: 'Forbidden' },
        { status: 403 },
        { status: 403, message: 'Forbidden' },
        { status: 403, message: 'You have exceeded a secondary rate limit.' },
        { status: 403, message: 'Forbidden', response: { headers: { 'retry-after': '60' } } },
        { status: 403, message: 'Forbidden', response: { headers: { 'X-RateLimit-Remaining': 0 } } },
        { status: 403, message: 'Forbidden', response: { headers: { 'X-GitHub-SSO': 'required' } } },
    ])('does not misclassify authentication or rate-limit failures: %j', (error) => {
        expect(isGithubPermissionDenied(error)).toBe(false);
    });

    it("recognizes already-existing validation conflicts", () => {
        expect(isGithubAlreadyExists({ status: 422, message: "Label already exists" })).toBe(true);
        expect(isGithubAlreadyExists({
            status: 422,
            message: "Validation Failed",
            response: {
                data: {
                    errors: [{ resource: "Label", code: "already_exists", field: "name" }],
                },
            },
        })).toBe(true);
        expect(isGithubAlreadyExists({
            status: 422,
            message: 'Validation Failed: {"resource":"Label","code":"already_exists","field":"name"}',
        })).toBe(true);
        expect(isGithubAlreadyExists({ status: 422 })).toBe(false);
        expect(isGithubAlreadyExists({ status: 422, message: "invalid color" })).toBe(false);
        expect(isGithubAlreadyExists({ status: 409, message: "already exists" })).toBe(false);
    });
});
