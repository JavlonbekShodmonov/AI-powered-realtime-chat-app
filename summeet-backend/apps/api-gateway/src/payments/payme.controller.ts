import { Controller, Post, Req, Res, HttpStatus } from "@nestjs/common";
import { Request, Response } from "express";
import { PaymentsService, SUBSCRIPTION_PRICE_UZS } from "./payments.service";

// Payme error codes per their spec — exact codes matter, Payme's own
// dashboard/test suite checks for these specifically, not just "an error".
const PaymeError = {
  InvalidAmount: -31001,
  TransactionNotFound: -31003,
  CantDoOperation: -31008,
  TransactionNotAllowed: -31099, // used for generic account/user issues below
  AccountNotFound: -31050,
};

@Controller("api/payments/payme")
export class PaymeController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post()
  async handle(@Req() req: Request, @Res() res: Response) {
    // Basic Auth check: header is "Basic base64(Paycom:<merchant_key>)"
    const authHeader = req.headers.authorization || "";
    const expected = "Basic " + Buffer.from(`Paycom:${process.env.PAYME_MERCHANT_KEY}`).toString("base64");
    if (authHeader !== expected) {
      return res.status(HttpStatus.OK).json({
        error: { code: -32504, message: "Insufficient privilege" },
        id: req.body?.id ?? null,
      });
    }

    const { method, params, id } = req.body;

    try {
      let result: any;
      switch (method) {
        case "CheckPerformTransaction":
          result = await this.checkPerformTransaction(params);
          break;
        case "CreateTransaction":
          result = await this.createTransaction(params);
          break;
        case "PerformTransaction":
          result = await this.performTransaction(params);
          break;
        case "CancelTransaction":
          result = await this.cancelTransaction(params);
          break;
        case "CheckTransaction":
          result = await this.checkTransaction(params);
          break;
        case "GetStatement":
          result = await this.getStatement(params);
          break;
        default:
          return res.json({ error: { code: -32601, message: "Method not found" }, id });
      }
      return res.json({ result, id });
    } catch (err: any) {
      return res.json({ error: { code: err.code || -31099, message: err.message }, id });
    }
  }

  private async checkPerformTransaction(params: any) {
    const userId = params.account?.userId;
    if (!userId) throw { code: PaymeError.AccountNotFound, message: "userId is required" };
    if (params.amount !== SUBSCRIPTION_PRICE_UZS * 100) {
      throw { code: PaymeError.InvalidAmount, message: "Incorrect amount" };
    }
    return { allow: true };
  }

  private async createTransaction(params: any) {
    const existing = await this.paymentsService.findPaymeTransaction(params.id);
    if (existing) {
      if (existing.state !== 1) throw { code: PaymeError.CantDoOperation, message: "Transaction state invalid" };
      return { create_time: existing.createTime, transaction: existing.paymeTransId, state: existing.state };
    }

    const userId = params.account?.userId;
    if (params.amount !== SUBSCRIPTION_PRICE_UZS * 100) {
      throw { code: PaymeError.InvalidAmount, message: "Incorrect amount" };
    }

    const createTime = Date.now();
    await this.paymentsService.createPaymeTransaction({
      paymeTransId: params.id,
      userId,
      amount: params.amount,
      state: 1,
      createTime,
      performTime: 0,
      cancelTime: 0,
      reason: null,
    });

    return { create_time: createTime, transaction: params.id, state: 1 };
  }

  private async performTransaction(params: any) {
    const tx = await this.paymentsService.findPaymeTransaction(params.id);
    if (!tx) throw { code: PaymeError.TransactionNotFound, message: "Transaction not found" };

    if (tx.state === 2) {
      return { transaction: tx.paymeTransId, perform_time: tx.performTime, state: 2 };
    }
    if (tx.state !== 1) throw { code: PaymeError.CantDoOperation, message: "Transaction state invalid" };

    const performTime = Date.now();
    await this.paymentsService.updatePaymeTransaction(params.id, { state: 2, performTime });
    await this.paymentsService.grantPaidAccess(tx.userId);

    return { transaction: tx.paymeTransId, perform_time: performTime, state: 2 };
  }

  private async cancelTransaction(params: any) {
    const tx = await this.paymentsService.findPaymeTransaction(params.id);
    if (!tx) throw { code: PaymeError.TransactionNotFound, message: "Transaction not found" };

    const cancelTime = Date.now();
    const newState = tx.state === 2 ? -2 : -1; // -2 if already performed, -1 otherwise
    await this.paymentsService.updatePaymeTransaction(params.id, {
      state: newState,
      cancelTime,
      reason: params.reason,
    });

    return { transaction: tx.paymeTransId, cancel_time: cancelTime, state: newState };
  }

  private async checkTransaction(params: any) {
    const tx = await this.paymentsService.findPaymeTransaction(params.id);
    if (!tx) throw { code: PaymeError.TransactionNotFound, message: "Transaction not found" };
    return {
      create_time: tx.createTime,
      perform_time: tx.performTime,
      cancel_time: tx.cancelTime,
      transaction: tx.paymeTransId,
      state: tx.state,
      reason: tx.reason,
    };
  }

  private async getStatement(params: any) {
    // Minimal viable implementation — Payme's dashboard uses this to
    // reconcile transactions in a date range. Returning an empty array is
    // spec-valid; expand this with a real date-range Mongo query once
    // you're actually reconciling statements against Payme's dashboard.
    return { transactions: [] };
  }
}