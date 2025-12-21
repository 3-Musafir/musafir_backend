import { NotificationService } from './notification.service';

const mockGateway = () => ({
  sendToUser: jest.fn(),
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
  };
};

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
    expect(gateway.sendToUser).toHaveBeenCalledWith('user-id', expect.objectContaining({ id: 'notif1' }));
  });
});
