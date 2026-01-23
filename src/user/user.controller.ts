import {
  ResetPasswordDto,
  JwtResetPasswordDto,
} from './dto/reset-password.dto';
import { CreateForgotPasswordDto } from './dto/create-forgot-password.dto';
import { Request } from 'express';
import { LoginUserDto } from './dto/login-user.dto';
import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  UseInterceptors,
  UploadedFile,
  Query,
} from '@nestjs/common';
import { CreateGoogleUserDto } from './dto/create-user.dto';
import { VerifyUuidDto } from './dto/verify-uuid.dto';
import { UserService } from './user.service';
import { RefreshAccessTokenDto } from './dto/refresh-access-token.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
} from '@nestjs/swagger';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Auth } from '../auth/decorators/auth.decorator';
import { JwtAuthGuard } from '../auth/guards/auth.guard';
import { VerifyUserDto } from './dto/verify-user.dto';
import { AuthenticatedRequest } from './interfaces/authenticated-request';
import { errorResponse, successResponse } from '../constants/response';
import { GetUser } from 'src/auth/decorators/user.decorator';
import { Public } from 'src/auth/decorators/public.decorator';
import { User } from './interfaces/user.interface';
import { FileInterceptor } from '@nestjs/platform-express';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { UpdateVerificationStatusDto } from './dto/update-verification-status.dto';
import { VerificationStatus } from 'src/constants/verification-status.enum';

