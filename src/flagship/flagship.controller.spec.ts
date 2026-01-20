import { Test, TestingModule } from '@nestjs/testing';
import { FlagshipController } from './flagship.controller';
import { FlagshipService } from './flagship.service';

describe('FlagshipController', () => {
  let controller: FlagshipController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FlagshipController],
      providers: [{ provide: FlagshipService, useValue: {} }],
    }).compile();

    controller = module.get<FlagshipController>(FlagshipController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
