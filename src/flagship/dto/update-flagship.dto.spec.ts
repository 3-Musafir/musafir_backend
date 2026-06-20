import 'reflect-metadata';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { UpdateFlagshipDto } from './update-flagship.dto';

const buildPipe = () =>
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  });

describe('UpdateFlagshipDto', () => {
  it('accepts structured trip content arrays submitted as JSON strings', async () => {
    const transformed = await buildPipe().transform(
      {
        summary: 'A premium community-led mountain escape.',
        tripType: 'Road Trip',
        effortLevel: 'Moderate',
        vibeScores: JSON.stringify([
          { label: 'Nature', score: 4 },
          { label: 'Community', score: 5 },
        ]),
        itineraryDays: JSON.stringify([
          {
            day: 1,
            title: 'Arrival',
            summary: 'Welcome and briefing.',
            image: '',
            imageTitle: 'Arrival view',
            imageAlt: 'Travelers arrive for the trip',
          },
        ]),
        routeWaypoints: JSON.stringify([
          { label: 'Islamabad', description: 'Start point' },
        ]),
        includedItems: JSON.stringify([
          { label: 'Accommodation', detail: 'Shared hotel rooms' },
        ]),
        notIncludedItems: JSON.stringify([
          { label: 'Personal shopping', detail: 'Optional expenses' },
        ]),
        additionalInfo: JSON.stringify([
          { title: 'Transport', body: 'Private group transport on the route.' },
        ]),
        tripFaqs: JSON.stringify([
          { question: 'What should I pack?', answer: 'Layered clothing.' },
        ]),
      },
      { type: 'body', metatype: UpdateFlagshipDto },
    );

    expect(transformed.vibeScores).toEqual([
      { label: 'Nature', score: 4 },
      { label: 'Community', score: 5 },
    ]);
    expect(transformed.itineraryDays?.[0]).toMatchObject({
      day: 1,
      title: 'Arrival',
      imageAlt: 'Travelers arrive for the trip',
    });
    expect(transformed.includedItems?.[0]).toEqual({
      label: 'Accommodation',
      detail: 'Shared hotel rooms',
    });
    expect(transformed.tripFaqs?.[0]).toEqual({
      question: 'What should I pack?',
      answer: 'Layered clothing.',
    });
  });

  it('still rejects unknown nested properties under the whitelist', async () => {
    await expect(
      buildPipe().transform(
        {
          vibeScores: JSON.stringify([
            { label: 'Nature', score: 4, unexpected: 'nope' },
          ]),
        },
        { type: 'body', metatype: UpdateFlagshipDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
