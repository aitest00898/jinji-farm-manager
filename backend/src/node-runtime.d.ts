declare module "node:crypto" {
  export function randomUUID(): string;
}

declare module "node:fs/promises" {
  export interface FileHandle {
    appendFile(data: string, options?: { encoding?: string }): Promise<void>;
    sync(): Promise<void>;
    close(): Promise<void>;
  }
  export function appendFile(path: string, data: string, options?: { encoding?: string }): Promise<void>;
  export function mkdir(path: string, options?: { recursive?: boolean }): Promise<string | undefined>;
  export function open(path: string, flags: string): Promise<FileHandle>;
  export function readFile(path: string, options: { encoding: "utf8" }): Promise<string>;
  export function rm(path: string, options?: { force?: boolean; recursive?: boolean }): Promise<void>;
}

declare module "node:path" {
  export function dirname(path: string): string;
}
