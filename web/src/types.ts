// Mirrors analyzer/src/pyskyline/export.py. Bump together with SCHEMA_VERSION.
export const SCHEMA_VERSION = 1;

export interface FunctionData {
  name: string;
  line: number;
  endLine: number;
  params: number;
  complexity: number;
}

export interface HistoryData {
  commits: number;
  linesChanged: number;
  lastChanged: number;
}

export interface FileData {
  path: string;
  module: string;
  lines: { total: number; code: number; comment: number; blank: number };
  classes: number;
  complexity: { total: number; max: number; average: number; module: number };
  functions: FunctionData[];
  imports: string[];
  packages: string[];
  history: HistoryData | null;
  hotspot: number;
  error: string | null;
}

export interface CityData {
  schema: number;
  generator: string;
  name: string;
  hasHistory: boolean;
  files: FileData[];
}

export function parseCity(text: string): CityData {
  const data: unknown = JSON.parse(text);
  if (
    typeof data !== "object" ||
    data === null ||
    !("schema" in data) ||
    !("files" in data) ||
    !Array.isArray(data.files)
  ) {
    throw new Error("This is not a pyskyline city file.");
  }
  if (data.schema !== SCHEMA_VERSION) {
    throw new Error(
      `Unsupported city format ${String(data.schema)}; this viewer reads format ${SCHEMA_VERSION}.`,
    );
  }
  return data as CityData;
}
