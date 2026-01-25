# Admin Flagship Payment Verification Checklist

Manual verification steps for the flagship admin payment lifecycle.

## 1. Verified user payment flow
1. Ensure a verified user registers for the flagship (registration status `payment`/`confirmed`).
2. Upload the payment screenshot and confirm the registration moves into **Payment Verification** (`/flagship/pending-payment-verification/:id`) showing only the latest pending record.
3. Approve the payment (use `/admin/payment/{paymentId}`) and confirm:
   - The payment leaves **Payment Verification** (because `window.dispatchEvent("paymentStatusChanged")` triggers a refetch) and appears under **Paid**.
   - The registration shows the green “Payment Approved” badge on `/flagship/registered/:id`.

## 2. Unverified → Identity verification → Payment
1. Register as an unverified user and confirm the row appears in the **Identity Verification** list (`/flagship/pending-verification/:id`) while still being visible in the main Registration list when the “Hide identity-pending” toggle is off.
2. From the identity queue, mark the user as verified. Confirm:
   - The user disappears from the identity queue on the next fetch.
   - The registration row now shows `verification.status = verified`.
   - The user receives the notification that links to `/musafir/payment/{registrationId}`.
3. Submit payment and ensure the new payment shows under **Payment Verification** and can be approved like the first flow.

## 3. Rejection and resubmit
1. Submit payment and reject it. Check that:
   - **Payment Verification** no longer shows the rejected record, and the registration row now has a “Payment Rejected — resubmit” badge.
   - The user gets a rejection notification linking back to `/musafir/payment/{registrationId}`.
2. Reupload a screenshot (new payment). Confirm:
   - The registration’s `latestPaymentStatus` resets to `pendingApproval`.
   - Only a single card shows for that registration in **Payment Verification**.
   - Approving the new payment moves it to **Paid** and updates the badge to “Payment Approved”.
