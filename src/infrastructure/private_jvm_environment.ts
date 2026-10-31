/** Encode one JDK launcher argument, independently of shell/JSON/Windows argv quoting. */
export function privateJvmHomeOption(home: string): string {
    if (!home || /[\0\r\n]/u.test(home)) throw new Error('Private JVM home is invalid.');
    const value = Array.from(home, character => {
        if (character === '"') return "'\"'";
        if (/[\s']/u.test(character)) return '"' + character + '"';
        return character;
    }).join('');
    return '-Duser.home=' + value;
}
