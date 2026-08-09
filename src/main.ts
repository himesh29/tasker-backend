import 'dotenv/config'; // must be first — loads .env before anything else reads process.env
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { join } from 'path';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Needed to read the refresh_token httpOnly cookie in AuthController/JwtRefreshStrategy.
  app.use(cookieParser());

  // Serves uploaded attachment files at http://.../uploads/<filename>
  // (see AttachmentsController — this is what attachment.url points to).
  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads/' });

  // Auto-validates and strips unknown fields from incoming DTOs
  // (GoogleLoginDto, etc.)
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Frontend runs on a different origin — allow it, and allow cookies
  // to be sent (needed for the refresh token flow).
  app.enableCors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:3001',
    credentials: true,
  });

  // Swagger setup
  const config = new DocumentBuilder()
    .setTitle('Tasker API')
    .setDescription('Backend API for the Tasker application')
    .setVersion('1.0')
    .addBearerAuth() // JWT bearer token auth
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document); // Swagger UI at /api/docs

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
