import { deflateRawSync } from 'node:zlib';

export function approvalCoverageZip(value: unknown, name = 'copilot-diff-coverage.json', method: 0 | 8 = 8): Buffer {
  const fileName = Buffer.from(name);
  const raw = Buffer.from(JSON.stringify(value));
  const data = method === 8 ? deflateRawSync(raw) : raw;
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(method, 8);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(raw.length, 22);
  local.writeUInt16LE(fileName.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(method, 10);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(raw.length, 24);
  central.writeUInt16LE(fileName.length, 28);
  const offset = local.length + fileName.length + data.length;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(central.length + fileName.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([local, fileName, data, central, fileName, eocd]);
}
