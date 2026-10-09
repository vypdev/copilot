import { writable } from 'svelte/store';
import type { SetupLocale } from './catalog';

export const setupLocale = writable<SetupLocale>('en');
