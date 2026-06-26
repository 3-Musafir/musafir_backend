import sharp from 'sharp';

describe('image optimizer', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('heic-convert');
  });

  it('optimizes standard image uploads to webp', async () => {
    const { optimizeImageToWebp } = await import('./image-optimizer');
    const pngBuffer = await sharp({
      create: {
        width: 20,
        height: 20,
        channels: 3,
        background: '#ff8800',
      },
    })
      .png()
      .toBuffer();

    const output = await optimizeImageToWebp(pngBuffer, {
      originalname: 'cover.png',
      mimetype: 'image/png',
    });
    const metadata = await sharp(output).metadata();

    expect(metadata.format).toBe('webp');
  });

  it('converts HEIC uploads before optimizing to webp', async () => {
    const jpegBuffer = await sharp({
      create: {
        width: 20,
        height: 20,
        channels: 3,
        background: '#0066cc',
      },
    })
      .jpeg()
      .toBuffer();
    const convertMock = jest.fn(async () => jpegBuffer);

    jest.doMock('heic-convert', () => convertMock);

    const { isHeicImage, optimizeImageToWebp } = await import('./image-optimizer');
    const output = await optimizeImageToWebp(Buffer.from('mock-heic-data'), {
      originalname: 'IMG_4674.HEIC',
      mimetype: 'image/heic',
    });
    const metadata = await sharp(output).metadata();

    expect(isHeicImage({ originalname: 'IMG_4674.HEIC' })).toBe(true);
    expect(convertMock).toHaveBeenCalledWith({
      buffer: Buffer.from('mock-heic-data'),
      format: 'JPEG',
      quality: 0.92,
    });
    expect(metadata.format).toBe('webp');
  });
});
