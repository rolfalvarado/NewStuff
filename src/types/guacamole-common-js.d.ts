/**
 * Type declarations for guacamole-common-js
 * @see https://guacamole.apache.org/doc/guacamole-common-js/
 */
declare module "guacamole-common-js" {
    export class Client {
        constructor(tunnel: Tunnel);
        connect(data?: string): void;
        disconnect(): void;
        getDisplay(): Display;
        sendKeyEvent(pressed: number, keysym: number): void;
        sendMouseState(mouseState: Mouse.State): void;
        sendSize(width: number, height: number): void;
        onstatechange: ((state: number) => void) | null;
        onerror: ((error: Status) => void) | null;
        onclipboard: ((stream: InputStream, mimetype: string) => void) | null;
    }

    export class Display {
        getElement(): HTMLElement;
        getWidth(): number;
        getHeight(): number;
        scale(scale: number): void;
        onresize: ((width: number, height: number) => void) | null;
    }

    export class Tunnel {
        onerror: ((status: Status) => void) | null;
        onstatechange: ((state: number) => void) | null;
    }

    export class WebSocketTunnel extends Tunnel {
        constructor(tunnelURL: string);
    }

    export class HTTPTunnel extends Tunnel {
        constructor(tunnelURL: string, crossDomain?: boolean, extraTunnelHeaders?: Record<string, string>);
    }

    export class Status {
        code: number;
        message: string;
        isError(): boolean;
    }

    export class InputStream {
        onblob: ((data: string) => void) | null;
        onend: (() => void) | null;
    }

    export class Mouse {
        constructor(element: HTMLElement);
        onmousedown: ((state: Mouse.State) => void) | null;
        onmouseup: ((state: Mouse.State) => void) | null;
        onmousemove: ((state: Mouse.State) => void) | null;
    }

    export namespace Mouse {
        class State {
            x: number;
            y: number;
            left: boolean;
            middle: boolean;
            right: boolean;
            up: boolean;
            down: boolean;
        }
    }

    export class Keyboard {
        constructor(element: HTMLElement | Document);
        onkeydown: ((keysym: number) => boolean | void) | null;
        onkeyup: ((keysym: number) => void) | null;
    }
}
