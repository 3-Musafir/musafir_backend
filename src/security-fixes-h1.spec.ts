/**
 * Security Fix H-1 Verification Tests
 *
 * H-1: IDOR — Registration Details Readable by Any User
 *
 * Verifies that getRegistrationById enforces ownership checks:
 * - Owner can read their own registration
 * - Admin can read any registration
 * - Non-owner non-admin is rejected with ForbiddenException
 * - Missing registration returns NotFoundException
 */

import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { RegistrationService } from './registration/registration.service';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makePopulateChain(result: any) {
  const chain = {
    populate: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(result),
  };
  return chain;
}

function makeUser(id: string, roles: string[] = ['musafir']) {
  return { _id: id, roles } as any;
}

function makeRegistration(ownerId: string, opts: any = {}) {
  return {
    userId: ownerId,
    user: { _id: ownerId, ...opts.user },
    flagship: opts.flagship ?? { images: [] },
    paymentId: opts.paymentId ?? null,
  };
}

// ─── Build a minimal RegistrationService with mocked dependencies ───────────

function buildService(registrationModelOverride: any = {}) {
  const registrationModel = {
    findById: jest.fn(),
    ...registrationModelOverride,
  };

  const storageService = {
    getSignedUrl: jest.fn().mockResolvedValue('https://signed-url.example.com'),
  };

  // Build the service using prototype to avoid full DI
  const service = Object.create(RegistrationService.prototype);

  // Assign private fields by name (Mongoose model & storage)
  Object.assign(service, {
    registrationModel,
    storageService,
  });

  return { service: service as RegistrationService, registrationModel, storageService };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('H-1: getRegistrationById ownership check', () => {
  const ownerId = '507f1f77bcf86cd799439011';
  const otherUserId = '507f1f77bcf86cd799439022';
  const adminId = '507f1f77bcf86cd799439033';
  const registrationId = '507f1f77bcf86cd799439044';

  it('should allow the registration owner to read their registration', async () => {
    const reg = makeRegistration(ownerId);
    const chain = makePopulateChain(reg);
    const { service, registrationModel } = buildService({
      findById: jest.fn().mockReturnValue(chain),
    });

    const owner = makeUser(ownerId);
    const result = await service.getRegistrationById(registrationId, owner);

    expect(result).toBeDefined();
    expect(result.userId).toBe(ownerId);
    expect(registrationModel.findById).toHaveBeenCalledWith(registrationId);
  });

  it('should allow an admin to read any registration', async () => {
    const reg = makeRegistration(ownerId);
    const chain = makePopulateChain(reg);
    const { service } = buildService({
      findById: jest.fn().mockReturnValue(chain),
    });

    const admin = makeUser(adminId, ['musafir', 'admin']);
    const result = await service.getRegistrationById(registrationId, admin);

    expect(result).toBeDefined();
    expect(result.userId).toBe(ownerId);
  });

  it('should reject a non-owner, non-admin user with ForbiddenException', async () => {
    const reg = makeRegistration(ownerId);
    const chain = makePopulateChain(reg);
    const { service } = buildService({
      findById: jest.fn().mockReturnValue(chain),
    });

    const stranger = makeUser(otherUserId);
    await expect(
      service.getRegistrationById(registrationId, stranger),
    ).rejects.toThrow(ForbiddenException);
  });

  it('should throw NotFoundException when registration does not exist', async () => {
    const chain = makePopulateChain(null);
    const { service } = buildService({
      findById: jest.fn().mockReturnValue(chain),
    });

    const user = makeUser(ownerId);
    await expect(
      service.getRegistrationById(registrationId, user),
    ).rejects.toThrow(NotFoundException);
  });

  it('should resolve ownership from registration.user._id when userId is missing', async () => {
    // Some registrations might only have the populated `user` field, not `userId`
    const reg = {
      userId: undefined,
      user: { _id: ownerId },
      flagship: { images: [] },
    };
    const chain = makePopulateChain(reg);
    const { service } = buildService({
      findById: jest.fn().mockReturnValue(chain),
    });

    const owner = makeUser(ownerId);
    const result = await service.getRegistrationById(registrationId, owner);
    expect(result).toBeDefined();

    // Non-owner should still be blocked
    const stranger = makeUser(otherUserId);
    // Need fresh mock for second call
    const chain2 = makePopulateChain({ ...reg });
    const { service: service2 } = buildService({
      findById: jest.fn().mockReturnValue(chain2),
    });
    await expect(
      service2.getRegistrationById(registrationId, stranger),
    ).rejects.toThrow(ForbiddenException);
  });

  it('should sign flagship images for the owner', async () => {
    const reg = makeRegistration(ownerId, {
      flagship: { images: ['img/key1.jpg', 'img/key2.jpg'] },
    });
    const chain = makePopulateChain(reg);
    const { service, storageService } = buildService({
      findById: jest.fn().mockReturnValue(chain),
    });

    const owner = makeUser(ownerId);
    const result = await service.getRegistrationById(registrationId, owner);

    expect(storageService.getSignedUrl).toHaveBeenCalledTimes(2);
    expect(result.flagship.images).toEqual([
      'https://signed-url.example.com',
      'https://signed-url.example.com',
    ]);
  });

  it('should check the second parameter (user) is required at the type level', () => {
    // Verify the method signature accepts exactly 2 parameters
    const { service } = buildService();
    expect(service.getRegistrationById.length).toBeGreaterThanOrEqual(2);
  });
});
