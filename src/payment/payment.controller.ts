import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PaymentService } from './payment.service';
import {
  CreateBankAccountDto,
  CreatePaymentDto,
  GetRefundsQueryDto,
  RequestRefundDto,
} from './dto/payment.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { JwtAuthGuard } from 'src/auth/guards/auth.guard';
import { GetUser } from 'src/auth/decorators/user.decorator';
import { User } from 'src/user/interfaces/user.interface';

@ApiTags('payment')
@Controller('payment')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) { }

  @Get('get-user-discount/:userId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get User Discount' })
  @ApiOkResponse({})
  getUserDiscount(@Param('userId') userId: string) {
    return this.paymentService.calculateUserDiscount(userId);
  }

  @Get('get-user-discount-by-registration/:registrationId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get User Discount by Registration ID' })
  @ApiOkResponse({})
  getUserDiscountByRegistration(@Param('registrationId') registrationId: string) {
    return this.paymentService.getUserDiscountByRegistrationId(registrationId);
  }

  @Get('get-bank-accounts')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get Bank Accounts' })
  @ApiOkResponse({})
  getBankAccounts() {
    return this.paymentService.getBankAccounts();
  }

  @Get('get-payment/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get Payment ID' })
  @ApiOkResponse({})
  @Roles('admin')
  getPayment(@Param('id') id: string) {
    return this.paymentService.getPayment(id);
  }

  @Get('get-pending-payments')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get Pending Payments' })
  @ApiOkResponse({})
  @Roles('admin')
  getPendingPayments() {
    return this.paymentService.getPendingPayments();
  }

  @Get('get-completed-payments')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get Completed Payments' })
  @ApiOkResponse({})
  @Roles('admin')
  getCompletedPayments() {
    return this.paymentService.getCompletedPayments();
  }

  @Post('create-bank-account')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create Bank Account' })
  @ApiOkResponse({})
  createBankAccount(@Body() createBankAccountDto: CreateBankAccountDto) {
    return this.paymentService.createBankAccount(createBankAccountDto);
  }

  @Post('refund')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request Refund' })
  @ApiOkResponse({})
  @UseGuards(JwtAuthGuard)
  requestRefund(@GetUser() user: User, @Body() requestRefundDto: RequestRefundDto) {
    return this.paymentService.requestRefund(requestRefundDto, user);
  }

  @Get('refund-quote/:registrationId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get refund quote based on policy' })
  @ApiOkResponse({})
  @UseGuards(JwtAuthGuard)
  refundQuote(@GetUser() user: User, @Param('registrationId') registrationId: string) {
    return this.paymentService.getRefundQuote(registrationId, user);
  }

  @Get('get-refunds')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get Refunds' })
  @ApiOkResponse({})
  @Roles('admin')
  getRefunds(@Query() query: GetRefundsQueryDto) {
    return this.paymentService.getRefunds(query);
  }

  @Patch('approve-refund/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve Refund' })
  @ApiOkResponse({})
  @Roles('admin')
  approveRefund(@Param('id') id: string, @GetUser() admin: User) {
    return this.paymentService.approveRefund(id, { credit: true, admin });
  }

  @Patch('approve-refund-no-credit/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve Refund (defer wallet credit)' })
  @ApiOkResponse({})
  @Roles('admin')
  approveRefundNoCredit(@Param('id') id: string, @GetUser() admin: User) {
    return this.paymentService.approveRefund(id, { credit: false, admin });
  }

  @Patch('post-refund-credit/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Post wallet credit for an approved refund' })
  @ApiOkResponse({})
  @Roles('admin')
  postRefundCredit(@Param('id') id: string, @GetUser() admin: User) {
    return this.paymentService.postRefundCredit(id, admin);
  }

  @Patch('reject-refund/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject Refund' })
  @ApiOkResponse({})
  @Roles('admin')
  rejectRefund(@Param('id') id: string, @GetUser() admin: User) {
    return this.paymentService.rejectRefund(id, admin);
  }

  @Post('create-payment')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create Payment' })
  @ApiOkResponse({})
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('screenshot'))
  createPayment(
    @Body() createPaymentDto: CreatePaymentDto,
    @UploadedFile() screenshot: Express.Multer.File,
    @GetUser() user: User,
  ) {
    return this.paymentService.createPayment(createPaymentDto, screenshot, user);
  }

  @Patch('approve-payment/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve Payment' })
  @ApiOkResponse({})
  @Roles('admin')
  approvePayment(@Param('id') id: string) {
    return this.paymentService.approvePayment(id);
  }

  @Patch('reject-payment/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject Payment' })
  @ApiOkResponse({})
  @Roles('admin')
  rejectPayment(@Param('id') id: string) {
    return this.paymentService.rejectPayment(id);
  }
}
