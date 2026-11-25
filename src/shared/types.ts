export interface StoredValue {
  value: string;
  count: number;
  lastUsed: number;
  sites: string[];
}

export interface FieldRecord {
  /** `g:<token>` (shared across sites) or `s:<origin>|<ident>` (one site). */
  key: string;
  label: string;
  values: StoredValue[];
}

export type FieldMap = Record<string, FieldRecord>;

export interface Settings {
  enabled: boolean;
  disabledSites: string[];
  maxValuesPerField: number;
}

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  disabledSites: [],
  maxValuesPerField: 20,
};

export interface Suggestion {
  value: string;
  count: number;
  lastUsed: number;
  fromSite: boolean;
}

export interface SaveEntry {
  keys: string[];
  label: string;
  value: string;
}

export interface ExportFile {
  version: 1;
  exportedAt: number;
  fields: FieldMap;
  settings: Settings;
}
