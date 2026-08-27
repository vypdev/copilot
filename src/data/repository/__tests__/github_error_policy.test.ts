import { getGithubErrorStatus, isGithubAlreadyExists, isGithubNotFound } from "../github/github_error_policy";

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
