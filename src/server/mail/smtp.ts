import { readFileSync } from "node:fs";

import { SMTPServer, type SMTPServerOptions } from "smtp-server";

import { logger } from "@/server/logger";
import { hashIp, normalizeIp, rateLimitSubject } from "@/server/security/ip";
import { consumeRateLimit, isIpBlocked } from "@/server/security/rate-limit";
import { getSettings } from "@/server/settings";

import { absoluteMaxMessageBytes, acceptInbound, MAX_RECIPIENTS_PER_MESSAGE } from "./inbound";
import { resolveRecipient } from "./recipients";

function smtpError(code: number, message: string): Error {
  return Object.assign(new Error(message), { responseCode: code });
}

export interface SmtpServerConfig {
  hostname: string;
  tlsKeyFile?: string;
  tlsCertFile?: string;
  maxClients: number;
  useProxyProtocol: boolean;
  onQueued?: (jobId: string) => void;
}

/**
 * Inbound-only SMTP server (MX). It never relays: AUTH is disabled, every
 * recipient must map to a live inbox or domain probe, and unknown recipients
 * are refused during RCPT TO so nothing is stored for them and no bounces are
 * generated (avoids backscatter).
 */
export async function createSmtpServer(config: SmtpServerConfig): Promise<SMTPServer> {
  const maxBytes = await absoluteMaxMessageBytes();
  const tls =
    config.tlsKeyFile && config.tlsCertFile
      ? { key: readFileSync(config.tlsKeyFile), cert: readFileSync(config.tlsCertFile) }
      : null;

  const options: SMTPServerOptions = {
    name: config.hostname,
    banner: "Tempemail inbound ESMTP",
    authOptional: true,
    disabledCommands: ["AUTH"],
    secure: false,
    hideSTARTTLS: !tls,
    ...(tls ?? {}),
    size: maxBytes,
    maxClients: config.maxClients,
    socketTimeout: 60_000,
    closeTimeout: 30_000,
    disableReverseLookup: true,
    useProxy: config.useProxyProtocol,
    logger: false,

    onConnect(session, callback) {
      const ip = normalizeIp(session.remoteAddress) ?? "0.0.0.0";
      void (async () => {
        const settings = await getSettings();
        if (await isIpBlocked(hashIp(ip))) {
          throw smtpError(554, "5.7.1 Connection refused");
        }
        const rate = await consumeRateLimit(
          "smtp.connect",
          rateLimitSubject(ip),
          settings.rateLimits.smtpConnectionsPerMinute,
          60,
        );
        if (!rate.allowed) throw smtpError(421, "4.7.0 Too many connections, try again later");
      })().then(
        () => callback(),
        (error: unknown) =>
          callback(error instanceof Error ? error : smtpError(451, "4.3.0 Temporary failure")),
      );
    },

    onMailFrom(address, _session, callback) {
      const declared =
        address.args && typeof address.args.SIZE === "string" ? Number(address.args.SIZE) : 0;
      if (declared > maxBytes) {
        callback(smtpError(552, "5.3.4 Message size exceeds fixed maximum message size"));
        return;
      }
      callback();
    },

    onRcptTo(address, session, callback) {
      if (session.envelope.rcptTo.length >= MAX_RECIPIENTS_PER_MESSAGE) {
        callback(smtpError(452, "4.5.3 Too many recipients"));
        return;
      }
      resolveRecipient(address.address).then(
        (target) => {
          if (!target) callback(smtpError(550, "5.1.1 Mailbox unavailable"));
          else callback();
        },
        (error: unknown) => {
          logger.error("SMTP recipient lookup failed", { error });
          callback(smtpError(451, "4.3.0 Temporary lookup failure"));
        },
      );
    },

    onData(stream, session, callback) {
      const chunks: Buffer[] = [];
      let size = 0;
      stream.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size <= maxBytes) chunks.push(chunk);
      });
      stream.on("error", (error) => {
        logger.warn("SMTP data stream error", { error });
      });
      stream.on("end", () => {
        if (stream.sizeExceeded || size > maxBytes) {
          callback(smtpError(552, "5.3.4 Message size exceeds fixed maximum message size"));
          return;
        }
        const ip = normalizeIp(session.remoteAddress) ?? "0.0.0.0";
        const envelopeFrom = session.envelope.mailFrom ? session.envelope.mailFrom.address : null;
        acceptInbound({
          provider: "smtp",
          raw: Buffer.concat(chunks, size),
          recipients: session.envelope.rcptTo.map((recipient) => recipient.address),
          envelopeFrom: envelopeFrom || null,
          remoteIpHash: hashIp(ip),
        }).then(
          (outcome) => {
            if (!outcome.duplicate) config.onQueued?.(outcome.jobId);
            callback(null, "2.0.0 Message accepted for delivery");
          },
          (error: unknown) => {
            const status = (error as { status?: number }).status;
            if (status === 404) callback(smtpError(550, "5.1.1 Mailbox unavailable"));
            else if (status === 413) callback(smtpError(552, "5.3.4 Message too large"));
            else {
              logger.error("SMTP enqueue failed", { error });
              callback(smtpError(451, "4.3.0 Temporary failure, please retry"));
            }
          },
        );
      });
    },
  };

  const server = new SMTPServer(options);
  server.on("error", (error) => {
    logger.warn("SMTP server error", { error });
  });
  return server;
}

export function listen(server: SMTPServer, port: number, host: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => reject(error);
    server.server.once("error", onError);
    server.listen(port, host, () => {
      server.server.off("error", onError);
      resolve();
    });
  });
}

export function closeSmtpServer(server: SMTPServer): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}
