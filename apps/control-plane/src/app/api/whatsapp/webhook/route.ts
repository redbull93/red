import { ingestEnvironmentEvent } from "@red/orchestrator";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * WhatsApp Cloud API Webhook Verification (GET)
 * Meta checks this endpoint when configuring webhooks in Meta App Dashboard.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const expectedToken =
    process.env.WHATSAPP_VERIFY_TOKEN || "standup_whatsapp_secret";

  if (mode === "subscribe" && token === expectedToken) {
    return new NextResponse(challenge ?? "", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  return NextResponse.json(
    { error: "Forbidden: verification token mismatch" },
    { status: 403 },
  );
}

type WhatsAppMessage = {
  from?: string;
  id?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
};

type WhatsAppContact = {
  profile?: { name?: string };
  wa_id?: string;
};

type WhatsAppChangeValue = {
  messaging_product?: string;
  metadata?: {
    display_phone_number?: string;
    phone_number_id?: string;
  };
  contacts?: WhatsAppContact[];
  messages?: WhatsAppMessage[];
};

type WhatsAppPayload = {
  object?: string;
  entry?: Array<{
    id?: string;
    changes?: Array<{
      value?: WhatsAppChangeValue;
      field?: string;
    }>;
  }>;
  // Also support direct / test simulation payload
  from?: string;
  name?: string;
  text?: string;
  chatId?: string;
};

/**
 * Send receipt back to WhatsApp via WhatsApp Cloud API if credentials exist.
 */
async function sendWhatsAppMessage(
  to: string,
  text: string,
  phoneNumberId?: string,
) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const pId = phoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !pId) {
    // Honest stub when WhatsApp API token is not set
    return { ok: true, stub: true };
  }

  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${pId}/messages`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to,
          type: "text",
          text: { preview_url: false, body: text },
        }),
      },
    );
    return { ok: res.ok, status: res.status };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * WhatsApp Inbound Webhook (POST)
 * Receives messages sent in WhatsApp groups or direct messages to the StandUp Agent.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as WhatsAppPayload;

  // 1. Direct simulation / quick-test payload
  if (body.text && (body.from || body.chatId)) {
    const senderId = body.from || "whatsapp-user";
    const senderName = body.name || senderId;
    const chatId = body.chatId || "whatsapp-group-standup";

    const run = await ingestEnvironmentEvent({
      environmentName: `WhatsApp (${chatId})`,
      environmentKind: "whatsapp",
      channelId: chatId,
      occurredAt: new Date().toISOString(),
      actors: [
        {
          id: senderId,
          role: "whatsapp_member",
          present: true,
          mayAct: true,
        },
      ],
      signalType: "whatsapp.message",
      signalBody: `${senderName}: ${body.text}`,
      placeOnlyContext: `WhatsApp chat ${chatId} — inbound message from ${senderName} (${senderId}).`,
    });

    return NextResponse.json({ ok: true, run });
  }

  // 2. Standard Meta WhatsApp Business Cloud API payload
  if (body.object === "whatsapp_business_account" && body.entry) {
    const runs = [];

    for (const entry of body.entry) {
      for (const change of entry.changes ?? []) {
        const val = change.value;
        if (!val || !val.messages) continue;

        const contactMap = new Map<string, string>();
        for (const contact of val.contacts ?? []) {
          if (contact.wa_id && contact.profile?.name) {
            contactMap.set(contact.wa_id, contact.profile.name);
          }
        }

        const phoneNumberId = val.metadata?.phone_number_id;

        for (const message of val.messages) {
          if (message.type !== "text" || !message.text?.body) continue;

          const senderNumber = message.from || "unknown_number";
          const senderName = contactMap.get(senderNumber) || senderNumber;
          const text = message.text.body;
          const channelId = phoneNumberId || senderNumber;

          const run = await ingestEnvironmentEvent({
            environmentName: "WhatsApp StandUp Group",
            environmentKind: "whatsapp",
            channelId,
            occurredAt: message.timestamp
              ? new Date(Number(message.timestamp) * 1000).toISOString()
              : new Date().toISOString(),
            actors: [
              {
                id: senderNumber,
                role: "whatsapp_member",
                present: true,
                mayAct: true,
              },
            ],
            signalType: "whatsapp.message",
            signalBody: `${senderName}: ${text}`,
            placeOnlyContext: `WhatsApp StandUp environment. Sender: ${senderName} (${senderNumber}).`,
          });

          runs.push(run);

          // If assistant generated a text receipt, reply back via WhatsApp Cloud API
          if (run.assistantText && senderNumber !== "unknown_number") {
            await sendWhatsAppMessage(
              senderNumber,
              run.assistantText,
              phoneNumberId,
            );
          }
        }
      }
    }

    return NextResponse.json({ ok: true, processed: runs.length, runs });
  }

  return NextResponse.json({ ok: true, message: "Ignored non-message payload" });
}
