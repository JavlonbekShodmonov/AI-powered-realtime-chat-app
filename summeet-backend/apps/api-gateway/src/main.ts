import { existsSync, readFileSync } from "fs";
import * as path from "path";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { ValidationPipe } from "@nestjs/common";
import { createProxyMiddleware } from "http-proxy-middleware";

function loadEnvFile() {
  const candidates = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(__dirname, "..", ".env"),
  ];

  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;

    for (const line of readFileSync(candidate, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex === -1) continue;

      const key = trimmed.slice(0, separatorIndex).trim();
      const value = trimmed
        .slice(separatorIndex + 1)
        .trim()
        .replace(/^['"]|['"]$/g, "");

      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  }
}

loadEnvFile();

const { AppModule } = require("./app.module");

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.set("trust proxy", 1);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      stopAtFirstError: true,
    }),
  );

  app.enableCors({
    origin: ["http://localhost:3000", "https://summeet.live"],
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    allowedHeaders:
      "Content-Type, Accept, Authorization, x-client-device, x-anonymous-client-id, x-internal-secret",
    credentials: true,
  });
  app.use(
    "/api/ai",
    createProxyMiddleware({
      target: "http://localhost:3003",
      changeOrigin: true,
      pathRewrite: (path, req) => "/api/ai" + path,
    }),
  );

  const wsProxy = createProxyMiddleware({
    target: "http://localhost:3002",
    changeOrigin: true,
    ws: true,
  });
  app.use("/socket.io", wsProxy);

  const port = Number(process.env.PORT || 3001);
  await app.listen(port);

  // Must happen after listen() — this is what actually creates the
  // underlying http.Server. Without this line, the WS upgrade request
  // hangs indefinitely and Render eventually returns 504.
  const httpServer = app.getHttpServer();
  httpServer.on("upgrade", wsProxy.upgrade);

  console.log(`🚀 SumMeet API Gateway running on: http://localhost:${port}`);
}
bootstrap();
