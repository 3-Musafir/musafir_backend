/**
 * Security Fixes Verification Tests
 *
 * Verifies all 7 critical security fixes (C-1 through C-7) to ensure
 * the fixes work correctly and don't break existing flows.
 *
 * C-1: Placeholder JWT secrets replaced with strong random values
 * C-2: DTO validation + ValidationPipe whitelist on register endpoint
 * C-3: JwtAuthGuard throws UnauthorizedException instead of returning null
 * C-4: Google OAuth server-side token verification
 * C-5: Refresh token rotation, expiry, and logout
 * C-6: Wallet void upsert removed (prevents phantom wallet creation)
 * C-7: Auth guards added to payment endpoints
 */

import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import { AuthService } from './auth/auth.service';
import { WalletService } from './wallet/wallet.service';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeLeanQuery<T>(value: T) {
  return {
    lean: () => ({
      exec: async () => value,
    }),
  };
}

function makeReq(ip = '127.0.0.1') {
  return {
    headers: {},
    header: () => null,
    connection: { remoteAddress: ip },
  } as any;
}

// ─── C-1: Placeholder JWT Secrets ───────────────────────────────────────────

describe('C-1: JWT secrets must not be placeholders', () => {
  const KNOWN_PLACEHOLDERS = [
    'secretKey',
    'secret',
    'changeme',
    'jwt_secret',
    'your-secret-key',
  ];

  it('JWT_SECRET env should not match common placeholder values', () => {
    // This test validates the principle — in CI the env must be set properly.
    // Locally it checks that the .env replacement was applied.
    const jwtSecret = process.env.JWT_SECRET || '';
    for (const placeholder of KNOWN_PLACEHOLDERS) {
      expect(jwtSecret.toLowerCase()).not.toBe(placeholder.toLowerCase());
    }
  });

  it('ENCRYPT_JWT_SECRET env should not match common placeholder values', () => {
    const encSecret = process.env.ENCRYPT_JWT_SECRET || '';
    for (const placeholder of KNOWN_PLACEHOLDERS) {
      expect(encSecret.toLowerCase()).not.toBe(placeholder.toLowerCase());
    }
  });

  it('JWT secrets should be at least 32 characters for adequate entropy', () => {
    const jwt = process.env.JWT_SECRET || '';
    const enc = process.env.ENCRYPT_JWT_SECRET || '';
    // Only assert when the env vars are actually set (i.e. not blank in CI)
    if (jwt) expect(jwt.length).toBeGreaterThanOrEqual(32);
    if (enc) expect(enc.length).toBeGreaterThanOrEqual(32);
  });
});

// ─── C-2: DTO Validation + Whitelist ────────────────────────────────────────

