declare const __DOUYIN_IDENTITY__: "audience" | "anchor";

declare module "@/core/dycast" {
  export class DyCast {
    constructor(roomNo: string);
    on(event: string, listener: (...args: never[]) => void): void;
    connect(): Promise<void>;
    close(code: number, reason: string): void;
  }
}
