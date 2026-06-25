/**
 * Minimal ambient types for irc-framework (the package ships no types).
 * We only declare what achat uses; event payloads are loose by design and
 * narrowed inside IrcService.
 */
declare module 'irc-framework' {
  export interface ClientOptions {
    host: string;
    port: number;
    tls?: boolean;
    nick: string;
    username?: string;
    gecos?: string;
    version?: string;
    account?: { account: string; password?: string };
    auto_reconnect?: boolean;
    auto_reconnect_max_wait?: number;
    auto_reconnect_max_retries?: number;
    ping_interval?: number;
    ping_timeout?: number;
    sasl_disconnect_on_fail?: boolean;
    sasl_mechanism?: string;
    [key: string]: unknown;
  }

  export class Client {
    constructor(options?: Partial<ClientOptions>);
    connect(options?: Partial<ClientOptions>): void;
    quit(message?: string): void;
    raw(...args: string[]): void;
    rawString(...args: string[]): string;
    changeNick(nick: string): void;
    say(target: string, message: string): void;
    notice(target: string, message: string): void;
    action(target: string, message: string): void;
    join(channel: string, key?: string): void;
    part(channel: string, message?: string): void;
    mode(channel: string, mode: string, extra?: string[]): void;
    whois(target: string, cb?: (event: unknown) => void): void;
    who(target: string, cb?: (event: unknown) => void): void;
    on(event: string, listener: (...args: any[]) => void): this;
    once(event: string, listener: (...args: any[]) => void): this;
    removeAllListeners(event?: string): this;
    user: { nick: string; username: string; gecos: string };
    options: ClientOptions;
    connected: boolean;
  }

  export const Helpers: { parseMask(mask: string): { nick: string; user: string; host: string } };
}
