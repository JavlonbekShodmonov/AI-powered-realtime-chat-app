import { Module } from "@nestjs/common";
import { PaymentsService } from "./payments.service";
import { PaymeController } from "./payme.controller";
import { ClickController } from "./click.controller";

@Module({
  controllers: [PaymeController, ClickController],
  providers: [PaymentsService],
})
export class PaymentsModule {}