export interface InventoryFilters {
    readonly query: string; readonly family: string; readonly surface: string; readonly mode: string; readonly permission: string;
    readonly phase: string; readonly source: string; readonly profile: string; readonly setting: string; readonly favorites: boolean;
}
export interface InventoryNavigationState { readonly filters: InventoryFilters; readonly page: number }
export const EMPTY_INVENTORY_FILTERS: InventoryFilters = Object.freeze({ query: '', family: '', surface: '', mode: '', permission: '', phase: '', source: '', profile: '', setting: '', favorites: false });
export const EMPTY_INVENTORY_NAVIGATION: InventoryNavigationState = Object.freeze({ filters: EMPTY_INVENTORY_FILTERS, page: 1 });
