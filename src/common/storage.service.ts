// FILE: src/common/storage.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import { randomUUID } from 'crypto';
import { extname } from 'path';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  constructor() {
    // Connect to Cloudinary using your .env credentials
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
  }

  async uploadFile(file: Express.Multer.File, folder: string = 'uploads'): Promise<{ url: string; storageKey: string }> {
    return new Promise((resolve, reject) => {
      // Create a unique file name
      const uniqueFileName = `${randomUUID()}${extname(file.originalname)}`;

      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: `tasker/${folder}`,
          public_id: uniqueFileName,
          resource_type: 'auto', // Auto-detects if it's an image or a raw file (pdf, zip, doc)
        },
        (error, result: UploadApiResponse) => {
          if (error) return reject(error);
          if (!result) return reject(new Error('Cloudinary upload failed'));
          
          // We save the resource_type alongside the ID so we know how to delete it later 
          // (Cloudinary requires knowing if it's an "image" or "raw" file to delete it).
          const storageKey = `${result.resource_type}:${result.public_id}`;
          
          resolve({
            url: result.secure_url,
            storageKey, 
          });
        },
      );

      // Push the memory buffer to Cloudinary
      uploadStream.end(file.buffer);
    });
  }

  async deleteFile(storageKey: string): Promise<void> {
    try {
      // Split our custom string format back into type and public_id
      const [resourceType, ...rest] = storageKey.split(':');
      const publicId = rest.join(':');

      await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
    } catch (error) {
      this.logger.warn(`Failed to delete file from Cloudinary: ${storageKey}`);
    }
  }
}