@ApiTags('User')
@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) { }

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register user' })
  @ApiCreatedResponse({})
  async register(@Body() createUserDto: any) {
    return await this.userService.create(createUserDto);
  }

  @Public()
  @Post('google')
  async googleLogin(
    @Req() req: Request,
    @Body() body: { email: string; googleId: string; fullName: string },
  ) {
    return await this.userService.createEmailUser(body, req);
  }

  @Public()
  @Post('create')
  async googleUserCreate(
    @Req() req: Request,
    @Body() createUserDto: CreateGoogleUserDto,
  ) {
    return this.userService.createGoogleUser(createUserDto, req);
  }

  @Public()
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify Email' })
  @ApiOkResponse({})
  async verifyEmail(@Req() req: Request) {
    const password = req.body.password;
    const verificationId = req.body.verificationId;
    return await this.userService.verifyEmail(req, password, verificationId);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login User' })
  @ApiOkResponse({})
  async login(@Req() req: Request, @Body() loginUserDto: LoginUserDto) {
    return await this.userService.login(req, loginUserDto);
  }

  @Public()
  @Get('check-email-availability')
  async checkEmailAvailability(@Query('email') email: string) {
    return await this.userService.checkEmailAvailability(email);
  }

  @Public()
  @Post('refresh-access-token')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Refresh Access Token with refresh token' })
  @ApiCreatedResponse({})
  async refreshAccessToken(
    @Body() refreshAccessTokenDto: RefreshAccessTokenDto,
  ) {
    return await this.userService.refreshAccessToken(refreshAccessTokenDto);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Forgot password' })
  @ApiOkResponse({})
  async forgotPassword(
    @Req() req: Request,
    @Body() createForgotPasswordDto: CreateForgotPasswordDto,
  ) {
    return await this.userService.forgotPassword(req, createForgotPasswordDto);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password after verify reset password' })
  @ApiBearerAuth()
  @ApiOkResponse({})
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    return await this.userService.resetPassword(resetPasswordDto);
  }

  @Public()
  @Post('reset-password-jwt')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password using JWT token from email link' })
  @ApiOkResponse({})
  async resetPasswordWithJwt(
    @Query('token') token: string,
    @Body() jwtResetPasswordDto: JwtResetPasswordDto,
  ) {
    return await this.userService.resetPasswordWithJwt(
      token,
      jwtResetPasswordDto,
    );
  }

  @Post('request-verification')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('video'))
  @ApiOperation({
    summary:
      'Request user verification by refferal code, video link or request a call',
  })
  @ApiBearerAuth()
  @ApiOkResponse({})
  async requestVerifyUser(
    @Body() verifyDto: VerifyUserDto,
    @UploadedFile() video: Express.Multer.File,
    @Req() req: AuthenticatedRequest,
  ): Promise<any> {
    try {
      const user = req.user;
      if (verifyDto.referral1 && verifyDto.referral2) {
        await this.userService.verifyWithReferrals(
          user._id.toString(),
          verifyDto,
        );
        return successResponse({}, 'User verified successfully', 200);
      }

      if (video) {
        const videoUrl = await this.userService.uploadVerificationVideo(
          video,
          user._id.toString(),
        );
        return successResponse(videoUrl, 'Video uploaded successfully', 200);
      }

      if (verifyDto.videoUrl || verifyDto.requestCall || video) {
        const res = await this.userService.requestVerification(
          user._id.toString(),
          verifyDto,
        );
        return successResponse(res, 'Verification Requested', 200);
      }
      return errorResponse('Unable to Verify User');
    } catch (error) {
      return errorResponse(error);
    }
  }

  @Get('verify-token')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get verified user' })
  @ApiBearerAuth()
  @ApiOkResponse({})
  async getVerifyUser(@Req() req: AuthenticatedRequest): Promise<any> {
    try {
      const user = req.user;
      const enrichedUser = this.userService.addProfileStatus(user);

      return successResponse(enrichedUser, 'Verified User', 200);
    } catch (error) {
      return errorResponse(error);
    }
  }

  @Get('data')
  @UseGuards(JwtAuthGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'A private route for check the auth' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({})
  findAll(@Req() req: Request) {
    return this.userService.findAll();
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getUserData(@GetUser() user: User) {
    return {
      statusCode: 200,
      message: 'User data fetched successfully',
      data: await this.userService.getUserData(user),
    };
  }

  @Get('verification-status')
  @UseGuards(JwtAuthGuard)
  async getUserVerificationStatus(@GetUser() user: User) {
    return {
      statusCode: 200,
      message: 'User verification status fetched successfully',
      data: {
        status:
          (user as any)?.verification?.status || VerificationStatus.UNVERIFIED,
      },
    };
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update user profile information' })
  @ApiOkResponse({})
  async updateUser(
    @GetUser() user: User,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    try {
      const updatedUser = await this.userService.updateUser(user._id.toString(), updateUserDto);
      return successResponse(updatedUser, 'User updated successfully', 200);
    } catch (error) {
      return errorResponse(error);
    }
  }

  @Get('unverified-users')
  @Roles('admin')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get Unverified Users' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({})
  UnverifiedUsers(@Query('search') search?: string) {
    return this.userService.unverifiedUsers(search);
  }

  @Get('verified-users')
  @Roles('admin')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get Verified Users' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({})
  VerifiedUsers(@Query('search') search?: string) {
    return this.userService.verifiedUsers(search);
  }

  @Get('pending-verification-users')
  @Roles('admin')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get Pending Verification Users' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({})
  PendingVerificationUsers(@Query('search') search?: string) {
    return this.userService.pendingVerificationUsers(search);
  }

  @Get('search-users')
  @Roles('admin')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Search users across all verification statuses' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({})
  async searchUsers(@Query('search') search: string) {
    return this.userService.searchAllUsers(search);
  }

  @Get('user-details/:id')
  @Roles('admin')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get User by ID' })
  @ApiOkResponse({})
  getUserById(@Param('id') id: string) {
    return this.userService.getUserById(id);
  }

  @Patch('approve/:id')
  @Roles('admin')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve User' })
  @ApiOkResponse({})
  approveUser(@Param('id') id: string, @Body('comment') comment?: string) {
    return this.userService.approveUser(id, comment);
  }

  @Patch('reject/:id')
  @Roles('admin')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject User' })
  @ApiOkResponse({})
  rejectUser(@Param('id') id: string, @Body('comment') comment?: string) {
    return this.userService.rejectUser(id, comment);
  }

  @Patch('verification-status/:id')
  @Roles('admin')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update user verification status (admin override)' })
  @ApiOkResponse({})
  async updateVerificationStatus(
    @Param('id') id: string,
    @Body() body: UpdateVerificationStatusDto,
  ) {
    try {
      const updatedUser = await this.userService.updateVerificationStatus(
        id,
        body.status,
        body.comment,
      );
      return successResponse(
        updatedUser,
        body.status === VerificationStatus.VERIFIED
          ? 'User verified successfully'
          : 'User marked as unverified',
        200,
      );
    } catch (error) {
      return errorResponse(error);
    }
  }

  @Post('find-user')
  @Roles('admin')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Find user by email or phone' })
  @ApiOkResponse({})
  async findUserByEmailOrPhone(@Body() body: { emailOrPhone: string }) {
    return await this.userService.findUserByEmailOrPhone(body.emailOrPhone);
  }

  @Post('verify-musafir-email')
  @Roles('admin')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify musafir email and generate password' })
  @ApiOkResponse({})
  async verifyMusafirEmail(@Body() body: { email: string; updateExisting?: boolean; userId?: string }) {
    return await this.userService.verifyMusafirEmail(body.email, body.updateExisting, body.userId);
  }
}
