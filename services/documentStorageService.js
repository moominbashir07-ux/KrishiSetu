const path = require('path');

class DocumentStorageService {
  static validateDocument({ documentType, documentReference, fileName, fileSize, mimeType }) {
    const validTypes = ['identity', 'land_record', 'business_registration', 'other'];
    if (!documentType || !validTypes.includes(documentType)) {
      const err = new Error('Invalid document type. Must be identity, land_record, business_registration, or other.');
      err.statusCode = 400;
      throw err;
    }

    if (!documentReference || typeof documentReference !== 'string' || !documentReference.trim()) {
      const err = new Error('Document reference number or identifier is required.');
      err.statusCode = 400;
      throw err;
    }

    if (fileName) {
      const ext = path.extname(fileName).toLowerCase();
      const forbiddenExts = ['.exe', '.js', '.sh', '.bat', '.cmd', '.py', '.php', '.dll', '.so', '.vbs', '.scr'];
      if (forbiddenExts.includes(ext)) {
        const err = new Error('Dangerous file format rejected. Executable files are not allowed.');
        err.statusCode = 400;
        throw err;
      }

      const allowedExts = ['.pdf', '.jpg', '.jpeg', '.png', '.doc', '.docx'];
      if (!allowedExts.includes(ext)) {
        const err = new Error('Invalid file format. Allowed formats: PDF, JPG, PNG, DOC.');
        err.statusCode = 400;
        throw err;
      }
    }

    if (fileSize && Number(fileSize) > 5 * 1024 * 1024) {
      const err = new Error('File size exceeds maximum allowed limit of 5MB.');
      err.statusCode = 400;
      throw err;
    }

    return true;
  }

  static storeDocumentReference({ sellerId, documentType, documentReference, fileName, fileSize, mimeType }) {
    this.validateDocument({ documentType, documentReference, fileName, fileSize, mimeType });

    const storageProvider = process.env.STORAGE_PROVIDER || 'dev';
    const documentUrl = `/storage/verifications/${sellerId}_${documentType}_${Date.now()}${fileName ? path.extname(fileName) : '.pdf'}`;

    if (storageProvider === 'dev') {
      console.log(`[DEV STORAGE SERVICE] Verification document registered for Seller ${sellerId}: ${documentReference} (${documentType})`);
    }

    return {
      documentType,
      documentReference: documentReference.trim(),
      documentUrl,
      provider: storageProvider
    };
  }
}

module.exports = DocumentStorageService;
