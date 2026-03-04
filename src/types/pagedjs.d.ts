// Type declarations for pagedjs
declare module 'pagedjs' {
    export class Previewer {
        preview(
            content: HTMLElement | string,
            stylesheets: string[],
            renderTo: HTMLElement
        ): Promise<{
            total: number;
            pages: HTMLElement[];
        }>;
    }

    export class Polisher {
        add(...styles: (string | CSSStyleSheet)[]): void;
    }

    export class Chunker {
        flow(content: HTMLElement, renderTo: HTMLElement): Promise<void>;
    }

    export function registerHandlers(...handlers: unknown[]): void;
}
