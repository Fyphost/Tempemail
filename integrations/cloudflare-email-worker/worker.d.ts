export interface EmailWorkerMessage {
  from: string;
  to: string;
  rawSize: number;
  raw: ReadableStream<Uint8Array>;
  setReject(reason: string): void;
}

export interface EmailWorkerEnv {
  INBOUND_URL: string;
  INBOUND_WEBHOOK_SECRET: string;
  MAX_BYTES?: string;
}

declare const worker: {
  email(message: EmailWorkerMessage, env: EmailWorkerEnv): Promise<void>;
};

export default worker;
