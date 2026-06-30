import { BadRequestException } from '@nestjs/common';
import { TripSeriesService } from './trip-series.service';

const createService = (tripSeriesModel: any, departureModel: any) =>
  new TripSeriesService(
    tripSeriesModel,
    departureModel,
    {} as any,
    {} as any,
    {} as any,
    { getSignedUrl: jest.fn() } as any,
    {} as any,
    {} as any,
    {} as any,
  );

describe('TripSeriesService admin departure operations', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it.each([
    ['past', { endDate: { $lt: expect.any(Date) } }, { endDate: -1 }],
    [
      'live',
      {
        startDate: { $lte: expect.any(Date) },
        endDate: { $gte: expect.any(Date) },
      },
      { startDate: 1 },
    ],
    ['upcoming', { startDate: { $gt: expect.any(Date) } }, { startDate: 1 }],
  ] as const)('queries and sorts the %s window', async (window, expectedQuery, expectedSort) => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-29T12:00:00.000Z'));
    const chain: any = {
      sort: jest.fn(),
      populate: jest.fn(),
      lean: jest.fn(),
      exec: jest.fn().mockResolvedValue([]),
    };
    chain.sort.mockReturnValue(chain);
    chain.populate.mockReturnValue(chain);
    chain.lean.mockReturnValue(chain);
    const departureModel = { find: jest.fn().mockReturnValue(chain) };
    const service = createService({}, departureModel);

    await service.getAdminDepartures(window);

    expect(departureModel.find).toHaveBeenCalledWith(expectedQuery);
    expect(chain.sort).toHaveBeenCalledWith(expectedSort);
  });

  it('rejects public visibility when the owning series is inactive', async () => {
    const departureModel = {
      findById: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          _id: 'departure-1',
          tripSeriesId: 'series-1',
          contentVersion: 'version-1',
        }),
      }),
    };
    const tripSeriesModel = {
      findById: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue({ status: 'hidden' }),
          }),
        }),
      }),
    };
    const service = createService(tripSeriesModel, departureModel);

    await expect(
      service.updateDeparture('departure-1', {
        visibility: 'public',
        contentVersion: 'version-1',
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('restores only departures that were hidden by their series', async () => {
    const updateManyExec = jest.fn().mockResolvedValue({ modifiedCount: 1 });
    const departureModel = {
      updateMany: jest.fn().mockReturnValue({ exec: updateManyExec }),
      find: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue([]) }),
    };
    const existingSeries = {
      _id: 'series-1',
      title: 'Series',
      slug: 'series',
      status: 'hidden',
      contentVersion: 'version-1',
    };
    const tripSeriesModel = {
      findById: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(existingSeries),
      }),
      findByIdAndUpdate: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({ ...existingSeries, status: 'active' }),
      }),
    };
    const service = createService(tripSeriesModel, departureModel);

    await service.updateTripSeries('series-1', {
      status: 'active',
      contentVersion: 'version-1',
    } as any);

    expect(departureModel.updateMany).toHaveBeenCalledWith(
      { tripSeriesId: 'series-1', hiddenBySeries: true },
      expect.any(Object),
      { runValidators: true },
    );
  });
});
