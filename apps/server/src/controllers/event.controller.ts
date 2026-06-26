import type { Context } from "hono";

import type { AppBindings } from "../types/app";
import { ProtocolEventStreamDelivery } from "../services/protocol-event-stream-delivery";

export class EventController {
  private readonly delivery = new ProtocolEventStreamDelivery();

  stream(context: Context<AppBindings>) {
    const services = context.get("services");
    return this.delivery.stream(services.events, context.req.raw.signal);
  }
}