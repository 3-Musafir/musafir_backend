import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { warn } from 'console';
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

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Use Global Pipes
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      // disableErrorMessages: true,
    }),
  );

  // Swagger
  const options = new DocumentBuilder()
    .setTitle('Teen-Musafir App')
    .setDescription('APIs for teen musafir web app')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, options, {
    include: [UserModule, FlagshipModule, RegistrationModule, FeedbackModule],
  });
  SwaggerModule.setup('api', app, document);

  const frontendUrl = process.env.FRONTEND_URL;

  app.enableCors({
    origin: (origin, callback) => {
      const allowedOrigins = [
        'http://localhost:3000',
        'https://test.3musafir.com',
        'https://www.3musafir.com',
      ];
      if (!origin) return callback(null, true);
      if (allowedOrigins.indexOf(origin) === -1) {
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
  warn(`APP IS LISTENING TO PORT ${PORT}`);
}
bootstrap();
