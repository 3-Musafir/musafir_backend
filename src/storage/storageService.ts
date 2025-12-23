import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Readable } from 'stream';

@Injectable()
export class StorageService {
  private s3: S3Client;
  private bucket: string;

  constructor(private configService: ConfigService) {
    const region = this.configService.get<string>('AWS_REGION');
    const accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY_ID');
    const bucketName = this.configService.get<string>('AWS_BUCKET_NAME');
    
    console.log('🔧 StorageService - Initializing S3 Client:', {
      region: region,
      accessKeyId: accessKeyId ? `${accessKeyId.substring(0, 8)}...` : 'MISSING',
      bucket: bucketName,
      secretKeyPresent: !!this.configService.get<string>('AWS_SECRET_ACCESS_KEY'),
    });

    this.s3 = new S3Client({
      region: region,
      credentials: {
        accessKeyId: accessKeyId,
        secretAccessKey: this.configService.get<string>(
          'AWS_SECRET_ACCESS_KEY',
        ),
      },
    });

    this.bucket = bucketName;
  }

  async uploadFile(
    key: string,
    buffer: Buffer,
    mimetype: string,
  ): Promise<string> {
    console.log('📤 StorageService - Attempting to upload file:', {
      bucket: this.bucket,
      key: key,
      bufferSize: buffer.length,
      mimetype: mimetype,
    });

    try {
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: mimetype,
      });

      const response = await this.s3.send(command);
      
      console.log('✅ StorageService - Upload successful:', {
        key: key,
        etag: response.ETag,
        versionId: response.VersionId,
      });

      return key;
    } catch (error: any) {
      console.error('❌ StorageService - Upload failed:', {
        bucket: this.bucket,
        key: key,
        errorName: error.name,
        errorMessage: error.message,
        errorCode: error.Code || error.$metadata?.httpStatusCode,
        requestId: error.$metadata?.requestId,
        fullError: JSON.stringify(error, null, 2),
      });
      
      // Re-throw with more context
      throw new Error(`S3 Upload failed for ${key}: ${error.message}`);
    }
  }

  async deleteFile(key: string): Promise<void> {
    await this.s3.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
  }

  async getSignedUrl(key: string, expiresIn = 3600): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    return getSignedUrl(this.s3, command, { expiresIn });
  }

  async getImageData(key: string): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    const response = await this.s3.send(command);
    const stream = response.Body as Readable;

    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    const buffer = Buffer.concat(chunks);

    const base64 = buffer.toString('base64');
    const contentType = response.ContentType || 'image/jpeg';

    return `data:${contentType};base64,${base64}`;
  }
}
