import { keys, record } from './value.ts';

export const CENTER_COMMANDS = Object.freeze(['open-center', 'open-features', 'open-profiles', 'open-help'] as const);
export type CenterCommand = typeof CENTER_COMMANDS[number];
export interface CenterBinding { readonly command: CenterCommand; readonly binding: string }
const destinations = Object.freeze({ 'open-center': 'overview', 'open-features': 'features', 'open-profiles': 'profiles', 'open-help': 'help' } as const);
export function centerCommandRoute(command: CenterCommand): typeof destinations[CenterCommand] { return destinations[command]; }
export function validCenterBindings(value: unknown): value is readonly CenterBinding[] {
    if (!Array.isArray(value) || value.length > 4 || Object.keys(value).length !== value.length) return false;
    const commands = new Set<string>(); const chords = new Set<string>();
    for (const binding of value) {
        if (!record(binding) || !keys(binding, ['command', 'binding']) || typeof binding.command !== 'string'
            || !CENTER_COMMANDS.includes(binding.command as CenterCommand)
            || typeof binding.binding !== 'string' || !/^Alt\+Shift\+[A-Z]$(?![\s\S])/u.test(binding.binding)
            || commands.has(binding.command) || chords.has(binding.binding)) return false;
        commands.add(binding.command); chords.add(binding.binding);
    }
    return true;
}
export interface ShortcutStroke {
    readonly key: string; readonly code: string; readonly trusted: boolean; readonly prevented: boolean; readonly repeat: boolean;
    readonly composing: boolean; readonly altGraph: boolean; readonly alt: boolean; readonly shift: boolean;
    readonly control: boolean; readonly meta: boolean;
}
/** A received physical position is neither a conflict-free certificate nor permission for another operation. */
export function shortcutCommand(bindings: readonly CenterBinding[], stroke: ShortcutStroke): CenterCommand | null {
    if (!stroke.trusted || stroke.prevented || stroke.repeat || stroke.composing || stroke.altGraph
        || !stroke.alt || !stroke.shift || stroke.control || stroke.meta || !/^Key[A-Z]$(?![\s\S])/u.test(stroke.code)
        || stroke.key.length === 0 || stroke.key.length > 4 || /[\p{Cc}\p{Cf}\p{Cs}\p{Cn}\p{Z}]/u.test(stroke.key) || ['Dead', 'Process', 'Unidentified'].includes(stroke.key)
        || !validCenterBindings(bindings)) return null;
    return bindings.find(binding => binding.binding === `Alt+Shift+${stroke.code.slice(3)}`)?.command ?? null;
}
