import { Controller, Post, Body } from "@nestjs/common";
import * as crypto from "crypto";
import { PaymentsService, SUBSCRIPTION_PRICE_UZS } from "./payments.service";

const ClickError = { Success: 0, SignFailed: -1, AlreadyPaid: -4, TransactionNotFound: -6, BadAmount: -2 };

@Controller("api/payments/click")
export class ClickController {
  constructor(private readonly paymentsService: PaymentsService) {}

  private verifySign(body: any, includeMerchantPrepareId: boolean): boolean {
    const secret = process.env.CLICK_SECRET_KEY || "";
    const parts = includeMerchantPrepareId
      ? [body.click_trans_id, body.service_id, secret, body.merchant_trans_id, body.merchant_prepare_id, body.amount, body.action, body.sign_time]
      : [body.click_trans_id, body.service_id, secret, body.merchant_trans_id, body.amount, body.action, body.sign_time];
    const expected = crypto.createHash("md5").update(parts.join("")).digest("hex");
    return expected === body.sign_string;
  }

  @Post("prepare")
  async prepare(@Body() body: any) {
    if (!this.verifySign(body, false)) {
      return { error: ClickError.SignFailed, error_note: "Invalid signature" };
    }
    if (Number(body.amount) !== SUBSCRIPTION_PRICE_UZS) {
      return { error: ClickError.BadAmount, error_note: "Incorrect amount" };
    }

    const existing = await this.paymentsService.findClickTransaction(body.click_trans_id);
    if (existing) {
      return { error: ClickError.AlreadyPaid, error_note: "Transaction already exists" };
    }

    await this.paymentsService.createClickTransaction({
      clickTransId: body.click_trans_id,
      merchantTransId: body.merchant_trans_id, // this is your userId
      amount: Number(body.amount),
      state: "created",
    });

    return {
      click_trans_id: body.click_trans_id,
      merchant_trans_id: body.merchant_trans_id,
      merchant_prepare_id: body.click_trans_id, // reusing click_trans_id as our internal prepare id — simplest valid choice
      error: ClickError.Success,
      error_note: "Success",
    };
  }

  @Post("complete")
  async complete(@Body() body: any) {
    if (!this.verifySign(body, true)) {
      return { error: ClickError.SignFailed, error_note: "Invalid signature" };
    }

    const tx = await this.paymentsService.findClickTransaction(body.click_trans_id);
    if (!tx) {
      return { error: ClickError.TransactionNotFound, error_note: "Transaction not found" };
    }
    if (tx.state === "confirmed") {
      return { error: ClickError.AlreadyPaid, error_note: "Already confirmed" };
    }

    if (Number(body.error) < 0) {
      await this.paymentsService.updateClickTransaction(body.click_trans_id, { state: "cancelled" });
      return {
        click_trans_id: body.click_trans_id,
        merchant_trans_id: body.merchant_trans_id,
        merchant_confirm_id: body.click_trans_id,
        error: Number(body.error),
        error_note: "Cancelled by Click",
      };
    }

    await this.paymentsService.updateClickTransaction(body.click_trans_id, { state: "confirmed" });
    await this.paymentsService.grantPaidAccess(tx.merchantTransId);

    return {
      click_trans_id: body.click_trans_id,
      merchant_trans_id: body.merchant_trans_id,
      merchant_confirm_id: body.click_trans_id,
      error: ClickError.Success,
      error_note: "Success",
    };
  }
}