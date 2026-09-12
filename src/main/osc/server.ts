/**
 * UDP OSC listener + sender.
 * Events: 'message' ({address, args, from}), 'error' (Error), 'listening' (port)
 */
import dgram from 'node:dgram';
import { EventEmitter } from 'node:events';
import { decodePacket, encodeMessage, type OscArg, type TypedArg } from './codec';

export interface OscIncoming {
  address: string;
  args: (number | string | boolean)[];
  from: string;
}

export class OscServer extends EventEmitter {
  private socket: dgram.Socket | null = null;
  private sender: dgram.Socket | null = null;
  port = 0;
  lastError: string | null = null;

  get listening(): boolean {
    return this.socket !== null;
  }

  async start(port: number): Promise<void> {
    this.stop();
    const s = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    s.on('message', (msg, rinfo) => {
      try {
        for (const m of decodePacket(msg)) {
          const args = m.args.filter((a): a is number | string | boolean => typeof a === 'number' || typeof a === 'string' || typeof a === 'boolean');
          this.emit('message', { address: m.address, args, from: `${rinfo.address}:${rinfo.port}` } satisfies OscIncoming);
        }
      } catch (e) {
        this.emit('error', new Error(`bad OSC packet from ${rinfo.address}: ${e instanceof Error ? e.message : String(e)}`));
      }
    });
    s.on('error', (e) => {
      this.lastError = e.message;
      this.emit('error', e);
      if (this.socket === s) this.socket = null;
    });
    await new Promise<void>((resolve, reject) => {
      s.once('error', reject);
      s.bind(port, '0.0.0.0', () => {
        s.off('error', reject);
        resolve();
      });
    });
    this.socket = s;
    this.port = port;
    this.lastError = null;
    this.emit('listening', port);
  }

  stop(): void {
    this.socket?.close();
    this.socket = null;
    this.port = 0;
  }

  send(host: string, port: number, address: string, args: (OscArg | TypedArg)[] = []): void {
    if (!this.sender) {
      this.sender = dgram.createSocket('udp4');
      this.sender.on('error', () => undefined);
    }
    this.sender.send(encodeMessage(address, args), port, host, () => undefined);
  }

  close(): void {
    this.stop();
    this.sender?.close();
    this.sender = null;
  }
}
