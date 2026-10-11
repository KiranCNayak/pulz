import { SpanKind } from "@opentelemetry/api";
import type { Span, SpanProcessor } from "@opentelemetry/sdk-trace";

const EVENT_NAME_ATTRIBUTE = "messaging.socket.io.event_name";

/**
 * The Socket.IO instrumentation names every span after the namespace —
 * `receive /` or `send /` — and only records the event as an attribute, so
 * in Tempo and Grafana's Application Observability every game action is one
 * indistinguishable operation. This renames them to `receive answer:submit`,
 * `send question:broadcast`, etc.
 *
 * Safe for span-metric cardinality: receive spans only exist for events
 * with a registered handler (session.socket.ts), and every emitted event
 * name is server-defined — a client can't mint new span names.
 */
export class SocketIoSpanNames implements SpanProcessor {
  onStart(span: Span): void {
    const event = span.attributes[EVENT_NAME_ATTRIBUTE];
    if (typeof event !== "string") return;
    span.updateName(`${span.kind === SpanKind.CONSUMER ? "receive" : "send"} ${event}`);
  }

  onEnd(): void {}

  forceFlush(): Promise<void> {
    return Promise.resolve();
  }

  shutdown(): Promise<void> {
    return Promise.resolve();
  }
}
