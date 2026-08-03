// utils/paymentLinks.ts
export function getPaymeLink(userId: string, amountUzs: number): string {
  const merchantId = process.env.NEXT_PUBLIC_PAYME_MERCHANT_ID;
  const params = `m=${merchantId};ac.userId=${userId};a=${amountUzs * 100}`;
  const encoded = Buffer.from(params).toString("base64");
  return `https://checkout.paycom.uz/${encoded}`;
}

export function getClickLink(userId: string, amountUzs: number): string {
  const serviceId = process.env.NEXT_PUBLIC_CLICK_SERVICE_ID;
  const merchantId = process.env.NEXT_PUBLIC_CLICK_MERCHANT_ID;
  const returnUrl = encodeURIComponent(`${window.location.origin}/upgrade/success`);
  return `https://my.click.uz/services/pay?service_id=${serviceId}&merchant_id=${merchantId}&amount=${amountUzs}&transaction_param=${userId}&return_url=${returnUrl}`;
}