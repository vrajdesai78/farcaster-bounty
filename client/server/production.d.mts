import type { Server } from 'node:http';

export interface RelayServerOptions {
  origin: string;
  loginHash: string;
  target?: string;
  directory?: string;
  guide?: string;
  rpcAuth?: string;
  readLimit?: number;
  writeLimit?: number;
}

export function createRelayServer(options: RelayServerOptions): Server;
