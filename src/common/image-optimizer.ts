import sharp, { ResizeOptions } from 'sharp';

const heicConvert = require('heic-convert');

type UploadedImageMeta = {
  originalname?: string;
  mimetype?: string;
};

type OptimizeImageOptions = UploadedImageMeta & {
  quality?: number;
  resize?: ResizeOptions & {
    width?: number;
    height?: number;
  };
};

const heicExtensionPattern = /\.(heic|heif)$/i;

export const isHeicImage = (meta: UploadedImageMeta = {}) => {
  const mimetype = meta.mimetype?.toLowerCase() || '';
  return (
    mimetype === 'image/heic' ||
    mimetype === 'image/heif' ||
    heicExtensionPattern.test(meta.originalname || '')
  );
};

const isHeicDecodeError = (error: any) => {
  const message = String(error?.message || error || '').toLowerCase();
  return (
    message.includes('heif') ||
    message.includes('heic') ||
    message.includes('bad seek') ||
    message.includes('compression format')
  );
};

const convertHeicToJpeg = async (buffer: Buffer) => {
  const converted = await heicConvert({
    buffer,
    format: 'JPEG',
    quality: 0.92,
  });

  return Buffer.from(converted);
};

const convertToWebp = async (
  buffer: Buffer,
  options: OptimizeImageOptions = {},
) => {
  let pipeline = sharp(buffer).rotate();

  if (options.resize) {
    pipeline = pipeline.resize(options.resize);
  }

  return pipeline.webp({ quality: options.quality ?? 82 }).toBuffer();
};

export const optimizeImageToWebp = async (
  buffer: Buffer,
  options: OptimizeImageOptions = {},
) => {
  if (isHeicImage(options)) {
    const jpegBuffer = await convertHeicToJpeg(buffer);
    return convertToWebp(jpegBuffer, options);
  }

  try {
    return await convertToWebp(buffer, options);
  } catch (error) {
    if (!isHeicDecodeError(error)) {
      throw error;
    }

    const jpegBuffer = await convertHeicToJpeg(buffer);
    return convertToWebp(jpegBuffer, options);
  }
};
