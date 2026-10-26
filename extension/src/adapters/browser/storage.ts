import type { StoragePort } from '../../application/runtime_ports.ts';
import type { BrowserStorageArea } from './api.ts';

export class BrowserStorage implements StoragePort {
    constructor(private readonly area: BrowserStorageArea | undefined) {}
    async get(key: string): Promise<unknown> {
        if (!this.area) throw new Error('storage-unavailable');
        const value = await this.area.get(key); return value[key];
    }
    async set(key: string, value: unknown): Promise<void> {
        if (!this.area) throw new Error('storage-unavailable');
        await this.area.set({ [key]: value });
    }
    async remove(key: string): Promise<void> {
        if (!this.area) throw new Error('storage-unavailable');
        await this.area.remove(key);
    }
    async protect(): Promise<boolean> {
        if (!this.area) return false;
        if (this.area.setAccessLevel) await this.area.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
        // Firefox/Safari use the API's restricted default, proved separately by loaded-browser tests.
        return true;
    }
}
