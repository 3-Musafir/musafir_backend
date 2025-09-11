import {
  BadRequestException,
  Injectable,
  UnauthorizedException
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import Cryptr from 'cryptr';
import { Request } from 'express';
import { sign, verify } from 'jsonwebtoken';
import { Model } from 'mongoose';
import { getClientIp } from 'request-ip';
import { errorResponse, successResponse } from '../constants/response';
import { User } from '../user/interfaces/user.interface';
import { v4 } from 'uuid';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { RefreshToken } from './interfaces/refresh-token.interface';

@Injectable()
export class AuthService {
  cryptr: any;

  constructor(
    @InjectModel('User') private readonly userModel: Model<User>,
    @InjectModel('RefreshToken')
    private readonly refreshTokenModel: Model<RefreshToken>,
  ) {
    this.cryptr = new Cryptr(process.env.ENCRYPT_JWT_SECRET);
  }

  async createAccessToken(userId: string) {
    const accessToken = sign({ userId }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRATION,
    });
    return this.encryptText(accessToken);
  }

  async createRefreshToken(req: Request, userId) {
    const refreshToken = new this.refreshTokenModel({
      userId,
      refreshToken: v4(),
      ip: this.getIp(req),
    });
    await refreshToken.save();
    return refreshToken.refreshToken;
  }

  async findRefreshToken(token: string) {
    const refreshToken = await this.refreshTokenModel.findOne({
      refreshToken: token,
    });
    if (!refreshToken) {
      throw new UnauthorizedException('User has been logged out.');
    }
    return refreshToken.userId;
  }

  async validateUser(jwtPayload: JwtPayload): Promise<any> {
    const user = await this.userModel.findOne({
      _id: jwtPayload.userId,
    });
    if (!user) {
      throw new UnauthorizedException('User not found.');
    }
    return user; 
  }

  public async varifyToken(token: string) {
    const secretKey: string = process.env.JWT_SECRET;
    console.log(secretKey, 'secretKey');
    
    try {
      const verificationResponse: JwtPayload = verify(
        token,
        secretKey,
      ) as JwtPayload;

      const userId = verificationResponse.userId;
      const findUser = await this.userModel.findById(userId);
      if (!findUser) return errorResponse({statusCode: 401, message: `User not found`});
      return successResponse(findUser,'User Found');
    } catch (e) {
      console.log(e);
      return errorResponse({statusCode: 401, message: e.message });
    }
  }

  // JWT Extractor

  private jwtExtractor(request) {
    let token = null;
    if (request.header('x-token')) {
      token = request.get('x-token');
    } else if (request.headers.authorization) {
      token = request.headers.authorization
        .replace('Bearer ', '')
        .replace(' ', '');
    } else if (request.body.token) {
      token = request.body.token.replace(' ', '');
    }
    if (request.query.token) {
      token = request.body.token.replace(' ', '');
    }
    const cryptr = new Cryptr(process.env.ENCRYPT_JWT_SECRET);
    if (token) {
      try {
        token = cryptr.decrypt(token);
      } catch (err) {
        throw new BadRequestException('Bad request.');
      }
    }
    return token;
  }

  returnJwtExtractor() {
    return this.jwtExtractor;
  }

  getIp(req: Request): string {
    return getClientIp(req);
  }

  encryptText(text: string): string {
    return this.cryptr.encrypt(text);
  }



}
