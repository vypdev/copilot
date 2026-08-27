export function tagReference(tag: string): string {
    return `tags/${tag}`;
}

export function tagReferencePath(tag: string): string {
    return `refs/${tagReference(tag)}`;
}

export function releaseName(version: string, title: string): string {
    return `${version} - ${title}`;
}
