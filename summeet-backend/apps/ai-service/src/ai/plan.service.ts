import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { MongoClient, Db, ObjectId } from "mongodb";

@Injectable()
export class PlanService implements OnModuleDestroy {
  private client: MongoClient;
  private db: Db;

  private async getDb(): Promise<Db> {
    if (!this.db) {
      const uri =
        process.env.MONGODB_URI || "mongodb://localhost:27017/summeet";
      this.client = new MongoClient(uri);
      await this.client.connect();
      this.db = this.client.db();
    }
    return this.db;
  }

  async onModuleDestroy() {
    if (this.client) await this.client.close();
  }

  // No billing integration exists yet — `plan` is a plain field you set
  // manually on the user doc for now (or via a Stripe webhook later).
  // Defaults to false/free for anyone missing the field.
  async isPaid(userId: string): Promise<boolean> {
    if (!userId || !ObjectId.isValid(userId)) return false;
    const db = await this.getDb();
    const user = await db
      .collection("users")
      .findOne({ _id: new ObjectId(userId) }, { projection: { plan: 1 } });
    if (user?.plan !== "paid") return false;
    if (!user.planExpiresAt || new Date(user.planExpiresAt) < new Date())
      return false;
    return true;
  }

  // Exactly one lifetime free suggest-response use, tracked as a boolean.
  // Atomic findOneAndUpdate — the query only matches if the flag isn't
  // already true, so two rapid "Get Suggestions" clicks can't both slip
  // through the trial at once (a race a plain read-then-write would allow).
  // Returns true if this call consumed the trial (caller should proceed),
  // false if the trial was already used.
  async consumeSuggestionTrial(userId: string): Promise<boolean> {
    if (!userId || !ObjectId.isValid(userId)) return false;
    const db = await this.getDb();
    const result = await db
      .collection("users")
      .findOneAndUpdate(
        { _id: new ObjectId(userId), suggestionTrialUsed: { $ne: true } },
        { $set: { suggestionTrialUsed: true } },
      );
    return !!result;
  }
}
