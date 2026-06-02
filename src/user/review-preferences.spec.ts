import { validate } from 'class-validator';
import { UserController } from './user.controller';
import { UpdateReviewPreferencesDto } from './dto/update-review-preferences.dto';
import { UserService } from './user.service';

const buildService = (userModel: any) =>
  new UserService(
    userModel,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );

describe('review preferences', () => {
  describe('UpdateReviewPreferencesDto', () => {
    it('accepts valid review preferences', async () => {
      const dto = new UpdateReviewPreferencesDto() as any;
      dto.reviewIds = ['firefest-4-sameen'];
      dto.questionTags = ['first_experience', 'safety_women'];
      dto.personaTags = ['solo', 'women'];

      const errors = await validate(dto);

      expect(errors).toHaveLength(0);
    });

    it('rejects invalid ids, invalid tags, and oversized arrays', async () => {
      const dto = new UpdateReviewPreferencesDto() as any;
      dto.reviewIds = [
        'INVALID_ID',
        ...Array.from({ length: 101 }, (_, index) => `review-${index}`),
      ];
      dto.questionTags = ['first_experience', 'unknown_question'];
      dto.personaTags = ['solo', 'unknown_persona'];

      const errors = await validate(dto);
      const properties = errors.map((error) => error.property);

      expect(properties).toEqual(
        expect.arrayContaining(['reviewIds', 'questionTags', 'personaTags']),
      );
    });
  });

  describe('UserService review preferences', () => {
    it('merges incoming preferences, dedupes values, and keeps newest review ids first', async () => {
      const doc: any = {
        reviewPreferences: {
          preferredReviewIds: ['old-review', 'legacy-review'],
          questionTags: ['first_experience'],
          personaTags: ['solo'],
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
        save: jest.fn(async () => doc),
      };
      const userModel = {
        findById: jest.fn().mockResolvedValue(doc),
      };
      const service = buildService(userModel);

      const result = await service.updateReviewPreferences('user-id', {
        reviewIds: ['new-review', 'old-review', 'new-review'],
        questionTags: ['safety_women', 'first_experience'],
        personaTags: ['women', 'solo'],
      });

      expect(result.preferredReviewIds).toEqual([
        'new-review',
        'old-review',
        'legacy-review',
      ]);
      expect(result.questionTags).toEqual(['first_experience', 'safety_women']);
      expect(result.personaTags).toEqual(['solo', 'women']);
      expect(result.updatedAt).toEqual(expect.any(Date));
      expect(doc.save).toHaveBeenCalledTimes(1);
    });

    it('caps stored review ids at 100', async () => {
      const doc: any = {
        reviewPreferences: {
          preferredReviewIds: [],
          questionTags: [],
          personaTags: [],
        },
        save: jest.fn(async () => doc),
      };
      const userModel = {
        findById: jest.fn().mockResolvedValue(doc),
      };
      const service = buildService(userModel);
      const reviewIds = Array.from({ length: 120 }, (_, index) => `review-${index}`);

      const result = await service.updateReviewPreferences('user-id', { reviewIds });

      expect(result.preferredReviewIds).toHaveLength(100);
      expect(result.preferredReviewIds[0]).toBe('review-0');
      expect(result.preferredReviewIds[99]).toBe('review-99');
    });

    it('filters stale stored ids and tags on read', async () => {
      const doc: any = {
        reviewPreferences: {
          preferredReviewIds: ['valid-review', 'INVALID_ID'],
          questionTags: ['first_experience', 'unknown_question'],
          personaTags: ['solo', 'unknown_persona'],
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      };
      const select = jest.fn().mockResolvedValue(doc);
      const userModel = {
        findById: jest.fn(() => ({ select })),
      };
      const service = buildService(userModel);

      const result = await service.getReviewPreferences('user-id');

      expect(select).toHaveBeenCalledWith('reviewPreferences');
      expect(result).toEqual({
        preferredReviewIds: ['valid-review'],
        questionTags: ['first_experience'],
        personaTags: ['solo'],
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      });
    });
  });

  describe('UserController review preferences', () => {
    it('returns GET response shape', async () => {
      const preferences = {
        preferredReviewIds: ['valid-review'],
        questionTags: ['first_experience'],
        personaTags: ['solo'],
      };
      const userService = {
        getReviewPreferences: jest.fn().mockResolvedValue(preferences),
      };
      const controller = new UserController(userService as any);
      const user: any = { _id: { toString: () => 'user-id' } };

      const response = await controller.getReviewPreferences(user);

      expect(userService.getReviewPreferences).toHaveBeenCalledWith('user-id');
      expect(response).toMatchObject({
        statusCode: 200,
        message: 'Review preferences fetched successfully',
        data: preferences,
        error: null,
      });
    });

    it('returns PATCH response shape', async () => {
      const preferences = {
        preferredReviewIds: ['valid-review'],
        questionTags: ['first_experience'],
        personaTags: ['solo'],
      };
      const userService = {
        updateReviewPreferences: jest.fn().mockResolvedValue(preferences),
      };
      const controller = new UserController(userService as any);
      const user: any = { _id: { toString: () => 'user-id' } };
      const dto = { reviewIds: ['valid-review'] };

      const response = await controller.updateReviewPreferences(user, dto);

      expect(userService.updateReviewPreferences).toHaveBeenCalledWith('user-id', dto);
      expect(response).toMatchObject({
        statusCode: 200,
        message: 'Review preferences updated successfully',
        data: preferences,
        error: null,
      });
    });
  });
});
