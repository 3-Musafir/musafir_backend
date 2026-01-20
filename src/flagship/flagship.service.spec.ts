import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { FlagshipService } from './flagship.service';
import { RegistrationService } from 'src/registration/registration.service';
import { MailService } from 'src/mail/mail.service';
import { StorageService } from 'src/storage/storageService';
import { NotificationService } from 'src/notifications/notification.service';
import { UserService } from 'src/user/user.service';

describe('FlagshipService', () => {
  let service: FlagshipService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FlagshipService,
        { provide: getModelToken('Flagship'), useValue: {} },
        { provide: RegistrationService, useValue: {} },
        { provide: MailService, useValue: {} },
        { provide: StorageService, useValue: {} },
        { provide: getModelToken('User'), useValue: {} },
        { provide: getModelToken('Registration'), useValue: {} },
        { provide: getModelToken('Payment'), useValue: {} },
        { provide: NotificationService, useValue: {} },
        { provide: UserService, useValue: {} },
      ],
    }).compile();

    service = module.get<FlagshipService>(FlagshipService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
