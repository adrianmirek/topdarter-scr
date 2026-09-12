import https from "node:https";
import { URL } from "node:url";

/**
 * JSON HTTP helper that does not use fetch/undici keep-alive.
 * On Windows, vercel dev process.exit() races undici async handles and
 * aborts with UV_HANDLE_CLOSING in src/win/async.c.
 */
export function httpsJsonRequest<T>(
  url: string,
  options: {
    method?: string;
    body?: string;
    headers?: Record<string, string>;
  } = {}
): Promise<T> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const body = options.body ?? null;
    const headers: Record<string, string> = { ...(options.headers ?? {}) };
    if (body) {
      headers["Content-Length"] = String(Buffer.byteLength(body));
    }

    const req = https.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || 443,
        path: `${parsed.pathname}${parsed.search}`,
        method: options.method ?? "GET",
        headers,
        agent: false,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          res.destroy();
          const text = Buffer.concat(chunks).toString("utf8");
          const status = res.statusCode ?? 0;
          if (status < 200 || status >= 300) {
            reject(new Error(`API request failed: ${status} ${res.statusMessage}`));
            return;
          }
          try {
            resolve(JSON.parse(text) as T);
          } catch (error) {
            reject(error);
          }
        });
      }
    );

    req.on("error", reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error("API request timed out"));
    });

    if (body) {
      req.write(body);
    }
    req.end();
  });
}
