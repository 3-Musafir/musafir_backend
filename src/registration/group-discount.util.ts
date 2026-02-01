import mongoose, { Model } from 'mongoose';

const parseAmount = (value: unknown): number => {
  if (value === undefined || value === null) return 0;
  const numeric = value.toString().replace(/[^0-9.-]/g, '');
  const parsed = Number(numeric);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const getGroupDiscountPerMember = (groupSize: number): number => {
  if (groupSize >= 7) return 1000;
  if (groupSize === 6) return 800;
  if (groupSize === 5) return 600;
  if (groupSize === 4) return 500;
  return 0;
};

type GroupDiscountModels = {
  registrationModel: Model<any>;
  flagshipModel: Model<any>;
  userModel: Model<any>;
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const normalizeEmailList = (values: unknown[]) => {
  return values
    .flatMap((entry) =>
      typeof entry === 'string' ? entry.split(/[\s,;]+/) : [],
    )
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
};

const ensureGroupIdsForRegistrations = async (
  models: GroupDiscountModels,
  registrations: any[],
) => {
  const missing = registrations.filter((registration) => !registration.groupId);
  if (missing.length === 0) return registrations;

  const userIds = registrations
    .map((registration) => registration.userId)
    .filter(Boolean)
    .map((id) => String(id));
  const users = await models.userModel
    .find({ _id: { $in: userIds } })
    .select('_id email')
    .lean()
    .exec();
  const emailByUserId = new Map(
    users
      .filter((user) => typeof user?.email === 'string')
      .map((user) => [String(user._id), user.email.trim().toLowerCase()]),
  );

  const regById = new Map(
    registrations.map((registration) => [String(registration._id), registration]),
  );
  const regIdByEmail = new Map<string, string>();
  registrations.forEach((registration) => {
    const userEmail = emailByUserId.get(String(registration.userId));
    if (userEmail && !regIdByEmail.has(userEmail)) {
      regIdByEmail.set(userEmail, String(registration._id));
    }
  });

  const idList = registrations.map((registration) => String(registration._id));
  const indexById = new Map(idList.map((id, index) => [id, index]));
  const parent = idList.map((_, index) => index);
  const find = (index: number): number => {
    if (parent[index] !== index) {
      parent[index] = find(parent[index]);
    }
    return parent[index];
  };
  const union = (a: number, b: number) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent[rootB] = rootA;
  };

  registrations.forEach((registration) => {
    const regId = String(registration._id);
    const regIndex = indexById.get(regId);
    if (regIndex === undefined) return;
    const groupMembers = Array.isArray(registration.groupMembers)
      ? registration.groupMembers
      : [];
    const linkedContacts = Array.isArray(registration.linkedContacts)
      ? registration.linkedContacts.map((contact: any) => contact?.email).filter(Boolean)
      : [];
    const emails = normalizeEmailList([...groupMembers, ...linkedContacts]);
    emails.forEach((email) => {
      const targetId = regIdByEmail.get(email);
      if (!targetId) return;
      const targetIndex = indexById.get(targetId);
      if (targetIndex === undefined) return;
      union(regIndex, targetIndex);
    });
  });

  const components = new Map<
    number,
    { ids: string[]; groupIds: Set<string> }
  >();
  registrations.forEach((registration) => {
    const regId = String(registration._id);
    const index = indexById.get(regId);
    if (index === undefined) return;
    const root = find(index);
    const entry = components.get(root) || { ids: [], groupIds: new Set() };
    entry.ids.push(regId);
    if (registration.groupId) {
      entry.groupIds.add(String(registration.groupId));
    }
    components.set(root, entry);
  });

  for (const component of components.values()) {
    if (component.groupIds.size > 1) {
      continue;
    }
    const resolvedGroupId =
      component.groupIds.size === 1
        ? Array.from(component.groupIds)[0]
        : new mongoose.Types.ObjectId().toHexString();
    const missingIds = component.ids.filter((id) => !regById.get(id)?.groupId);
    if (missingIds.length === 0) continue;
    await models.registrationModel.updateMany(
      { _id: { $in: missingIds } },
      { $set: { groupId: resolvedGroupId } },
    );
    missingIds.forEach((id) => {
      const registration = regById.get(id);
      if (registration) registration.groupId = resolvedGroupId;
    });
  }

  return registrations;
};

const acquireGroupDiscountLock = async (
  models: GroupDiscountModels,
  flagshipId: string,
  lockWindowMs = 15000,
  maxAttempts = 3,
  retryDelayMs = 100,
): Promise<string | null> => {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const lockId = new mongoose.Types.ObjectId().toHexString();
    const now = new Date();
    const lockCutoff = new Date(now.getTime() - lockWindowMs);
    const updated = await models.flagshipModel.findOneAndUpdate(
      {
        _id: flagshipId,
        $or: [
          { groupDiscountLockAt: { $exists: false } },
          { groupDiscountLockAt: { $lt: lockCutoff } },
        ],
      },
      { $set: { groupDiscountLockAt: now, groupDiscountLockBy: lockId } },
      { new: true },
    );
    if (updated) return lockId;
    if (attempt < maxAttempts - 1) {
      await delay(retryDelayMs);
    }
  }
  return null;
};

const releaseGroupDiscountLock = async (
  models: GroupDiscountModels,
  flagshipId: string,
  lockId: string,
): Promise<void> => {
  await models.flagshipModel.updateOne(
    { _id: flagshipId, groupDiscountLockBy: lockId },
    { $unset: { groupDiscountLockAt: '', groupDiscountLockBy: '' } },
  );
};

