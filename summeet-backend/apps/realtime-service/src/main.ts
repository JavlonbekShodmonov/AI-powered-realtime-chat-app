import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: ['http://localhost:3000', 'https://summeet.live'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
  });

  const port = Number(process.env.REALTIME_PORT || 3002);
  await app.listen(port);
  console.log(`📡 SumMeet Realtime-Worker Service running on port: ${port}`);
}
bootstrap();