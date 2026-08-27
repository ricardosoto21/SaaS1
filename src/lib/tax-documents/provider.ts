export interface TaxDocumentProvider {
  issueReceipt(input: { saleId: string; total: number; customerTaxId?: string }): Promise<{ documentId: string; status: "issued" | "pending" }>;
  getStatus(documentId: string): Promise<"issued" | "pending" | "failed">;
  cancelOrCredit(documentId: string, reason: string): Promise<void>;
}

export class SumUpTaxDocumentProvider implements TaxDocumentProvider {
  async issueReceipt(): Promise<{ documentId: string; status: "pending" }> { throw new Error("SumUp tax document integration is not configured."); }
  async getStatus(): Promise<"pending"> { return "pending"; }
  async cancelOrCredit(): Promise<void> { throw new Error("Tax document integration is not configured."); }
}