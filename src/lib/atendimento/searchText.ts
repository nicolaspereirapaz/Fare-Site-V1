/** Shared text normalization: keep this module free of server/database imports. */
export const foldText = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