describe('C-2: CreateUserDto and ValidationPipe whitelist', () => {
  // We import the DTO and use class-validator to verify decorators are applied
  let CreateUserDto: any;
  let validate: any;

  beforeAll(async () => {
    const dtoModule = await import('./user/dto/create-user.dto');
    CreateUserDto = dtoModule.CreateUserDto;
    const cv = await import('class-validator');
    validate = cv.validate;
  });

  it('rejects registration when email is missing', async () => {
    const dto = Object.assign(new CreateUserDto(), {
      fullName: 'Test User',
      phone: '03001234567',
      gender: 'male',
      password: 'securePass123',
      // email deliberately omitted
    });
    const errors = await validate(dto);
    const emailError = errors.find((e: any) => e.property === 'email');
    expect(emailError).toBeDefined();
  });

  it('accepts registration without password (backend auto-generates)', async () => {
    const dto = Object.assign(new CreateUserDto(), {
      fullName: 'Test User',
      phone: '03001234567',
      gender: 'male',
      email: 'test@example.com',
      socialLink: 'instagram.com/testuser',
      employmentStatus: 'student',
      // password deliberately omitted — backend generates it
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('accepts a valid registration DTO with all required + optional fields', async () => {
    const dto = Object.assign(new CreateUserDto(), {
      fullName: 'Test User',
      phone: '03001234567',
      gender: 'male',
      email: 'valid@example.com',
      password: 'securePass123',
      socialLink: 'instagram.com/testuser',
      employmentStatus: 'student',
      city: 'Islamabad',
      referralCode: 'ABC123',
      dateOfBirth: '1995-06-15',
      whatsappPhone: '03009876543',
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('ValidationPipe whitelist config is set in main.ts', async () => {
    // Read main.ts and verify the configuration string is present
    const fs = await import('fs');
    const mainTs = fs.readFileSync(
      require('path').resolve(__dirname, '../src/main.ts'),
      'utf-8',
    );
    // Fallback: try the compiled location
    const content =
      mainTs ||
      fs.readFileSync(
        require('path').resolve(__dirname, 'main.ts'),
        'utf-8',
      );

    // We can't easily parse the AST, so just check the source includes the config
    expect(content).toContain('whitelist');
    expect(content).toContain('forbidNonWhitelisted');
  });
});

// ─── C-3: JwtAuthGuard throws instead of returning null ─────────────────────

describe('C-3: JwtAuthGuard handleRequest throws on missing user', () => {
  let JwtAuthGuard: any;

  beforeAll(async () => {
    const mod = await import('./auth/guards/auth.guard');
    JwtAuthGuard = mod.JwtAuthGuard;
  });

  it('throws UnauthorizedException when user is null', () => {
    const reflector = { getAllAndOverride: jest.fn() } as any;
    const guard = new JwtAuthGuard(reflector);

    expect(() => guard.handleRequest(null, null, null, {} as any)).toThrow(
      UnauthorizedException,
    );
  });

  it('throws UnauthorizedException when user is undefined', () => {
    const reflector = { getAllAndOverride: jest.fn() } as any;
    const guard = new JwtAuthGuard(reflector);

    expect(() =>
      guard.handleRequest(null, undefined, null, {} as any),
    ).toThrow(UnauthorizedException);
  });

  it('throws the original error when err is provided', () => {
    const reflector = { getAllAndOverride: jest.fn() } as any;
    const guard = new JwtAuthGuard(reflector);
    const originalError = new Error('Token expired');

    expect(() =>
      guard.handleRequest(originalError, null, null, {} as any),
    ).toThrow('Token expired');
  });

  it('returns the user when authentication succeeds', () => {
    const reflector = { getAllAndOverride: jest.fn() } as any;
    const guard = new JwtAuthGuard(reflector);
    const mockUser = { _id: 'user123', roles: ['user'] };

    const result = guard.handleRequest(null, mockUser, null, {} as any);
    expect(result).toEqual(mockUser);
  });
});

// ─── C-4: Google OAuth server-side ID token verification ────────────────────

describe('C-4: Google OAuth verifyGoogleAndCreateUser', () => {
  it('rejects when idToken is empty', async () => {
    // Build a minimal UserService with mocked deps
    const { UserService } = await import('./user/user.service');
    const mockAuthService = {
      createAccessToken: jest.fn(),
      createRefreshToken: jest.fn(),
    };
    const mockUserModel: any = { findOne: jest.fn() };
    const mockRegistrationModel: any = {};
    const mockMailService: any = {};
    const mockStorageService: any = {};
    const mockNotificationService: any = {};
    const mockWalletService: any = {};

    const service = new UserService(
      mockUserModel,
      mockRegistrationModel,
      mockMailService,
      mockAuthService as any,
      mockStorageService,
      mockNotificationService,
      mockWalletService,
    );

    await expect(
      service.verifyGoogleAndCreateUser('', makeReq()),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects when idToken is null/undefined', async () => {
    const { UserService } = await import('./user/user.service');
    const service = new UserService(
      { findOne: jest.fn() } as any,
      {} as any,
      {} as any,
      { createAccessToken: jest.fn(), createRefreshToken: jest.fn() } as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await expect(
      service.verifyGoogleAndCreateUser(null as any, makeReq()),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects when Google verification fails (invalid token)', async () => {
    const { UserService } = await import('./user/user.service');
    const service = new UserService(
      { findOne: jest.fn() } as any,
      {} as any,
      {} as any,
      { createAccessToken: jest.fn(), createRefreshToken: jest.fn() } as any,
      {} as any,
      {} as any,
      {} as any,
    );

    // The real google-auth-library will reject a garbage token,
    // which verifyGoogleAndCreateUser should catch and rethrow as BadRequestException
    await expect(
      service.verifyGoogleAndCreateUser('fake-id-token-that-will-fail', makeReq()),
    ).rejects.toThrow('Invalid or expired Google ID token.');
  });
});

// ─── C-5: Refresh token rotation, expiry, and logout ────────────────────────

describe('C-5: Refresh token rotation and logout', () => {
  describe('AuthService.createRefreshToken', () => {
    it('creates a token with expiresAt 30 days in the future', async () => {
      let savedDoc: any = null;
      const mockRefreshTokenModel: any = function (data: any) {
        savedDoc = {
          ...data,
          save: jest.fn().mockResolvedValue(data),
          refreshToken: data.refreshToken,
        };
        return savedDoc;
      };
      mockRefreshTokenModel.findOneAndDelete = jest.fn();
      mockRefreshTokenModel.deleteMany = jest.fn();

      const mockUserModel: any = { findOne: jest.fn() };

      // We need to set env vars for Cryptr
      const origEncSecret = process.env.ENCRYPT_JWT_SECRET;
      const origJwtSecret = process.env.JWT_SECRET;
      process.env.ENCRYPT_JWT_SECRET =
        process.env.ENCRYPT_JWT_SECRET || 'test-encrypt-secret-32chars-min!!';
      process.env.JWT_SECRET =
        process.env.JWT_SECRET || 'test-jwt-secret-32chars-minimum!!';

      const service = new AuthService(mockUserModel, mockRefreshTokenModel);

      const req = makeReq('192.168.1.1');
      const token = await service.createRefreshToken(req, 'user123');

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(savedDoc).toBeDefined();
      expect(savedDoc.expiresAt).toBeInstanceOf(Date);

      // Verify expiresAt is ~30 days from now (within 1 minute tolerance)
      const expectedExpiry = new Date();
      expectedExpiry.setDate(expectedExpiry.getDate() + 30);
      const diff = Math.abs(
        savedDoc.expiresAt.getTime() - expectedExpiry.getTime(),
      );
      expect(diff).toBeLessThan(60 * 1000); // within 1 minute

      process.env.ENCRYPT_JWT_SECRET = origEncSecret;
      process.env.JWT_SECRET = origJwtSecret;
    });
  });

  describe('AuthService.findRefreshToken (rotation)', () => {
    it('atomically deletes the token on use (single-use rotation)', async () => {
      const mockRefreshTokenModel: any = function () {};
      mockRefreshTokenModel.findOneAndDelete = jest.fn().mockResolvedValue({
        userId: 'user456',
        refreshToken: 'valid-token',
      });
      mockRefreshTokenModel.deleteMany = jest.fn();

      const mockUserModel: any = { findOne: jest.fn() };

      const origEncSecret = process.env.ENCRYPT_JWT_SECRET;
      process.env.ENCRYPT_JWT_SECRET =
        process.env.ENCRYPT_JWT_SECRET || 'test-encrypt-secret-32chars-min!!';

      const service = new AuthService(mockUserModel, mockRefreshTokenModel);
      const userId = await service.findRefreshToken('valid-token');

      expect(userId).toBe('user456');
      expect(mockRefreshTokenModel.findOneAndDelete).toHaveBeenCalledWith({
        refreshToken: 'valid-token',
        expiresAt: { $gt: expect.any(Date) },
      });

      process.env.ENCRYPT_JWT_SECRET = origEncSecret;
    });

    it('throws UnauthorizedException when token is not found (expired/already used)', async () => {
      const mockRefreshTokenModel: any = function () {};
      mockRefreshTokenModel.findOneAndDelete = jest.fn().mockResolvedValue(null);
      mockRefreshTokenModel.deleteMany = jest.fn();

      const mockUserModel: any = { findOne: jest.fn() };

      const origEncSecret = process.env.ENCRYPT_JWT_SECRET;
      process.env.ENCRYPT_JWT_SECRET =
        process.env.ENCRYPT_JWT_SECRET || 'test-encrypt-secret-32chars-min!!';

      const service = new AuthService(mockUserModel, mockRefreshTokenModel);

      await expect(
        service.findRefreshToken('expired-or-used-token'),
      ).rejects.toThrow(UnauthorizedException);

      process.env.ENCRYPT_JWT_SECRET = origEncSecret;
    });
  });

  describe('AuthService.revokeAllUserTokens (logout)', () => {
    it('deletes all refresh tokens for a user', async () => {
      const mockRefreshTokenModel: any = function () {};
      mockRefreshTokenModel.findOneAndDelete = jest.fn();
      mockRefreshTokenModel.deleteMany = jest.fn().mockResolvedValue({ deletedCount: 3 });

      const mockUserModel: any = { findOne: jest.fn() };

      const origEncSecret = process.env.ENCRYPT_JWT_SECRET;
      process.env.ENCRYPT_JWT_SECRET =
        process.env.ENCRYPT_JWT_SECRET || 'test-encrypt-secret-32chars-min!!';

      const service = new AuthService(mockUserModel, mockRefreshTokenModel);
      await service.revokeAllUserTokens('user789');

      expect(mockRefreshTokenModel.deleteMany).toHaveBeenCalledWith({
        userId: 'user789',
      });

      process.env.ENCRYPT_JWT_SECRET = origEncSecret;
    });
  });

  describe('UserService.refreshAccessToken returns new refresh token', () => {
    it('issues a new refresh token after rotation', async () => {
      const { UserService } = await import('./user/user.service');

      const mockAuthService = {
        findRefreshToken: jest.fn().mockResolvedValue('user123'),
        createAccessToken: jest.fn().mockResolvedValue('new-access-token'),
        createRefreshToken: jest.fn().mockResolvedValue('new-refresh-token'),
      };

      const mockUserModel: any = {
        findOne: jest.fn(),
        findById: jest.fn().mockResolvedValue({ _id: 'user123' }),
      };

      const service = new UserService(
        mockUserModel,
        {} as any,
        {} as any,
        mockAuthService as any,
        {} as any,
        {} as any,
        {} as any,
      );

      const req = makeReq();
      const result = await service.refreshAccessToken(
        { refreshToken: 'old-refresh-token' } as any,
        req,
      );

      expect(result.accessToken).toBe('new-access-token');
      expect(result.refreshToken).toBe('new-refresh-token');
      expect(mockAuthService.findRefreshToken).toHaveBeenCalledWith(
        'old-refresh-token',
      );
      expect(mockAuthService.createRefreshToken).toHaveBeenCalledWith(
        req,
        'user123',
      );
    });

    it('returns undefined refreshToken when no req is provided', async () => {
      const { UserService } = await import('./user/user.service');

      const mockAuthService = {
        findRefreshToken: jest.fn().mockResolvedValue('user123'),
        createAccessToken: jest.fn().mockResolvedValue('new-access-token'),
        createRefreshToken: jest.fn(),
      };

      const mockUserModel: any = {
        findOne: jest.fn(),
        findById: jest.fn().mockResolvedValue({ _id: 'user123' }),
      };

      const service = new UserService(
        mockUserModel,
        {} as any,
        {} as any,
        mockAuthService as any,
        {} as any,
        {} as any,
        {} as any,
      );

      const result = await service.refreshAccessToken({
        refreshToken: 'old-refresh-token',
      } as any);

      expect(result.accessToken).toBe('new-access-token');
      expect(result.refreshToken).toBeUndefined();
      expect(mockAuthService.createRefreshToken).not.toHaveBeenCalled();
    });
  });

  describe('UserService.logout', () => {
    it('calls revokeAllUserTokens', async () => {
      const { UserService } = await import('./user/user.service');

      const mockAuthService = {
        revokeAllUserTokens: jest.fn().mockResolvedValue(undefined),
      };

      const service = new UserService(
        { findOne: jest.fn() } as any,
        {} as any,
        {} as any,
        mockAuthService as any,
        {} as any,
        {} as any,
        {} as any,
      );

      await service.logout('user789');

      expect(mockAuthService.revokeAllUserTokens).toHaveBeenCalledWith(
        'user789',
      );
    });
  });
});

// ─── C-6: Wallet voidBySource — no upsert on credit-back ───────────────────

describe('C-6: Wallet voidBySource prevents phantom balance creation', () => {
  it('throws when voiding a debit but wallet balance doc does not exist', async () => {
    // Voiding a debit = crediting back (reverseDelta > 0)
    // Old code used upsert:true which would create a balance doc from nothing
    const debitTx = {
      _id: 'tx1',
      userId: 'userNoWallet',
      amount: 500,
      direction: 'debit',
      status: 'posted',
      metadata: {},
      save: jest.fn(),
      toObject: jest.fn(),
    };

    const walletBalanceModel: any = {
      // Return null — simulates no balance doc existing
      findOneAndUpdate: jest.fn(async () => null),
      updateOne: jest.fn(),
    };
    const walletTransactionModel: any = {
      findOne: jest.fn(() => ({
        exec: async () => debitTx,
      })),
      create: jest.fn(),
    };
    const userModel: any = {};

    const service = new WalletService(
      walletBalanceModel,
      walletTransactionModel,
      userModel,
    );

    await expect(
      service.voidBySource({
        type: 'flagship_payment_wallet_debit',
        sourceId: 'reg1',
      }),
    ).rejects.toThrow(BadRequestException);

    // Verify it did NOT use upsert
    const callArgs = walletBalanceModel.findOneAndUpdate.mock.calls[0];
    const options = callArgs[2]; // third argument = options
    expect(options?.upsert).toBeFalsy();
  });

  it('successfully voids a debit when wallet balance doc exists', async () => {
    const debitTx = {
      _id: 'tx2',
      userId: 'userWithWallet',
      amount: 300,
      direction: 'debit',
      status: 'posted',
      metadata: {},
      note: 'original',
      save: jest.fn().mockResolvedValue(undefined),
      toObject: jest.fn().mockReturnValue({
        _id: 'tx2',
        status: 'void',
      }),
    };

    const walletBalanceModel: any = {
      findOneAndUpdate: jest.fn(async () => ({ balance: 300 })),
      updateOne: jest.fn(),
    };
    const walletTransactionModel: any = {
      findOne: jest.fn(() => ({
        exec: async () => debitTx,
      })),
      create: jest.fn(),
    };
    const userModel: any = {};

    const service = new WalletService(
      walletBalanceModel,
      walletTransactionModel,
      userModel,
    );

    const result = await service.voidBySource({
      type: 'flagship_payment_wallet_debit',
      sourceId: 'reg2',
      voidedBy: 'admin1',
    });

    expect(result).toMatchObject({ status: 'void' });
    expect(debitTx.save).toHaveBeenCalled();

    // Verify no upsert
    const callArgs = walletBalanceModel.findOneAndUpdate.mock.calls[0];
    const options = callArgs[2];
    expect(options?.upsert).toBeFalsy();
  });

  it('voids a credit (debit reversal) with balance check', async () => {
    const creditTx = {
      _id: 'tx3',
      userId: 'user1',
      amount: 200,
      direction: 'credit',
      status: 'posted',
      metadata: {},
      save: jest.fn().mockResolvedValue(undefined),
      toObject: jest.fn().mockReturnValue({ _id: 'tx3', status: 'void' }),
    };

    const walletBalanceModel: any = {
      // Voiding a credit = debiting back; sufficient balance exists
      findOneAndUpdate: jest.fn(async () => ({ balance: 100 })),
      updateOne: jest.fn(),
    };
    const walletTransactionModel: any = {
      findOne: jest.fn(() => ({
        exec: async () => creditTx,
      })),
    };
    const userModel: any = {};

    const service = new WalletService(
      walletBalanceModel,
      walletTransactionModel,
      userModel,
    );

    const result = await service.voidBySource({
      type: 'refund_credit',
      sourceId: 'refund1',
    });

    expect(result).toMatchObject({ status: 'void' });

    // Voiding a credit uses the debit path (reverseDelta < 0) with $gte check
    const callArgs = walletBalanceModel.findOneAndUpdate.mock.calls[0];
    const query = callArgs[0];
    expect(query).toHaveProperty('balance');
    expect(query.balance).toHaveProperty('$gte');
  });

  it('throws when voiding a credit but insufficient balance', async () => {
    const creditTx = {
      _id: 'tx4',
      userId: 'user2',
      amount: 500,
      direction: 'credit',
      status: 'posted',
      metadata: {},
      save: jest.fn(),
      toObject: jest.fn(),
    };

    const walletBalanceModel: any = {
      findOneAndUpdate: jest.fn(async () => null), // insufficient balance
      updateOne: jest.fn(),
    };
    const walletTransactionModel: any = {
      findOne: jest.fn(() => ({
        exec: async () => creditTx,
      })),
    };
    const userModel: any = {};

    const service = new WalletService(
      walletBalanceModel,
      walletTransactionModel,
      userModel,
    );

    await expect(
      service.voidBySource({
        type: 'refund_credit',
        sourceId: 'refund2',
      }),
    ).rejects.toThrow(BadRequestException);
  });
});

// ─── C-7: Payment controller endpoints require auth guards ──────────────────

describe('C-7: Payment controller endpoints have auth guards', () => {
  /**
   * We verify guards by reading the decorators applied to each method.
   * NestJS stores decorator metadata via Reflect, so we inspect the
   * controller class directly.
   */

  let PaymentController: any;

  beforeAll(async () => {
    const mod = await import('./payment/payment.controller');
    PaymentController = mod.PaymentController;
  });

  // Helper: get guard metadata for a controller method
  function getGuards(methodName: string): any[] {
    const guards =
      Reflect.getMetadata('__guards__', PaymentController.prototype[methodName]) || [];
    return guards;
  }

  function getRoles(methodName: string): string[] {
    return (
      Reflect.getMetadata('roles', PaymentController.prototype[methodName]) || []
    );
  }

  // Previously unguarded endpoints now require JwtAuthGuard
  const endpointsThatNeedAuth = [
    'getUserDiscount',
    'getUserDiscountByRegistration',
    'getBankAccounts',
    'createBankAccount',
  ];

  for (const method of endpointsThatNeedAuth) {
    it(`${method} has JwtAuthGuard`, () => {
      const guards = getGuards(method);
      const guardNames = guards.map((g: any) => g.name || g.constructor?.name);
      expect(guardNames).toContain('JwtAuthGuard');
    });
  }

  // Admin endpoints must have both JwtAuthGuard AND Roles('admin')
  const adminEndpoints = [
    'getBankAccounts',
    'createBankAccount',
    'getPayment',
    'getPendingPayments',
    'getCompletedPayments',
    'getRefunds',
    'getRejectionReasons',
    'getRefundRejectionReasons',
    'approveRefund',
    'approveRefundNoCredit',
    'postRefundCredit',
    'postRefundBank',
    'rejectRefund',
    'approvePayment',
    'rejectPayment',
  ];

  for (const method of adminEndpoints) {
    it(`${method} has JwtAuthGuard`, () => {
      const guards = getGuards(method);
      const guardNames = guards.map((g: any) => g.name || g.constructor?.name);
      expect(guardNames).toContain('JwtAuthGuard');
    });

    it(`${method} requires admin role`, () => {
      const roles = getRoles(method);
      expect(roles).toContain('admin');
    });
  }

  // User-facing endpoints that already had JwtAuthGuard should still have it
  const userEndpoints = [
    'getEligibleDiscounts',
    'getUserPayments',
    'requestRefund',
    'refundQuote',
    'refundStatus',
    'getPaymentHistory',
    'createPayment',
  ];

  for (const method of userEndpoints) {
    it(`${method} still has JwtAuthGuard`, () => {
      const guards = getGuards(method);
      const guardNames = guards.map((g: any) => g.name || g.constructor?.name);
      expect(guardNames).toContain('JwtAuthGuard');
    });
  }
});

// ─── C-5 + C-3 Integration: Auth guard + logout flow coherence ──────────────

describe('Auth flow integration: guard + rotation + logout', () => {
  it('after logout, using old refresh token should fail', async () => {
    const origEncSecret = process.env.ENCRYPT_JWT_SECRET;
    process.env.ENCRYPT_JWT_SECRET =
      process.env.ENCRYPT_JWT_SECRET || 'test-encrypt-secret-32chars-min!!';

    // Simulate: user had a refresh token, then logged out, then tries to refresh
    const mockRefreshTokenModel: any = function () {};
    // After logout (deleteMany), findOneAndDelete returns null
    mockRefreshTokenModel.findOneAndDelete = jest.fn().mockResolvedValue(null);
    mockRefreshTokenModel.deleteMany = jest
      .fn()
      .mockResolvedValue({ deletedCount: 1 });

    const mockUserModel: any = { findOne: jest.fn() };

    const authService = new AuthService(mockUserModel, mockRefreshTokenModel);

    // Step 1: Logout
    await authService.revokeAllUserTokens('user1');
    expect(mockRefreshTokenModel.deleteMany).toHaveBeenCalledWith({
      userId: 'user1',
    });

    // Step 2: Try to use the old refresh token
    await expect(
      authService.findRefreshToken('old-revoked-token'),
    ).rejects.toThrow(UnauthorizedException);

    process.env.ENCRYPT_JWT_SECRET = origEncSecret;
  });

  it('JwtAuthGuard rejects null user from failed passport validation', async () => {
    const mod = await import('./auth/guards/auth.guard');
    const reflector = { getAllAndOverride: jest.fn() } as any;
    const guard = new mod.JwtAuthGuard(reflector);

    // Simulates what happens when JwtStrategy.validate returns null/throws
    expect(() => guard.handleRequest(null, null, null, {} as any)).toThrow(
      UnauthorizedException,
    );
  });
});
