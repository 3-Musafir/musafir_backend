import dayjs = require('dayjs');
import utc = require('dayjs/plugin/utc');
import timezone = require('dayjs/plugin/timezone');
import { PK_TIMEZONE } from 'src/wallet/wallet.constants';

dayjs.extend(utc);
dayjs.extend(timezone);

export const REFUND_POLICY_LINK = 'https://3musafir.com/refundpolicyby3musafir' as const;
export const REFUND_PROCESSING_FEE_PKR = 500 as const;

export type RefundTierLabel =
  | '15+ days'
  | '10-14 days'
  | '5-9 days'
  | '0-4 days';

export function computeRefundQuote(params: {
  flagshipStartDate: Date;
  submittedAt: Date;
  amountPaid: number;
}) {
  const amountPaid = Math.max(0, Math.floor(Number(params.amountPaid) || 0));
  const submittedAt = params.submittedAt ? new Date(params.submittedAt) : new Date();
  const flagshipStartDate = new Date(params.flagshipStartDate);

  const startDay = dayjs(flagshipStartDate).tz(PK_TIMEZONE).startOf('day');
  const submittedDay = dayjs(submittedAt).tz(PK_TIMEZONE).startOf('day');
  const daysBeforeDeparture = startDay.diff(submittedDay, 'day');

  let refundPercent = 0;
  let tierLabel: RefundTierLabel = '0-4 days';

  if (daysBeforeDeparture >= 15) {
    refundPercent = 100;
    tierLabel = '15+ days';
  } else if (daysBeforeDeparture >= 10) {
    refundPercent = 50;
    tierLabel = '10-14 days';
  } else if (daysBeforeDeparture >= 5) {
    refundPercent = 30;
    tierLabel = '5-9 days';
  } else {
    refundPercent = 0;
    tierLabel = '0-4 days';
  }

  const gross = Math.floor((amountPaid * refundPercent) / 100);
  const refundAmount = Math.max(0, gross - REFUND_PROCESSING_FEE_PKR);

  return {
    amountPaid,
    daysBeforeDeparture,
    refundPercent,
    processingFee: REFUND_PROCESSING_FEE_PKR,
    tierLabel,
    refundAmount,
    policyLink: REFUND_POLICY_LINK,
    policyAppliedAt: new Date(),
  };
}

