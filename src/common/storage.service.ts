import { Injectable, Logger } from '@nestjs/common';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import { randomUUID } from 'crypto';
import { extname } from 'path';

const RAW_EXTENSIONS = new Set([
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.zip', '.rar', '.7z', '.csv', '.txt', '.json', '.xml',
]);

function isRawExtension(originalname: string): boolean {
  return RAW_EXTENSIONS.has(extname(originalname).toLowerCase());
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  constructor() {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
  }

  async uploadFile(file: Express.Multer.File, folder: string = 'uploads'): Promise<{ url: string; storageKey: string }> {
    return new Promise((resolve, reject) => {
      const isRaw = isRawExtension(file.originalname);
      const uniqueFileName = isRaw
        ? `${randomUUID()}${extname(file.originalname)}`
        : randomUUID();

      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: `tasker/${folder}`,
          public_id: uniqueFileName,
          resource_type: 'auto',
        },
        (error, result: UploadApiResponse) => {
          if (error) return reject(error);
          if (!result) return reject(new Error('Cloudinary upload failed'));

          const storageKey = `${result.resource_type}:${result.public_id}`;

          resolve({
            url: result.secure_url,
            storageKey,
          });
        },
      );

      uploadStream.end(file.buffer);
    });
  }

  async deleteFile(storageKey: string): Promise<void> {
    try {
      const [resourceType, ...rest] = storageKey.split(':');
      const publicId = rest.join(':');

      await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
    } catch (error) {
      this.logger.warn(`Failed to delete file from Cloudinary: ${storageKey}`);
    }
  }
}
