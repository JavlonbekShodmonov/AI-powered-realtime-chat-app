import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { MongoClient, Db, ObjectId } from "mongodb";

export interface PaymeTransaction {
  paymeTransId: string;
  userId: string;
  amount: number; // tiyin (1/100 so'm), as Payme sends it
  state: 1 | 2 | -1 | -2; // 1=created, 2=performed, -1=cancelled(before perform), -2=cancelled(after perform)
  createTime: number;
  performTime: number;
  cancelTime: number;
  reason: number | null;
}

const SUBSCRIPTION_DAYS = 30;
// Placeholder — set your real monthly price. Payme wants tiyin (so'm * 100),
// Click wants so'm directly, so both are derived from one so'm value.
export const SUBSCRIPTION_PRICE_UZS = 25000;

@Injectable()
export class PaymentsService implements OnModuleDestroy {
  private client: MongoClient;
  private db: Db;

  private async getDb(): Promise<Db> {
    if (!this.db) {
      this.client = new MongoClient(process.env.MONGODB_URI || "");
      await this.client.connect();
      this.db = this.client.db();
    }
    return this.db;
  }

  async onModuleDestroy() {
    if (this.client) await this.client.close();
  }

  // ── Shared: grant access on successful payment (both providers call this) ──
  async grantPaidAccess(userId: string) {
    if (!ObjectId.isValid(userId)) throw new Error(`Invalid userId: ${userId}`);
    const db = await this.getDb();
    const expiresAt = new Date(Date.now() + SUBSCRIPTION_DAYS * 24 * 60 * 60 * 1000);
    await db.collection("users").updateOne(
      { _id: new ObjectId(userId) },
      { $set: { plan: "paid", planExpiresAt: expiresAt } },
    );
  }

  // ── Payme-specific transaction bookkeeping ──────────────────────────────
  async findPaymeTransaction(paymeTransId: string) {
    const db = await this.getDb();
    return db.collection("payme_transactions").findOne({ paymeTransId });
  }

  async createPaymeTransaction(data: PaymeTransaction) {
    const db = await this.getDb();
    await db.collection("payme_transactions").insertOne(data as any);
  }

  async updatePaymeTransaction(paymeTransId: string, update: Partial<PaymeTransaction>) {
    const db = await this.getDb();
    await db.collection("payme_transactions").updateOne({ paymeTransId }, { $set: update });
  }

  // ── Click-specific transaction bookkeeping ──────────────────────────────
  async findClickTransaction(clickTransId: string) {
    const db = await this.getDb();
    return db.collection("click_transactions").findOne({ clickTransId });
  }

  async createClickTransaction(data: {
    clickTransId: string;
    merchantTransId: string; // userId
    amount: number;
    state: "created" | "confirmed" | "cancelled";
  }) {
    const db = await this.getDb();
    await db.collection("click_transactions").insertOne(data as any);
  }

  async updateClickTransaction(clickTransId: string, update: Record<string, any>) {
    const db = await this.getDb();
    await db.collection("click_transactions").updateOne({ clickTransId }, { $set: update });
  }
}