import { NotificationService } from './notification.service';
import { ProfileStatus } from 'src/user/profile-status.util';

const mockGateway = () => ({
  sendNewNotification: jest.fn(),
  sendRead: jest.fn(),
  sendReadAll: jest.fn(),
});

const mockModel = () => {
  const chain = {
    sort: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    lean: jest.fn(),
  };
  return {
    insertMany: jest.fn(),
    find: jest.fn().mockReturnValue(chain),
    countDocuments: jest.fn(),
    findOneAndUpdate: jest.fn(),
    updateMany: jest.fn(),
    findOne: jest.fn(),
  };
};

const buildProfileStatus = (missing: string[], complete = false): ProfileStatus =>
  ({
    complete,
    missing: missing as any,
    requiredFor: {
      general: missing as any,
      flagshipRegistration: missing as any,
      verification: [],
    },
  } as any);

describe('NotificationService', () => {
  it('returns empty notifications when none exist', async () => {
    const model = mockModel();
    model.find().lean.mockResolvedValue([]);
    model.countDocuments.mockResolvedValue(0);
    const gateway = mockGateway();
    const service = new NotificationService(model as any, gateway as any);

    const result = await service.listForUser('user-id', {});

    expect(result.items).toEqual([]);
    expect(result.unreadCount).toBe(0);
    expect(model.find).toHaveBeenCalledWith({ userId: 'user-id' });
  });

  it('marks notification as read', async () => {
    const model = mockModel();
    const doc = {
      _id: 'notif1',
      title: 'Test',
      message: 'Hello',
      type: 'general',
      createdAt: new Date(),
      readAt: null,
    };
    model.findOneAndUpdate.mockResolvedValue({ ...doc, readAt: new Date() });
    const gateway = mockGateway();
    const service = new NotificationService(model as any, gateway as any);

    const result = await service.markRead('user-id', 'notif1');

    expect(result.id).toBe('notif1');
    expect(gateway.sendRead).toHaveBeenCalledWith('user-id', 'notif1');
  });

  it('creates profile completion reminder with missing fields', async () => {
    const gateway = mockGateway();
    const createdDocs: any[] = [];

    class MockNotificationModel {
      static findOne = jest.fn().mockResolvedValue(null);
      static updateMany = jest.fn();
      static find = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn(),
      });
      static countDocuments = jest.fn();
      static findOneAndUpdate = jest.fn();
      static insertMany = jest.fn();
      constructor(payload: any) {
        const instance: any = {
          ...payload,
          _id: payload._id || 'generated-id',
          createdAt: new Date(),
          readAt: null,
        };
        instance.save = jest.fn().mockResolvedValue(instance);
        createdDocs.push(instance);
        return instance;
      }
    }

    const service = new NotificationService(
      MockNotificationModel as any,
      gateway as any,
    );

    const status = buildProfileStatus(['phone', 'city']);
    const result = await service.ensureProfileCompletionReminder('user-1', status);

    expect(MockNotificationModel.findOne).toHaveBeenCalledWith({
      userId: 'user-1',
      'metadata.kind': 'profile_completion',
    });
    expect(createdDocs[0].message).toContain('Phone number');
    expect(createdDocs[0].metadata.missingFields).toEqual(['phone', 'city']);
    expect(result?.metadata?.missingFieldLabels).toContain('City');
    expect(gateway.sendNewNotification).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ id: expect.any(String), type: 'general' }),
    );
  });

  it('marks profile reminder as read when profile is complete', async () => {
    const gateway = mockGateway();
    const model = mockModel();
    const service = new NotificationService(model as any, gateway as any);

    model.updateMany.mockResolvedValue({ matchedCount: 1 });

    await service.ensureProfileCompletionReminder(
      'user-2',
      buildProfileStatus([], true),
    );

    expect(model.updateMany).toHaveBeenCalledWith(
      {
        userId: 'user-2',
        'metadata.kind': 'profile_completion',
        readAt: null,
      },
      { $set: { readAt: expect.any(Date) } },
    );
    expect(gateway.sendNewNotification).not.toHaveBeenCalled();
  });
});
