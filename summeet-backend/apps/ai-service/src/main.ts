import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000', 'https://summeet.live'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
  });

  const port = Number(process.env.AI_SERVICE_PORT || 3003);
  await app.listen(port);
  console.log(`🚀 SumMeet AI Service running on: http://localhost:${port}`);
}
bootstrap();