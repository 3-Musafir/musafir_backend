import { FlagshipService } from './flagship.service';
import { VerificationStatus } from 'src/constants/verification-status.enum';

describe('FlagshipService', () => {
  it('deduplicates pending payments per registration', async () => {
    const aggregateMock = jest.fn().mockResolvedValue([
      {
        results: [],
        total: [{ count: 0 }],
      },
    ]);
    const service = new FlagshipService(
      null as any,
      null as any,
      null as any,
      null as any,
      null as any,
      null as any,
      { aggregate: aggregateMock } as any,
      null as any,
      null as any,
    );

    await service.findPendingPaymentVerifications(
      '507f1f77bcf86cd799439011',
      { limit: 5, page: 1 },
    );

    expect(aggregateMock).toHaveBeenCalled();
    const pipeline = aggregateMock.mock.calls[0][0];
    const hasGroup = pipeline.some((stage: any) => Boolean(stage.$group));
    const hasReplaceRoot = pipeline.some((stage: any) => Boolean(stage.$replaceRoot));
    expect(hasGroup).toBe(true);
    expect(hasReplaceRoot).toBe(true);
  });

  describe('findRegisteredUsers', () => {
    it('filters excluded verification statuses before pagination', async () => {
      const aggregateMock = jest.fn().mockResolvedValue([]);
      const service = new FlagshipService(
        null as any,
        null as any,
        null as any,
        null as any,
        null as any,
        { aggregate: aggregateMock } as any,
        null as any,
        null as any,
        null as any,
      );

      await service.findRegisteredUsers('507f1f77bcf86cd799439011', 'search term', {
        excludeVerificationStatus: 'pending,rejected',
        limit: 5,
        page: 2,
      });

      expect(aggregateMock).toHaveBeenCalled();
      const pipeline = aggregateMock.mock.calls[0][0];
      const excludeIndex = pipeline.findIndex(
        (stage: any) => stage.$match?.['user.verification.status']?.$nin,
      );
      const skipIndex = pipeline.findIndex((stage: any) => stage.$skip !== undefined);
      const limitIndex = pipeline.findIndex((stage: any) => stage.$limit !== undefined);

      expect(excludeIndex).toBeGreaterThan(-1);
      expect(skipIndex).toBeGreaterThan(excludeIndex);
      expect(limitIndex).toBeGreaterThan(excludeIndex);
    });
  });

  describe('findPendingVerificationUsers', () => {
    it('always constructs a pipeline that matches pending identity rows', async () => {
      const aggregateMock = jest.fn().mockResolvedValue([]);
      const service = new FlagshipService(
        null as any,
        null as any,
        null as any,
        null as any,
        null as any,
        { aggregate: aggregateMock } as any,
        null as any,
        null as any,
        null as any,
      );

      await service.findPendingVerificationUsers('507f1f77bcf86cd799439011', {
        limit: 3,
        page: 1,
      });

      expect(aggregateMock).toHaveBeenCalled();
      const pipeline = aggregateMock.mock.calls[0][0];
      const hasLookup = pipeline.some((stage: any) => stage.$lookup?.from === 'users');
      const hasPendingMatch = pipeline.some(
        (stage: any) => stage.$match?.['user.verification.status'] === VerificationStatus.PENDING,
      );
      const hasUnwind = pipeline.some((stage: any) => Boolean(stage.$unwind));

      expect(hasLookup).toBe(true);
      expect(hasUnwind).toBe(true);
      expect(hasPendingMatch).toBe(true);
    });
  });
});
