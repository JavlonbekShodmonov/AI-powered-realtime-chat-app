import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Realtime microservice runs explicitly decoupled from HTTP APIs
  const port = Number(process.env.REALTIME_PORT || 3002);
  await app.listen(port);
  console.log(`📡 SumMeet Realtime-Worker Service running on port: ${port}`);
}
bootstrap();