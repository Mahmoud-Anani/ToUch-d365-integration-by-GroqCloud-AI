import { networkInterfaces } from 'node:os';

function octets(address: string): number[] | undefined {
  const values = address.split('.').map(Number);
  if (values.length !== 4 || values.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return undefined;
  return values;
}

export function isPrivateLanIpv4(address: string): boolean {
  const parts = octets(address);
  return Boolean(parts && (
    parts[0] === 10 ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168)
  ));
}

export function discoverLanIpv4(): string | undefined {
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === 'IPv4' && !address.internal && isPrivateLanIpv4(address.address)) return address.address;
    }
  }
  return undefined;
}
