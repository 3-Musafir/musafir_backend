import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { CreateTripSeriesDto } from './trip-series.dto';

const buildPipe = () =>
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  });

const basePayload = {
  title: 'Face to Face with Rakaposhi',
  destination: 'Nagar Valley',
};

describe('CreateTripSeriesDto', () => {
  it('accepts seo fields submitted as a JSON string', async () => {
    const transformed = await buildPipe().transform(
      {
        ...basePayload,
        seo: JSON.stringify({
          title: 'Rakaposhi trip',
          description: 'A mountain road trip.',
          keywords: ['rakaposhi', 'nagar'],
          canonical: 'https://example.com/trips/rakaposhi',
        }),
      },
      { type: 'body', metatype: CreateTripSeriesDto },
    );

    expect(transformed.seo).toMatchObject({
      title: 'Rakaposhi trip',
      description: 'A mountain road trip.',
      keywords: ['rakaposhi', 'nagar'],
      canonical: 'https://example.com/trips/rakaposhi',
    });
  });

  it('accepts seo fields submitted as an object', async () => {
    const transformed = await buildPipe().transform(
      {
        ...basePayload,
        seo: {
          title: 'Rakaposhi trip',
          description: 'A mountain road trip.',
          keywords: 'rakaposhi,nagar',
          canonical: 'https://example.com/trips/rakaposhi',
        },
      },
      { type: 'body', metatype: CreateTripSeriesDto },
    );

    expect(transformed.seo).toMatchObject({
      title: 'Rakaposhi trip',
      description: 'A mountain road trip.',
      keywords: ['rakaposhi', 'nagar'],
      canonical: 'https://example.com/trips/rakaposhi',
    });
  });
});
