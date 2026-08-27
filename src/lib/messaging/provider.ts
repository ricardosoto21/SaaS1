export interface MessagingProvider {
  sendTemplate(input: { recipient: string; template: string; body: string }): Promise<{ providerMessageId: string }>;
  sendMessage(input: { recipient: string; body: string }): Promise<{ providerMessageId: string }>;
  getStatus(providerMessageId: string): Promise<"sent" | "delivered" | "failed">;
}

type WhatsAppCloudResponse = { messages?: Array<{ id?: string }>; error?: { message?: string } };

export class WhatsAppCloudProvider implements MessagingProvider {
  constructor(
    private readonly accessToken: string,
    private readonly phoneNumberId: string,
    private readonly version = "v22.0",
  ) {}

  private async send(payload: Record<string, unknown>) {
    const response = await fetch(`https://graph.facebook.com/${this.version}/${encodeURIComponent(this.phoneNumberId)}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", ...payload }),
    });
    const body = await response.json().catch(() => ({})) as WhatsAppCloudResponse;
    const providerMessageId = body.messages?.[0]?.id;
    if (!response.ok || !providerMessageId) throw new Error(body.error?.message || "WhatsApp delivery failed.");
    return { providerMessageId };
  }

  async sendTemplate(input: { recipient: string; template: string; body: string }) {
    void input.body;
    return this.send({ to: input.recipient, type: "template", template: { name: input.template, language: { code: "es_CL" } } });
  }

  async sendMessage(input: { recipient: string; body: string }) {
    return this.send({ to: input.recipient, type: "text", text: { body: input.body, preview_url: false } });
  }

  async getStatus(): Promise<"sent"> {
    // Meta reports delivery receipts asynchronously to its webhook.
    return "sent";
  }
}

export class DisabledWhatsAppProvider implements MessagingProvider {
  async sendTemplate(): Promise<{ providerMessageId: string }> { throw new Error("WhatsApp provider is not configured."); }
  async sendMessage(): Promise<{ providerMessageId: string }> { throw new Error("WhatsApp provider is not configured."); }
  async getStatus(): Promise<"failed"> { return "failed"; }
}

export function getMessagingProvider(): MessagingProvider {
  const accessToken = process.env.WHATSAPP_CLOUD_ACCESS_TOKEN?.trim();
  const phoneNumberId = process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID?.trim();
  if (!accessToken || !phoneNumberId) return new DisabledWhatsAppProvider();
  return new WhatsAppCloudProvider(accessToken, phoneNumberId, process.env.WHATSAPP_CLOUD_API_VERSION?.trim() || "v22.0");
}

export function isMessagingConfigured() {
  return Boolean(process.env.WHATSAPP_CLOUD_ACCESS_TOKEN?.trim() && process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID?.trim());
}
