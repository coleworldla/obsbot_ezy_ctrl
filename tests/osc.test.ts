import dgram from 'node:dgram';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { decodeMessage, decodePacket, encodeMessage } from '../src/main/osc/codec';
import { OscServer } from '../src/main/osc/server';

describe('OSC codec', () => {
  it('encodes address, type tags and padded arguments', () => {
    const b = encodeMessage('/cam/1/zoom', [2.5]);
    expect(b.length % 4).toBe(0);
    expect(b.toString('latin1', 0, 12)).toBe('/cam/1/zoom\0');
    expect(b.toString('latin1', 12, 16)).toBe(',f\0\0');
    expect(b.readFloatBE(16)).toBeCloseTo(2.5);
  });

  it('round-trips ints, floats, strings, booleans and blobs', () => {
    const b = encodeMessage('/x', [7, -1.25, 'hello', true, false, null, new Uint8Array([1, 2, 3])]);
    const m = decodeMessage(b);
    expect(m.address).toBe('/x');
    expect(m.args[0]).toBe(7);
    expect(m.args[1]).toBeCloseTo(-1.25);
    expect(m.args[2]).toBe('hello');
    expect(m.args[3]).toBe(true);
    expect(m.args[4]).toBe(false);
    expect(m.args[5]).toBeNull();
    expect([...(m.args[6] as Uint8Array)]).toEqual([1, 2, 3]);
  });

  it('honours explicit types', () => {
    const b = encodeMessage('/t', [{ type: 'f', value: 3 }, { type: 'i', value: 4.9 }, { type: 's', value: 12 }]);
    expect(decodeMessage(b).args).toEqual([3, 4, '12']);
  });

  it('decodes messages without a type tag string', () => {
    expect(decodeMessage(Buffer.from('/cam/1/home\0'))).toEqual({ address: '/cam/1/home', args: [] });
  });

  it('flattens bundles', () => {
    const m1 = encodeMessage('/a', [1]);
    const m2 = encodeMessage('/b', ['x']);
    const size = (b: Buffer) => {
      const s = Buffer.alloc(4);
      s.writeInt32BE(b.length);
      return s;
    };
    const bundle = Buffer.concat([Buffer.from('#bundle\0'), Buffer.alloc(8), size(m1), m1, size(m2), m2]);
    expect(decodePacket(bundle).map((m) => m.address)).toEqual(['/a', '/b']);
  });
});

describe('OscServer', () => {
  const server = new OscServer();
  let port = 0;

  beforeAll(async () => {
    await server.start(0);
    port = (server as unknown as { socket: dgram.Socket }).socket.address().port;
  });

  afterAll(() => server.close());

  it('receives a message sent over UDP', async () => {
    const got = new Promise<{ address: string; args: unknown[] }>((resolve) => server.once('message', resolve));
    server.send('127.0.0.1', port, '/cam/1/preset/4', [1]);
    const m = await got;
    expect(m.address).toBe('/cam/1/preset/4');
    expect(m.args).toEqual([1]);
  });
});
