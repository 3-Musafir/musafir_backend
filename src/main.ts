import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as dotenv from 'dotenv';
import 'dotenv/config';
import 'module-alias/register';
import { join } from 'path';
import { AppModule } from './app.module';
import { FeedbackModule } from './feedback/feedback.module';
import { FlagshipModule } from './flagship/flagship.module';
import { RegistrationModule } from './registration/registration.module';
import { UserModule } from './user/user.module';
dotenv.config();

function normalizeOrigin(origin?: string) {
  return origin?.trim().replace(/\/$/, '');
}

function getAllowedOrigins() {
  const defaultOrigins = [
    'http://localhost:3000',
    'https://3musafir.com',
    'https://www.3musafir.com',
    'https://staging.3musafir.com',
  ];
  const configuredOrigins = [
    process.env.FRONTEND_URL,
    ...(process.env.CORS_ALLOWED_ORIGINS || '').split(','),
  ];

  return new Set(
    [...defaultOrigins, ...configuredOrigins]
      .map(normalizeOrigin)
      .filter((origin): origin is string => Boolean(origin)),
  );
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Use Global Pipes
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Swagger
  const options = new DocumentBuilder()
    .setTitle('3Musafir App')
    .setDescription('APIs for 3musafir web app')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, options, {
    include: [UserModule, FlagshipModule, RegistrationModule, FeedbackModule],
  });
  SwaggerModule.setup('api', app, document);

  const allowedOrigins = getAllowedOrigins();
  const logger = new Logger('Bootstrap');

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const normalizedOrigin = normalizeOrigin(origin);
      if (!normalizedOrigin || !allowedOrigins.has(normalizedOrigin)) {
        logger.warn(`Blocked CORS request from origin: ${origin}`);
        return callback(
          new Error(
            'The CORS policy for this site does not allow access from the specified Origin.',
          ),
          false,
        );
      }
      return callback(null, true);
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });
  // Set up static file serving
  app.useStaticAssets(join(__dirname, '..', 'uploads'), {
    prefix: '/uploads',
  });

  // Port
  const PORT = process.env.PORT;
  await app.listen(PORT);
  logger.log(`Application is listening on port ${PORT}`);
}
bootstrap();
