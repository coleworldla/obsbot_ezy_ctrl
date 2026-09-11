/**
 * UDP VISCA-over-IP client with Sony framing, per-camera sequence numbers,
 * ACK / completion / error handling and timeouts.
 */
import dgram from 'node:dgram';
import { EventEmitter } from 'node:events';
import {
  PT_COMMAND,
  PT_CONTROL_REPLY,
  PT_INQUIRY,
  VISCA_ERRORS,
  classifyReply,
  frame,
  parseFrame,
  resetSequencePacket,
} from './packet';

export interface ViscaClientOptions {
  /** How long to wait for a completion / reply before giving up. Default 1500 ms. */
  timeoutMs?: number;
  /** Payload type used for commands. Default 0x0100. */
  commandPayloadType?: number;
  /** Payload type used for inquiries. Default 0x0110 (Sony); some cameras want 0x0100. */
  inquiryPayloadType?: number;
  bindAddress?: string;
}

export class ViscaError extends Error {
  constructor(
    message: string,
    public readonly code?: number,
  ) {
    super(message);
    this.name = 'ViscaError';
  }
}

interface Pending {
  kind: 'command' | 'inquiry';
  acked: boolean;
  resolve: (data: Buffer) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

export class ViscaClient extends EventEmitter {
  private socket: dgram.Socket | null = null;
  private seq = 1;
  private readonly pending = new Map<number, Pending>();
  private controlWaiter: (() => void) | null = null;
  readonly timeoutMs: number;
  private readonly cmdType: number;
  private readonly inqType: number;
  private readonly bindAddress?: string;

  constructor(
    readonly host: string,
    readonly port = 52381,
    opts: ViscaClientOptions = {},
  ) {
    super();
    this.timeoutMs = opts.timeoutMs ?? 1500;
    this.cmdType = opts.commandPayloadType ?? PT_COMMAND;
    this.inqType = opts.inquiryPayloadType ?? PT_INQUIRY;
    this.bindAddress = opts.bindAddress;
  }

  get isOpen(): boolean {
    return this.socket !== null;
  }

  /** Bind a socket and reset the camera's sequence counter. Never throws for a silent camera. */
  async open(): Promise<void> {
    if (this.socket) return;
    const s = dgram.createSocket('udp4');
    s.on('message', (m) => this.onMessage(m));
    s.on('error', (e) => this.emit('error', e));
    await new Promise<void>((resolve, reject) => {
      s.once('error', reject);
      s.bind(0, this.bindAddress, () => {
        s.off('error', reject);
        resolve();
      });
    });
    this.socket = s;
    this.seq = 1;
    await this.resetSequence(500);
  }

  close(): void {
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(new ViscaError('client closed'));
    }
    this.pending.clear();
    this.socket?.close();
    this.socket = null;
  }

  /** Send a command; resolves on completion (or on ACK if the completion never comes). */
  command(payload: Buffer): Promise<void> {
    return this.send(this.cmdType, payload, 'command').then(() => undefined);
  }

  /** Send an inquiry; resolves with the data bytes between `90 50` and `FF`. */
  inquiry(payload: Buffer): Promise<Buffer> {
    return this.send(this.inqType, payload, 'inquiry');
  }

  private resetSequence(waitMs: number): Promise<void> {
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        this.controlWaiter = null;
        resolve();
      };
      const timer = setTimeout(done, waitMs);
      this.controlWaiter = done;
      this.socket!.send(resetSequencePacket(0), this.port, this.host, (err) => {
        if (err) done();
      });
    });
  }

  private send(type: number, payload: Buffer, kind: Pending['kind']): Promise<Buffer> {
    const socket = this.socket;
    if (!socket) return Promise.reject(new ViscaError('client not open'));
    const seq = this.seq;
    this.seq = this.seq >= 0xffffffff ? 1 : this.seq + 1;
    const buf = frame(type, seq, payload);
    return new Promise<Buffer>((resolve, reject) => {
      const timer = setTimeout(() => {
        const p = this.pending.get(seq);
        if (!p) return;
        this.pending.delete(seq);
        if (p.kind === 'command' && p.acked) resolve(Buffer.alloc(0));
        else reject(new ViscaError(`no reply from ${this.host}:${this.port} within ${this.timeoutMs} ms`));
      }, this.timeoutMs);
      this.pending.set(seq, { kind, acked: false, resolve, reject, timer });
      socket.send(buf, this.port, this.host, (err) => {
        if (err) {
          clearTimeout(timer);
          this.pending.delete(seq);
          reject(err);
        }
      });
    });
  }

  private settle(seq: number, p: Pending): void {
    clearTimeout(p.timer);
    this.pending.delete(seq);
  }

  private onMessage(msg: Buffer): void {
    const f = parseFrame(msg);
    if (!f) return;
    this.emit('frame', f);
    if (f.payloadType === PT_CONTROL_REPLY) {
      this.controlWaiter?.();
      return;
    }
    const reply = classifyReply(f.payload);
    let seq = f.seq;
    let p = this.pending.get(seq);
    if (!p) {
      // Camera did not echo our sequence number: fall back to the oldest outstanding request.
      const first = this.pending.entries().next();
      if (first.done) return;
      [seq, p] = first.value;
    }
    switch (reply.kind) {
      case 'ack':
        p.acked = true;
        break;
      case 'completion':
        this.settle(seq, p);
        p.resolve(Buffer.alloc(0));
        break;
      case 'inquiry':
        this.settle(seq, p);
        p.resolve(Buffer.from(reply.data));
        break;
      case 'error': {
        this.settle(seq, p);
        const code = reply.errorCode ?? 0;
        p.reject(new ViscaError(VISCA_ERRORS[code] ?? `VISCA error 0x${code.toString(16)}`, code));
        break;
      }
      default:
        break;
    }
  }
}
