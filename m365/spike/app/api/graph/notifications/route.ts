import { handleNotificationRequest, type Notification } from "@/lib/m365/changes";

export const runtime = "nodejs";

// Graph calls this endpoint directly, so there is no user session. The
// clientState secret set on each subscription is what authenticates it.
// Keep this route out of any proxy matcher (NEXT-5).

const globals = globalThis as unknown as { __m365Dirty?: Set<string> };

/**
 * Spike behaviour: remember which subscriptions changed. A real app would
 * enqueue a job that runs driveDelta or mailDelta for that subscription and,
 * for lifecycle events, renews the subscription or resyncs.
 */
function record(items: Notification[]) {
  globals.__m365Dirty ??= new Set();
  for (const item of items) globals.__m365Dirty.add(item.lifecycleEvent ? `${item.subscriptionId}:${item.lifecycleEvent}` : item.subscriptionId);
}

export async function POST(request: Request) {
  const clientState = process.env.GRAPH_NOTIFICATION_CLIENT_STATE;
  if (!clientState) return new Response(null, { status: 503 });
  return handleNotificationRequest(request, { clientState, onNotifications: record });
}