export const reallocateGroupDiscountsForFlagship = async (
  models: GroupDiscountModels,
  flagshipId: string,
  options?: { deferOnLockFailure?: boolean },
): Promise<void> => {
  if (!flagshipId) return;
  const deferOnLockFailure = options?.deferOnLockFailure ?? true;
  const lockId = await acquireGroupDiscountLock(models, flagshipId);
  if (!lockId) {
    if (deferOnLockFailure) {
      setTimeout(() => {
        void reallocateGroupDiscountsForFlagship(models, flagshipId, {
          deferOnLockFailure: false,
        });
      }, 750);
    }
    return;
  }
  try {
  const flagshipDoc = (await models.flagshipModel
    .findById(flagshipId)
    .select('discounts')
    .lean()
    .exec()) as any;
  const groupConfig = flagshipDoc?.discounts?.group;
  if (!groupConfig?.enabled) {
    const registrations = await models.registrationModel
      .find({
        flagship: flagshipId,
        tripType: 'group',
        cancelledAt: { $exists: false },
        refundStatus: { $ne: 'refunded' },
      })
      .select('_id price walletPaid')
      .lean()
      .exec();
    await Promise.all(
      registrations.map(async (registration) => {
        const price = typeof registration.price === 'number' ? registration.price : 0;
        const walletPaid =
          typeof registration.walletPaid === 'number' ? registration.walletPaid : 0;
        const updatedAmountDue = Math.max(0, price - walletPaid);
        await models.registrationModel.updateOne(
          { _id: registration._id },
          {
            $set: {
              discountApplied: 0,
              amountDue: updatedAmountDue,
              groupDiscountStatus: 'disabled',
            },
          },
        );
      }),
    );
    return;
  }

  const rawGroupValue = groupConfig?.value;
  const hasGroupValue =
    rawGroupValue !== undefined &&
    rawGroupValue !== null &&
    String(rawGroupValue).trim() !== '';
  const rawTotalValue = hasGroupValue
    ? rawGroupValue
    : flagshipDoc?.discounts?.totalDiscountsValue;
  const hasBudgetLimit =
    rawTotalValue !== undefined &&
    rawTotalValue !== null &&
    String(rawTotalValue).trim() !== '';
  const totalBudget = hasBudgetLimit ? parseAmount(rawTotalValue) : 0;
  let remainingBudget = hasBudgetLimit ? Math.max(0, totalBudget) : Infinity;

  const rawCount = groupConfig?.count;
  const hasCountLimit =
    rawCount !== undefined && rawCount !== null && String(rawCount).trim() !== '';
  const countLimit = hasCountLimit ? Math.max(0, Math.floor(Number(rawCount) || 0)) : 0;
  let remainingCount = hasCountLimit ? countLimit : Infinity;

  let registrations = await models.registrationModel
    .find({
      flagship: flagshipId,
      tripType: 'group',
      cancelledAt: { $exists: false },
      refundStatus: { $ne: 'refunded' },
    })
    .select('_id groupId userId groupMembers linkedContacts price walletPaid createdAt')
    .lean()
    .exec();
  registrations = await ensureGroupIdsForRegistrations(models, registrations);

  const grouped = new Map<
    string,
    { registrations: any[]; createdAt: Date | null }
  >();
  for (const registration of registrations) {
    const groupId = registration.groupId ? String(registration.groupId) : '';
    if (!groupId) continue;
    const entry = grouped.get(groupId) || { registrations: [], createdAt: null };
    entry.registrations.push(registration);
    const createdAt = (() => {
      if (registration.createdAt) return new Date(registration.createdAt);
      const idTimestamp = (registration as any)?._id?.getTimestamp?.();
      return idTimestamp || null;
    })();
    if (createdAt && (!entry.createdAt || createdAt < entry.createdAt)) {
      entry.createdAt = createdAt;
    }
    grouped.set(groupId, entry);
  }

  const groupEntries = Array.from(grouped.entries()).sort((a, b) => {
    const aTime = a[1].createdAt ? a[1].createdAt.getTime() : 0;
    const bTime = b[1].createdAt ? b[1].createdAt.getTime() : 0;
    return aTime - bTime;
  });

  for (const [, group] of groupEntries) {
    const groupSize = group.registrations.length;
    const perMember = getGroupDiscountPerMember(groupSize);
    const needsBudget = perMember > 0;
    const totalGroupDiscount = perMember * groupSize;
    const canApply =
      !needsBudget ||
      (remainingBudget >= totalGroupDiscount && remainingCount >= groupSize);
    const discountToApply = canApply ? perMember : 0;
    const groupStatus: 'applied' | 'not_eligible' | 'budget_exhausted' =
      perMember === 0 ? 'not_eligible' : canApply ? 'applied' : 'budget_exhausted';

    await Promise.all(
      group.registrations.map(async (registration) => {
        const price = typeof registration.price === 'number' ? registration.price : 0;
        const walletPaid =
          typeof registration.walletPaid === 'number' ? registration.walletPaid : 0;
        const updatedAmountDue = Math.max(0, price - discountToApply - walletPaid);
        await models.registrationModel.updateOne(
          { _id: registration._id },
          {
            $set: {
              discountApplied: discountToApply,
              amountDue: updatedAmountDue,
              groupDiscountStatus: groupStatus,
            },
          },
        );
      }),
    );

    if (canApply && needsBudget) {
      remainingBudget -= totalGroupDiscount;
      remainingCount -= groupSize;
    }
  }
  } finally {
    await releaseGroupDiscountLock(models, flagshipId, lockId);
  }
};
