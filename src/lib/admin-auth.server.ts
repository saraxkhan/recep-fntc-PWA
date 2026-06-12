// Server-only audit log writer. Uses getRequest() which is server-only.
import { getRequest } from "@tanstack/react-start/server";

export async function writeAuditLog(params: {
  actorId: string;
  actorEmail: string | null;
  action: string;
  resourceType?: string;
  resourceId?: string | null;
  details?: Record<string, unknown>;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let ip: string | null = null;
  let ua: string | null = null;
  try {
    const req = getRequest();
    ip =
      req?.headers.get("cf-connecting-ip") ??
      req?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      null;
    ua = req?.headers.get("user-agent") ?? null;
  } catch {}
  await (supabaseAdmin as any).from("admin_audit_logs").insert({
    actor_id: params.actorId,
    actor_email: params.actorEmail,
    action: params.action,
    resource_type: params.resourceType ?? null,
    resource_id: params.resourceId ?? null,
    details: params.details ?? {},
    ip_address: ip,
    user_agent: ua,
  });
}