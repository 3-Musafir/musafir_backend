import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ALLOWED_REVIEW_PERSONA_TAGS,
  ALLOWED_REVIEW_QUESTION_TAGS,
  REVIEW_ID_PATTERN,
  REVIEW_PREFERENCE_LIMITS,
} from '../review-preferences.constants';

export class UpdateReviewPreferencesDto {
  @ApiPropertyOptional({
    description: 'Review IDs the user asked to see more of.',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(REVIEW_PREFERENCE_LIMITS.preferredReviewIds)
  @IsString({ each: true })
  @Matches(REVIEW_ID_PATTERN, { each: true })
  readonly reviewIds?: string[];

  @ApiPropertyOptional({
    description: 'Preferred review question tags.',
    enum: ALLOWED_REVIEW_QUESTION_TAGS,
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(REVIEW_PREFERENCE_LIMITS.questionTags)
  @IsString({ each: true })
  @IsIn(ALLOWED_REVIEW_QUESTION_TAGS, { each: true })
  readonly questionTags?: string[];

  @ApiPropertyOptional({
    description: 'Preferred review persona tags.',
    enum: ALLOWED_REVIEW_PERSONA_TAGS,
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(REVIEW_PREFERENCE_LIMITS.personaTags)
  @IsString({ each: true })
  @IsIn(ALLOWED_REVIEW_PERSONA_TAGS, { each: true })
  readonly personaTags?: string[];
}

