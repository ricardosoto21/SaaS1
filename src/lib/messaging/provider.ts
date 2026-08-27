export interface MessagingProvider {
  sendTemplate(input: { recipient: string; template: string; body: string }): Promise<{ providerMessageId: string }>;
  sendMessage(input: { recipient: string; body: string }): Promise<{ providerMessageId: string }>;
  getStatus(providerMessageId: string): Promise<"sent" | "delivered" | "failed">;
}

export class DisabledWhatsAppProvider implements MessagingProvider {
  async sendTemplate(): Promise<{ providerMessageId: string }> { throw new Error("WhatsApp provider is not configured."); }
  async sendMessage(): Promise<{ providerMessageId: string }> { throw new Error("WhatsApp provider is not configured."); }
  async getStatus(): Promise<"failed"> { return "failed"; }
}