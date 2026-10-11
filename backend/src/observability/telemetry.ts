// OpenTelemetry bootstrap (ARCHITECTURE.md §13, Decision #70). Must be
// the first import in index.ts: the instrumentations patch http, fastify,
// pino and socket.io as they're loaded, so anything required before this
// runs goes untraced.
//
// Off unless OTEL_EXPORTER_OTLP_ENDPOINT is set, so tests and a plain
// `make up` export nothing. The exporters read the rest of the standard
// OTEL_* variables themselves (headers, protocol, resource attributes) —
// pointing at Grafana Cloud vs. the local LGTM container is env-only.

import "dotenv/config";
import { FastifyOtelInstrumentation } from "@fastify/otel";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-proto";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-proto";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { PinoInstrumentation } from "@opentelemetry/instrumentation-pino";
import { RuntimeNodeInstrumentation } from "@opentelemetry/instrumentation-runtime-node";
import { SocketIoInstrumentation } from "@opentelemetry/instrumentation-socket.io";
import { logs, metrics, NodeSDK } from "@opentelemetry/sdk-node";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace";
import { SocketIoSpanNames } from "./socketIoSpanNames.js";

// Uptime checks hit /health every minute; engine.io's long-polling
// requests are transport noise (socket.io events get their own spans).
const UNTRACED_PATH_PREFIXES = ["/health", "/socket.io/"];

let sdk: NodeSDK | undefined;

if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
  sdk = new NodeSDK({
    serviceName: process.env.OTEL_SERVICE_NAME ?? "pulz-backend",
    // Renaming must run before the batch processor sees the span.
    spanProcessors: [new SocketIoSpanNames(), new BatchSpanProcessor({ exporter: new OTLPTraceExporter() })],
    // 60s is the SDK default and Grafana Cloud's free-tier billing unit
    // (1 data point per series per minute) — don't lower it.
    metricReaders: [new metrics.PeriodicExportingMetricReader({ exporter: new OTLPMetricExporter() })],
    logRecordProcessors: [new logs.BatchLogRecordProcessor({ exporter: new OTLPLogExporter() })],
    instrumentations: [
      new HttpInstrumentation({
        ignoreIncomingRequestHook: (req) => UNTRACED_PATH_PREFIXES.some((p) => req.url?.startsWith(p)),
        // The backend's only outbound HTTP is these exporters' own uploads.
        disableOutgoingRequestInstrumentation: true,
      }),
      new FastifyOtelInstrumentation({ registerOnInitialization: true, ignorePaths: "/health" }),
      // Ships Fastify's pino logs over OTLP with trace ids attached; stdout
      // logging is unchanged.
      new PinoInstrumentation(),
      new SocketIoInstrumentation(),
      new RuntimeNodeInstrumentation(),
    ],
  });
  sdk.start();
}

/** Flushes buffered spans/metrics/logs — call on shutdown so the last
 * minute before a deploy or Fly auto-stop isn't lost. */
export async function shutdownTelemetry(): Promise<void> {
  await sdk?.shutdown();
}
