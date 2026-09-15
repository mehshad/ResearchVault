/**
 * Certificate upload processing: OCR of CITI certificates and reports, the
 * module-matching heuristics, and batch confirmation.
 * Moved out of server/routes.ts as one domain, unchanged; see #42.
 */
import type { Express } from "express";
import { requireAuth } from "../auth";
import { storage } from "../databaseStorage";
import { log, logError } from "../logger";
import { ObjectPermission } from "../objectAcl";
import { ObjectStorageService } from "../objectStorage";
import { getObjectStorageService, isLocalStorage } from "../objectStorageService";
import { and } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { z } from "zod";

export function registerCertificateOcrRoutes(app: Express): void {
  // Returns true only if the path is a server-issued /objects/... reference.
  // The ObjectUploader stores objectPath (e.g. "/objects/<uuid>") as the file URL
  // after upload, so this is the expected form. Rejecting everything else prevents
  // SSRF and arbitrary GCS object reads: object paths are resolved server-side via
  // getObjectEntityFile(), which validates the path against PRIVATE_OBJECT_DIR.
  function isAllowedObjectPath(path: string): boolean {
    if (typeof path !== "string") return false;
    // Must be a server-issued /objects/<non-empty-id> path, no query string or fragment.
    return /^\/objects\/[^?#]+$/.test(path);
  }

  // Certificate processing - batch detection with OCR
  app.post("/api/certificates/process-batch", requireAuth, async (req, res) => {
    try {
      const { fileUrls, fileNames } = req.body;
      if (!fileUrls || !Array.isArray(fileUrls)) {
        return res.status(400).json({ message: "File URLs array is required" });
      }
      const sessionUser = (req.session as any)?.user;
      const callerId: string | undefined = sessionUser?.id?.toString();

      const modules = await storage.getCertificationModules();
      const results = [];

      for (let fileIndex = 0; fileIndex < fileUrls.length; fileIndex++) {
        const fileUrl = fileUrls[fileIndex];
        // Prefer the real, client-supplied filename; fall back to the object
        // path basename (a UUID) only when no name was provided.
        const providedName = Array.isArray(fileNames) ? fileNames[fileIndex] : undefined;
        const displayName =
          (providedName && String(providedName).trim()) ||
          String(fileUrl).split('/').pop();
        try {
          // Security: only accept server-issued /objects/... paths.
          // This prevents SSRF and arbitrary GCS object reads. The path is resolved
          // server-side via getObjectEntityFile(), which validates it against
          // PRIVATE_OBJECT_DIR so it can only address files this app uploaded.
          if (!isAllowedObjectPath(fileUrl)) {
            results.push({
              fileName: displayName,
              filePath: fileUrl,
              originalUrl: fileUrl,
              status: 'error',
              error: 'File path is not a valid server-issued upload reference.'
            });
            continue;
          }

          let detectedData: any = {
            fileName: displayName,
            filePath: fileUrl,
            originalUrl: fileUrl,
            status: 'processing',
            extractedText: null,
            parsedData: null
          };

          const startTime = Date.now();

          // Resolve the uploaded file server-side via the object storage service.
          // getObjectEntityFile() validates the path against PRIVATE_OBJECT_DIR and
          // confirms the object exists in GCS — no caller-controlled URL is followed.
          const objectStorageService = getObjectStorageService();
          let gcsFile: any;
          try {
            gcsFile = await objectStorageService.getObjectEntityFile(fileUrl);
          } catch (resolveError: any) {
            results.push({
              ...detectedData,
              status: 'error',
              error: 'Uploaded file not found in storage.'
            });
            continue;
          }

          // Authorization: verify the caller is allowed to read this object.
          // Finalize sets the uploader as the owner on cloud storage, so the
          // ownership check applies. Local storage has no ACL to check.
          if (!isLocalStorage) {
            try {
              const canAccess = await (objectStorageService as ObjectStorageService).canAccessObjectEntity({
                userId: callerId,
                objectFile: gcsFile,
                requestedPermission: ObjectPermission.READ,
              });
              if (!canAccess) {
                results.push({
                  ...detectedData,
                  status: 'error',
                  error: 'Access denied: you are not the owner of this file.'
                });
                continue;
              }
            } catch (aclError) {
              // If ACL check fails (e.g. no ACL set yet), deny by default.
              results.push({
                ...detectedData,
                status: 'error',
                error: 'Access denied: could not verify file ownership.'
              });
              continue;
            }
          }

          // Read the file into a buffer. Works for both local storage (LocalFile)
          // and GCS (File). Local storage path is read directly from disk;
          // GCS path uses the SDK download() method.
          let fileBuffer: Buffer;
          let contentType = '';
          try {
            if (isLocalStorage) {
              // LocalFile has a .filePath property — read directly from disk.
              const { readFile } = await import('fs/promises');
              fileBuffer = await readFile((gcsFile as import('../localObjectStorage').LocalFile).filePath);
              // Content-type from the upload request is not stored on disk;
              // fall through to magic-byte detection below.
            } else {
              // GCS: get content-type from object metadata, then download.
              try {
                const [metadata] = await gcsFile.getMetadata();
                contentType = metadata.contentType || '';
                log(`Content-Type from GCS metadata: ${contentType}`, "routes");
              } catch (metaError) {
                log('Could not read GCS metadata, will detect from bytes', "routes");
              }
              const [fileContent] = await gcsFile.download();
              fileBuffer = fileContent;
            }
          } catch (downloadError: any) {
            results.push({
              ...detectedData,
              status: 'error',
              error: 'Failed to read file from storage.'
            });
            continue;
          }
          
          // Create initial PDF import history entry
          const historyEntry = await storage.createPdfImportHistoryEntry({
            fileName: detectedData.fileName || 'unknown',
            fileUrl: fileUrl,
            uploadedBy: 1, // TODO: Get from session/auth
            processingStatus: 'processing',
            ocrProvider: 'unknown'
          });

          // Determine file type from GCS metadata content-type + magic bytes in the
          // downloaded buffer. No user-supplied URL is fetched for this step.
          let isPDF = false;
          let isValidFile = false;

          if (contentType.includes('pdf') || contentType.includes('application/pdf')) {
            isPDF = true;
            isValidFile = true;
            log('PDF detected via Content-Type metadata', "routes");
          } else if (contentType.includes('image/')) {
            isValidFile = true;
            log('Image file detected via Content-Type metadata', "routes");
          } else {
            // Fall back to magic-byte detection from the already-downloaded buffer.
            const bytes = new Uint8Array(fileBuffer.buffer, fileBuffer.byteOffset, Math.min(fileBuffer.byteLength, 10));
            log(`File signature bytes: ${Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(' ')}`, "routes");
            if (bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
              log('PDF detected via magic bytes (%PDF)', "routes");
              isPDF = true;
              isValidFile = true;
            } else if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
              log('PNG detected via magic bytes', "routes");
              isValidFile = true;
            } else if (bytes.length >= 3 && bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) {
              log('JPEG detected via magic bytes', "routes");
              isValidFile = true;
            } else {
              log('Unknown file signature - treating as image for OCR attempt', "routes");
              isValidFile = true;
            }
          }

          if (!isValidFile) {
            log('File type validation failed, skipping OCR processing', "routes");
            continue;
          }

          // Get OCR configuration and perform OCR based on settings
          const ocrConfig = await storage.getSystemConfiguration('ocr_service');
          const ocrSettings = ocrConfig?.value as any || { provider: 'ocr_space' };
          let provider = ocrSettings.provider;

          try {
            if (isPDF && provider === 'tesseract') {
              log('Warning: Using Tesseract for PDF processing - may have limited accuracy', "routes");
            }
            
            detectedData.status = 'processing';
            log(`Processing OCR for file: ${fileUrl} using ${provider}`, "routes");

            let extractedText: string | null = '';

            // CITI PDFs are usually text-based (not scanned images). Extract the
            // embedded text layer directly first — it's far more accurate than OCR
            // for module names, record IDs and dates. Only fall back to OCR when
            // the PDF has little/no embedded text (i.e. it's a scanned image).
            if (isPDF) {
              try {
                const pdfText = await extractPdfText(Buffer.from(fileBuffer));
                if (pdfText && pdfText.replace(/\s/g, '').length >= 100) {
                  extractedText = pdfText;
                  provider = 'pdf-text';
                  log(`Extracted embedded PDF text (${pdfText.length} chars) — skipping OCR`, "routes");
                } else {
                  log('PDF has little/no embedded text — falling back to OCR (likely scanned image)', "routes");
                }
              } catch (pdfErr: any) {
                logError('Embedded PDF text extraction failed, falling back to OCR', "routes", pdfErr?.message);
              }
            }

            if (!extractedText && provider === 'ocr_space') {
              // Use OCR.space API
              try {
                log('Attempting OCR.space API call...', "routes");
                log('API Key available', "routes", { detail: !!(process.env.OCR_SPACE_API_KEY || ocrSettings.ocrSpaceApiKey) });

                const apiKey = process.env.OCR_SPACE_API_KEY || ocrSettings.ocrSpaceApiKey || 'helloworld';

                // OCR.space free tier rejects PDFs with more than 3 pages. Split
                // multi-page PDFs (e.g. CITI completion reports) into ≤3-page chunks,
                // OCR each, then stitch the text back together. Non-PDFs and short
                // PDFs go through as a single buffer.
                let buffersToOcr: Buffer[] = [Buffer.from(fileBuffer)];
                if (isPDF) {
                  try {
                    buffersToOcr = await splitPdfIntoChunks(Buffer.from(fileBuffer), 3);
                    if (buffersToOcr.length > 1) {
                      log(`PDF split into ${buffersToOcr.length} chunk(s) to stay within OCR page limit`, "routes");
                    }
                  } catch (splitErr: any) {
                    logError('PDF split failed, sending whole file', "routes", splitErr?.message);
                    buffersToOcr = [Buffer.from(fileBuffer)];
                  }
                }

                const chunkTexts: string[] = [];
                for (let chunkIndex = 0; chunkIndex < buffersToOcr.length; chunkIndex++) {
                  log(`Uploading chunk ${chunkIndex + 1}/${buffersToOcr.length} to OCR.space (${buffersToOcr[chunkIndex].byteLength} bytes)...`, "routes");
                  const chunkText = await ocrSpaceExtractText(buffersToOcr[chunkIndex], apiKey, isPDF, contentType);
                  if (chunkText && chunkText.trim().length > 0) {
                    chunkTexts.push(chunkText);
                  }
                }

                extractedText = chunkTexts.join('\n');
                log(`OCR Extracted Text Length: ${extractedText.length} characters across ${buffersToOcr.length} chunk(s)`, "routes");
                log('First 500 characters of extracted text', "routes", { detail: extractedText.substring(0, 500) });
              } catch (apiError: any) {
                logError('OCR.space failed', "routes", apiError.message);

                // Don't fallback to Tesseract for rate limit errors or 403 errors
                if (apiError.message && (apiError.message.includes('RATE_LIMIT') || apiError.message.includes('403'))) {
                  throw new Error('OCR service temporarily unavailable (rate limit). Please wait about an hour and try again.');
                }

                log('Falling back to Tesseract.js...', "routes");
                // Don't throw error yet, let it fall back to Tesseract
                extractedText = null; // Signal to use fallback
              }
            }

            // If OCR.space failed or wasn't used, try Tesseract.js (only for image formats)
            if (!extractedText) {
              // For Tesseract, only block if the initial detection confirmed it's a PDF
              if (isPDF && provider === 'tesseract') {
                log('Confirmed PDF file detected in initial scan - Tesseract.js cannot process PDF files', "routes");
                throw new Error('PDF files cannot be processed with Tesseract.js. Please either: 1) Switch to OCR.space in Config tab, or 2) Convert your PDF to an image (PNG, JPG) first.');
              }
              
              log('Proceeding with Tesseract.js processing for image file', "routes");

              // Use Tesseract.js for image processing
              log('Attempting Tesseract.js processing for image file...', "routes");
              try {
                // Use the already-downloaded fileBuffer for Tesseract recognition.
                // Content type was determined from GCS metadata above, no HEAD fetch needed.
                const detectedFileType = contentType.includes('image/') ? contentType.split('/')[1]?.split(';')[0] : '';
                log(`Tesseract processing buffer (${fileBuffer.byteLength} bytes), content-type: ${contentType || 'unknown'}`, "routes");

                const { createWorker } = await import('tesseract.js');
                let worker = null;
                
                try {
                  worker = await createWorker(ocrSettings.tesseractOptions?.language || 'eng');
                  
                  // Add timeout to prevent hanging and wrap recognition in additional error handling
                  // Pass the Buffer directly — Tesseract.js accepts Buffer/ArrayBuffer, so no
                  // URL-based network fetch is made here.
                  const recognitionPromise = worker.recognize(fileBuffer).catch((err: any) => {
                    logError('Tesseract recognition failed', "routes", err);
                    throw new Error(`Image recognition failed: ${err?.message || 'Unknown error'}`);
                  });
                  
                  const timeoutPromise = new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('OCR processing timed out after 60 seconds')), 60000)
                  );
                  
                  const { data: { text } } = await Promise.race([recognitionPromise, timeoutPromise]) as any;
                  extractedText = text;
                } catch (tesseractError: any) {
                  logError('Tesseract.js error', "routes", tesseractError);
                  // Set extracted text to empty to trigger fallback handling
                  extractedText = '';
                  throw new Error(`Tesseract OCR failed: ${tesseractError?.message || 'Unsupported image format or processing error'}`);
                } finally {
                  if (worker) {
                    try {
                      await worker.terminate();
                    } catch (terminateError) {
                      logError('Error terminating Tesseract worker', "routes", terminateError);
                    }
                  }
                }
              } catch (importError: any) {
                logError('Error importing Tesseract.js', "routes", importError);
                extractedText = '';
                throw new Error(`Failed to load OCR library: ${importError?.message || 'OCR module not available'}`);
              }
            }

            if (extractedText && extractedText.trim().length > 0) {
              detectedData.extractedText = extractedText;
              log(`OCR extracted ${extractedText.length} characters using ${provider}`, "routes");

              // Parse CITI certificate data from extracted text
              log('Starting certificate parsing...', "routes");
              log('Available modules', "routes", { detail: modules.map(m => m.name) });
              const parsedData = await parseCITICertificate(extractedText, modules);
              log('Parsing result', "routes", { detail: JSON.stringify(parsedData, null, 2) });
              detectedData = {
                ...detectedData,
                ...parsedData,
                status: parsedData.name ? 'detected' : 'unrecognized'
              };

              // Update history entry with parsed data
              try {
                log(`Updating history entry ${historyEntry.id} with parsed data`, "routes", {
                  processingStatus: parsedData.name ? 'completed' : 'failed',
                  hasExtractedText: !!extractedText,
                  parsedDataFields: Object.keys(parsedData).filter(k => parsedData[k] !== null),
                  processingDuration: Date.now() - startTime
                });
                
                const updateResult = await storage.updatePdfImportHistoryEntry(historyEntry.id, {
                  processingStatus: parsedData.name ? 'completed' : 'failed',
                  ocrProvider: provider, // Make sure OCR provider is saved
                  documentType: parsedData.documentType || 'unknown',
                  extractedText: extractedText,
                  parsedData: parsedData,
                  
                  processingDuration: Date.now() - startTime,
                  errorMessage: parsedData.name ? null : 'Certificate data could not be extracted - manual assignment may be required'
                });
                
                log('History entry update result', "routes", { detail: updateResult ? 'SUCCESS' : 'FAILED' });
              } catch (updateError) {
                logError('Failed to update history entry', "routes", updateError);
              }
            } else {
              detectedData.status = 'ocr_failed';
              detectedData.error = 'No text could be extracted from the file';
              
              // Update history entry with OCR failure
              try {
                log(`Updating history entry ${historyEntry.id} with OCR failure`, "routes");
                const updateResult = await storage.updatePdfImportHistoryEntry(historyEntry.id, {
                  processingStatus: 'failed',
                  ocrProvider: provider, // Make sure OCR provider is saved
                  documentType: 'unknown', // OCR failed, so document type unknown
                  errorMessage: 'No text could be extracted from the file',
                  
                  processingDuration: Date.now() - startTime
                });
              } catch (updateError) {
                logError('Failed to update history entry with OCR failure', "routes", updateError);
              }
            }
          } catch (ocrError: any) {
            logError('OCR processing error', "routes", ocrError);
            detectedData.status = 'ocr_failed';
            detectedData.error = `OCR processing failed: ${ocrError?.message || 'Unknown error'}`;
            detectedData.suggestion = 'OCR failed - file uploaded but data extraction was unsuccessful. You can still manually assign this certificate to a scientist.';
            
            // Update history entry with OCR error
            try {
              log(`Updating history entry ${historyEntry.id} with OCR error`, "routes", { detail: ocrError?.message });
              const updateResult = await storage.updatePdfImportHistoryEntry(historyEntry.id, {
                processingStatus: 'failed',
                ocrProvider: provider, // Make sure OCR provider is saved
                documentType: 'unknown', // OCR error, so document type unknown
                errorMessage: `OCR processing failed: ${ocrError?.message || 'Unknown error'}`,
                
                processingDuration: Date.now() - startTime
              });
            } catch (updateError) {
              logError('Failed to update history entry with OCR error', "routes", updateError);
            }
          }

          results.push(detectedData);
        } catch (error: any) {
          results.push({
            fileName: displayName,
            filePath: fileUrl,
            originalUrl: fileUrl,
            status: 'error',
            error: error?.message || 'Unknown error'
          });
        }
      }

      res.json({
        message: `Processed ${results.length} files with OCR`,
        results
      });
    } catch (error) {
      logError("Error processing certificates", "routes", error);
      res.status(500).json({ message: "Failed to process certificates" });
    }
  });


  // Extract the embedded text layer from a (text-based) PDF. CITI certificates
  // and completion reports are normally generated as text PDFs, so reading the
  // text layer directly is far more accurate than OCR. Returns '' when the PDF
  // has no usable text (e.g. a scanned image), signalling the caller to OCR.
  async function extractPdfText(buffer: Buffer): Promise<string> {
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    try {
      const result = await parser.getText();
      return result?.text || '';
    } finally {
      await parser.destroy?.();
    }
  }

  // Split a PDF into chunks of at most `pagesPerChunk` pages so each chunk stays
  // within OCR.space's free-tier 3-page limit. CITI completion reports are often
  // 4+ pages (Requirements + Transcript) and would otherwise be rejected outright.
  // Returns the original buffer unchanged when the PDF is already within the limit
  // or when it can't be parsed.
  async function splitPdfIntoChunks(buffer: Buffer, pagesPerChunk = 3): Promise<Buffer[]> {
    const { PDFDocument } = await import('pdf-lib');
    const src = await PDFDocument.load(buffer, { ignoreEncryption: true });
    const total = src.getPageCount();
    if (total <= pagesPerChunk) {
      return [buffer];
    }
    const chunks: Buffer[] = [];
    for (let start = 0; start < total; start += pagesPerChunk) {
      const chunkDoc = await PDFDocument.create();
      const indices: number[] = [];
      for (let i = start; i < Math.min(start + pagesPerChunk, total); i++) {
        indices.push(i);
      }
      const copied = await chunkDoc.copyPages(src, indices);
      copied.forEach((p) => chunkDoc.addPage(p));
      const bytes = await chunkDoc.save();
      chunks.push(Buffer.from(bytes));
    }
    return chunks;
  }

  // Send a single buffer to OCR.space and return the concatenated text across all
  // pages in the response. Throws on rate limit, HTTP, or processing errors.
  async function ocrSpaceExtractText(
    buffer: Buffer,
    apiKey: string,
    isPDF: boolean,
    contentType: string,
  ): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    try {
      const fileBlob = new Blob([buffer], {
        type: isPDF ? 'application/pdf' : (contentType || 'application/octet-stream'),
      });
      const formData = new FormData();
      formData.append('file', fileBlob, isPDF ? 'certificate.pdf' : 'certificate.img');
      formData.append('apikey', apiKey);
      formData.append('language', 'eng');
      formData.append('isOverlayRequired', 'false');
      if (isPDF) {
        formData.append('filetype', 'PDF');
      }
      formData.append('detectOrientation', 'false');
      formData.append('isCreateSearchablePdf', 'false');
      formData.append('isSearchablePdfHideTextLayer', 'false');
      formData.append('scale', 'true');
      formData.append('isTable', 'false');
      formData.append('OCREngine', '2');

      const ocrResponse = await fetch('https://api.ocr.space/parse/image', {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });

      if (!ocrResponse.ok) {
        const errorText = await ocrResponse.text();
        if (ocrResponse.status === 403 && errorText.includes('180 number of times')) {
          throw new Error('RATE_LIMIT: OCR service rate limit exceeded. Please wait about an hour before processing more certificates.');
        }
        throw new Error(`Failed to connect to OCR.space service: ${ocrResponse.status}`);
      }

      const ocrResult = await ocrResponse.json();
      if (ocrResult.IsErroredOnProcessing === true) {
        const errorMessages = Array.isArray(ocrResult.ErrorMessage) ? ocrResult.ErrorMessage : [ocrResult.ErrorMessage];
        throw new Error(errorMessages.join(', ') || 'OCR processing failed');
      }
      if (ocrResult.ParsedResults?.length > 0) {
        return ocrResult.ParsedResults.map((r: any) => r.ParsedText || '').join('\n');
      }
      throw new Error(ocrResult.ErrorMessage || 'OCR processing failed');
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // Helper function to detect CITI document type
  function detectCITIDocumentType(text: string): 'certificate' | 'report' | 'unknown' {
    // Report format indicators are checked FIRST. Completion reports also contain
    // the generic "Collaborative Institutional Training Initiative" line (in their
    // footer), so checking certificate markers first would misclassify reports.
    if (/completion report/i.test(text) ||
        /coursework requirements/i.test(text) ||
        /coursework transcript/i.test(text) ||
        /part 1 of 2/i.test(text) ||
        /part 2 of 2/i.test(text)) {
      return 'report';
    }

    // Certificate format indicators
    if (/this is to certify that/i.test(text) ||
        /has completed the following citi program course/i.test(text) ||
        /collaborative institutional training initiative/i.test(text)) {
      return 'certificate';
    }

    return 'unknown';
  }

  // --- Certification module matching helpers ---------------------------------
  // Stopwords that carry no discriminating meaning for course names.
  const MODULE_STOPWORDS = new Set([
    'the', 'of', 'and', 'for', 'with', 'a', 'an', 'to', 'in', 'on',
    'course', 'training', 'series', 'complete', 'program', 'citi', 'stage'
  ]);

  // Normalize a course/module name: lowercase, strip parentheticals + punctuation.
  function normalizeModuleName(s: string): string {
    return (s || '')
      .toLowerCase()
      .replace(/\([^)]*\)/g, ' ')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Significant (non-stopword) tokens used for fuzzy overlap matching.
  function significantTokens(s: string): string[] {
    return normalizeModuleName(s).split(' ').filter(t => t && !MODULE_STOPWORDS.has(t));
  }

  // Pull an abbreviation out of a parenthetical, e.g. "Animal Biosafety (ABS)" -> "abs".
  function extractAbbrev(name: string): string | null {
    const m = (name || '').match(/\(([^)]+)\)/);
    if (m) {
      const inner = m[1].trim();
      if (/^[A-Za-z]{2,8}$/.test(inner)) return inner.toLowerCase();
    }
    return null;
  }

  // Strict module matcher. Returns a module only on a confident match,
  // otherwise null so the caller can flag the course as a NEW module.
  // Deliberately conservative: better to create a new module than mis-assign.
  function matchCertificationModule(courseName: string, modules: any[]): any | null {
    if (!courseName) return null;
    const courseNorm = normalizeModuleName(courseName);
    if (!courseNorm) return null;
    const courseAbbrev = extractAbbrev(courseName);
    const courseTokens = significantTokens(courseName);

    // 1) Exact normalized name match (parentheticals/punctuation ignored).
    let found = modules.find(m => normalizeModuleName(m.name) === courseNorm);
    if (found) return found;

    // 2) Abbreviation match (e.g. course text contains/equals the module's abbrev).
    if (courseAbbrev) {
      found = modules.find(m => extractAbbrev(m.name) === courseAbbrev);
      if (found) return found;
    }
    if (courseTokens.length === 1) {
      found = modules.find(m => extractAbbrev(m.name) === courseTokens[0]);
      if (found) return found;
    }

    // 3) Strong token overlap. Require at least 2 shared significant tokens and
    //    a high Jaccard similarity so single-word coincidences (e.g. "biosafety"
    //    matching "Animal Biosafety") do NOT produce a false positive.
    if (courseTokens.length > 0) {
      found = modules.find(m => {
        const mTokens = significantTokens(m.name);
        if (mTokens.length === 0) return false;
        const setM = new Set(mTokens);
        const shared = courseTokens.filter(t => setM.has(t));
        const union = new Set([...courseTokens, ...mTokens]).size;
        const jaccard = union > 0 ? shared.length / union : 0;
        return shared.length >= 2 && jaccard >= 0.6;
      });
      if (found) return found;
    }

    return null;
  }

  // Build a suggested abbreviation for a brand-new module from its course name.
  function suggestAbbreviation(courseName: string): string {
    const existing = extractAbbrev(courseName);
    if (existing) return existing.toUpperCase();
    // Initials of meaningful words (drop only articles/prepositions, keep nouns).
    const minimalStop = new Set(['the', 'of', 'and', 'for', 'with', 'a', 'an', 'to', 'in', 'on']);
    const words = normalizeModuleName(courseName).split(' ').filter(w => w && !minimalStop.has(w));
    let abbr = words.map(w => w[0].toUpperCase()).join('').slice(0, 6);
    if (abbr.length < 2) {
      abbr = (courseName || '').replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase();
    }
    return abbr;
  }

  // Whole months between two YYYY-MM-DD strings.
  function monthsBetween(start: string, end: string): number {
    const s = new Date(start);
    const e = new Date(end);
    if (isNaN(s.getTime()) || isNaN(e.getTime())) return 0;
    let months = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth());
    if (e.getDate() < s.getDate()) months -= 1;
    return months;
  }

  // Derive an expiration interval (months) for a new module from the cert dates,
  // snapping to common CITI renewal periods (1/2/3/4/5 years) when close.
  function suggestExpirationMonths(completionDate: string | null, expirationDate: string | null): number {
    if (!completionDate || !expirationDate) return 36;
    const m = monthsBetween(completionDate, expirationDate);
    if (m <= 0) return 36;
    const common = [12, 24, 36, 48, 60];
    let best = common[0];
    let bestDiff = Infinity;
    for (const c of common) {
      const d = Math.abs(c - m);
      if (d < bestDiff) { bestDiff = d; best = c; }
    }
    if (bestDiff <= 2) return best;
    return Math.max(12, Math.round(m / 12) * 12);
  }

  // Attach new-module suggestion fields when no existing module matched.
  function applyModuleSuggestions(result: any): void {
    if (result.module || !result.courseName) return;
    result.isNewModule = true;
    result.suggestedModuleName = result.courseName.trim().replace(/\s+/g, ' ');
    result.suggestedAbbreviation = suggestAbbreviation(result.courseName);
    result.suggestedExpirationMonths = suggestExpirationMonths(result.completionDate, result.expirationDate);
  }
  // ---------------------------------------------------------------------------

  // Helper function to parse CITI certificate text (router function)
  async function parseCITICertificate(text: string, modules: any[]) {
    const result: any = {
      name: null,
      courseName: null,
      module: null,
      completionDate: null,
      expirationDate: null,
      recordId: null,
      institution: null,
      isNewModule: false
    };

    try {
      log('=== PARSING CITI DOCUMENT ===', "routes");
      log('Raw text length', "routes", { detail: text.length });
      log('Raw text sample (first 300 chars)', "routes", { detail: text.substring(0, 300) });
      
      // DEBUG: Print full text to see actual OCR output structure
      log("Full OCR text", "routes", { length: text.length, text });

      // Detect document type and route to appropriate parser
      const documentType = detectCITIDocumentType(text);
      log('Detected document type', "routes", { detail: documentType });

      let parsedResult;
      switch (documentType) {
        case 'certificate':
          parsedResult = await parseCITICertificateFormat(text, modules);
          break;
        case 'report':
          parsedResult = await parseCITIReportFormat(text, modules);
          break;
        default:
          log('Unknown document type, trying certificate format as fallback', "routes");
          parsedResult = await parseCITICertificateFormat(text, modules);
      }

      // Add document type to the result
      return {
        ...parsedResult,
        documentType: documentType
      };
    } catch (error) {
      logError('Error parsing CITI document', "routes", error);
      return result;
    }
  }

  // Certificate format parser - for documents with "This is to certify that:"
  async function parseCITICertificateFormat(text: string, modules: any[]) {
    const result: any = {
      name: null,
      courseName: null,
      module: null,
      completionDate: null,
      expirationDate: null,
      recordId: null,
      institution: null,
      isNewModule: false
    };

    try {
      log('=== PARSING CERTIFICATE FORMAT ===', "routes");
      
      // Clean up text - remove extra whitespace and normalize
      const cleanText = text.replace(/\s+/g, ' ').trim();

      // Extract completion date - match multiple formats
      log('Searching for completion date...', "routes");
      const completionMatch = 
        // Format 1: "Completion Date: 21-May-2022" (with colon)
        text.match(/Completion Date:\s*(\d{1,2}-\w{3}-\d{4})/i) ||
        // Format 2: "Completion Date 15-Jul-2025" (no colon - new format)
        text.match(/Completion Date\s+(\d{1,2}-\w{3}-\d{4})/i) ||
        // Format 3: With bullet point
        text.match(/•\s*Completion Date:?\s*(\d{1,2}-\w{3}-\d{4})/i) ||
        // Format 4: Context-based search for completion dates
        text.match(/(\d{1,2}-\w{3}-20\d{2})/g)?.find(match => {
          const matchIndex = text.indexOf(match);
          const context = text.substring(Math.max(0, matchIndex - 100), matchIndex + 100);
          return /completion/i.test(context);
        });
      if (completionMatch) {
        // Formats 1-3 return a RegExpMatchArray (use captured group [1]); Format 4
        // returns a plain string from .find() — indexing it would grab single
        // characters, so use the whole string in that case.
        const dateStr = typeof completionMatch === 'string' ? completionMatch : (completionMatch[1] || completionMatch[0]);
        result.completionDate = convertDateFormat(dateStr);
        log('Found completion date', "routes", { detail: result.completionDate });
      } else {
        log('No completion date match found', "routes");
        log('Date search text sample', "routes", { detail: text.substring(0, 800) });
      }

      // Extract expiration date - match multiple formats  
      log('Searching for expiration date...', "routes");
      const expirationMatch = 
        // Format 1: "Expiration Date: 20-May-2025" (with colon)
        text.match(/Expiration Date:\s*(\d{1,2}-\w{3}-\d{4})/i) ||
        // Format 2: "Expiration Date 15-Jul-2028" (no colon - new format)
        text.match(/Expiration Date\s+(\d{1,2}-\w{3}-\d{4})/i) ||
        // Format 3: With bullet point  
        text.match(/•\s*Expiration Date:?\s*(\d{1,2}-\w{3}-\d{4})/i) ||
        // Format 4: Context-based search for expiration dates
        text.match(/(\d{1,2}-\w{3}-20\d{2})/g)?.find(match => {
          const matchIndex = text.indexOf(match);
          const context = text.substring(Math.max(0, matchIndex - 100), matchIndex + 100);
          return /expir/i.test(context);
        });
      if (expirationMatch) {
        // Formats 1-3 return a RegExpMatchArray (use captured group [1]); Format 4
        // returns a plain string from .find() — indexing it would grab single
        // characters, so use the whole string in that case.
        const dateStr = typeof expirationMatch === 'string' ? expirationMatch : (expirationMatch[1] || expirationMatch[0]);
        result.expirationDate = convertDateFormat(dateStr);
        log('Found expiration date', "routes", { detail: result.expirationDate });
      } else {
        log('No expiration date match found', "routes");
        log('Date search text sample', "routes", { detail: text.substring(0, 800) });
      }

      // Extract record ID - match "31911316" format with Record ID context
      log('Searching for record ID...', "routes");
      const recordIdMatch = text.match(/Record ID:\s*(\d+)/i) ||
                           text.match(/•\s*Record ID:\s*(\d+)/i) ||
                           text.match(/Record ID\s+(\d+)/i) ||
                           text.match(/(\d{8})/g)?.find(match => {
                             // Look for 8-digit number with Record ID context nearby
                             const matchIndex = text.indexOf(match);
                             const context = text.substring(Math.max(0, matchIndex - 50), matchIndex + 50);
                             return /record/i.test(context);
                           }) ||
                           cleanText.match(/Record ID:\s*(\d+)/i);
      if (recordIdMatch) {
        // Array matches expose the captured digits at [1]; Format 4's .find()
        // returns the plain matched string. Strip non-digits either way.
        const idStr = typeof recordIdMatch === 'string' ? recordIdMatch : (recordIdMatch[1] || recordIdMatch[0]);
        result.recordId = idStr.replace(/\D/g, ''); // Remove any non-digits
        log('Found record ID', "routes", { detail: result.recordId });
      } else {
        log('No record ID match found', "routes");
        log('ID search text sample', "routes", { detail: text.substring(0, 800) });
      }

      // Extract person name - improved patterns for CITI certificates
      log('Searching for person name...', "routes");
      // Look for "Name: Apryl Sanchez (ID: 8085848)" pattern - handle OCR mangled text
      let nameMatch = text.match(/([A-Z][a-z]+\s+[A-Z][a-z]+)\s*\(ID:\s*\d+\)/i) ||  // "Apryl Sanchez (ID: 8085848)"
                     text.match(/Name:\s*([A-Z][a-z]+\s+[A-Z][a-z]+)/i) ||            // "Name: Apryl Sanchez"
                     text.match(/•\s*Name:\s*([A-Z][a-z]+\s+[A-Z][a-z]+)/i) ||       // "• Name: Apryl Sanchez"
                     cleanText.match(/([A-Z][a-z]+\s+[A-Z][a-z]+)\s*\(ID:\s*\d+\)/i) || // Clean text version
                     text.match(/This is to certify that:\s*([A-Z][a-z]+\s+[A-Z][a-z]+)/i);

      // Fix for OCR mangled text - extract just the name part if we found a longer match
      if (nameMatch) {
        let extractedName = nameMatch[1].trim();
        // If the extracted name contains extra text, try to clean it
        const nameOnly = extractedName.match(/([A-Z][a-z]+\s+[A-Z][a-z]+)$/);
        if (nameOnly) {
          extractedName = nameOnly[1];
        }
        result.name = extractedName.replace(/\s+/g, ' ');
        log('Found name', "routes", { detail: result.name });
      } else {
        log('No name match found', "routes");
        log('Text being searched for name (first 500 chars)', "routes", { detail: text.substring(0, 500) });
      }

      // Extract course name - improved patterns for CITI courses  
      log('Searching for course name...', "routes");
      // Look for "Course: [Course Name]" or "CITI Program course: [Course Name]"
      let courseMatch = text.match(/Course:\s*([^\n\r]+?)(?:\s*Stage|$)/i) ||
                       text.match(/CITI Program course:\s*\n\s*([^\n]+)/i) ||
                       text.match(/CITI Program course:\s*([^\n\r]+)/i) ||
                       text.match(/following CITI[^:]*course:\s*([^\n\r]+)/i);
      
      if (!courseMatch) {
        // Try to extract Biosafety or other training series
        courseMatch = text.match(/([^.\n]*(?:Biosafety|Training Series)[^.\n]*)/i) ||
                     text.match(/Stage\s+\d+\s*-\s*([^\n\r]+)/i) ||
                     text.match(/CITI\s+([^(\n\r]+?)(?:\s*\(|$)/i);
      }

      if (courseMatch) {
        result.courseName = courseMatch[1].trim().replace(/\s+/g, ' ');
        log('Found course name', "routes", { detail: result.courseName });
        
        // Strict module matching (conservative — flags unknown courses as NEW).
        log('Module matching results', "routes");
        log('Course name to match', "routes", { detail: result.courseName });
        const module = matchCertificationModule(result.courseName, modules);

        result.module = module || null;
        result.isNewModule = !module;

        if (module) {
          log('Matched with existing module', "routes", { detail: module.name });
        } else {
          log('No matching module found — will suggest a new module from the course title', "routes");
        }
      } else {
        log('No course name match found', "routes");
        log('Text being searched for course (first 500 chars)', "routes", { detail: text.substring(0, 500) });
      }

      // Extract institution - improved pattern
      const institutionMatch = text.match(/Under requirements set by:\s*\n\s*([^\n]+)/i) ||
                              text.match(/requirements set by:\s*([^\n\r]+)/i);
      if (institutionMatch) {
        result.institution = institutionMatch[1].trim();
      }

    } catch (parseError) {
      logError('Error parsing certificate text', "routes", parseError);
    }

    // Look up scientist ID by name if name was extracted
    if (result.name) {
      try {
        log('Looking up scientist for name', "routes", { detail: result.name });
        const allScientists = await storage.getScientists();
        
        // Split extracted name into first and last name
        const nameParts = result.name.trim().split(/\s+/);
        if (nameParts.length >= 2) {
          const firstName = nameParts[0];
          const lastName = nameParts[nameParts.length - 1];
          
          // Find scientist by exact first/last name match
          const matchedScientist = allScientists.find(scientist => 
            scientist.firstName.toLowerCase() === firstName.toLowerCase() && 
            scientist.lastName.toLowerCase() === lastName.toLowerCase()
          );
          
          if (matchedScientist) {
            result.scientistId = matchedScientist.id;
            log(`Found scientist match: ${result.name} -> ID ${matchedScientist.id}`, "routes");
          } else {
            log(`No scientist found for name: ${result.name} (${firstName} ${lastName})`, "routes");
            result.scientistId = null;
          }
        }
      } catch (lookupError) {
        logError('Error looking up scientist', "routes", lookupError);
        result.scientistId = null;
      }
    }

    applyModuleSuggestions(result);
    return result;
  }

  // Report format parser - for documents with "COMPLETION REPORT"
  async function parseCITIReportFormat(text: string, modules: any[]) {
    const result: any = {
      name: null,
      courseName: null,
      module: null,
      completionDate: null,
      expirationDate: null,
      recordId: null,
      institution: null,
      isNewModule: false
    };

    try {
      log('=== PARSING REPORT FORMAT ===', "routes");
      
      // Clean up text - remove extra whitespace and normalize
      const cleanText = text.replace(/\s+/g, ' ').trim();

      // Report format specific patterns
      // Name extraction. CITI reports list the learner as "• Name: First Last (ID: 12345)".
      // Prefer that labeled form; fall back to the older heuristic patterns.
      log('Searching for person name in report format...', "routes");
      const nameMatch = text.match(/Name:\s*([A-Za-z][A-Za-z.'\-\s]+?)\s*\(ID:/i) ||
                       text.match(/Name:\s*([A-Za-z][A-Za-z.'\-\s]+?)(?:\s*\n|$)/i) ||
                       text.match(/Phone:\s*([A-Za-z\s]+?)(?:\s+\([^)]*\))?$/m) ||
                       text.match(/•\s*Phone:\s*.*?\n\s*([A-Za-z\s]+)/i) ||
                       text.match(/Institution Unit:\s*•\s*Phone:\s*(.+?)(?:\s|$)/i) ||
                       text.match(/([A-Za-z]+\s+[A-Za-z]+)(?:\s+\([^)]*\))?(?:\s*$)/m);
      
      if (nameMatch) {
        const rawName = nameMatch[1].trim();
        // Clean up the name - remove extra whitespace and validate
        if (rawName.length > 2 && rawName.length < 50 && /^[A-Za-z.'\-\s]+$/.test(rawName)) {
          result.name = rawName;
          log('Found name in report format', "routes", { detail: result.name });
        }
      }

      // Course name extraction. Reports identify the course via "Curriculum Group:".
      log('Searching for course name in report format...', "routes");
      const reportCourseMatch = text.match(/Curriculum Group:\s*([^\n•]+?)(?:\s*•|\n|$)/i) ||
                               text.match(/Course Learner Group:\s*([^\n•]+?)(?:\s*•|\n|$)/i) ||
                               text.match(/COURSEWORK REQUIREMENTS[\s\S]*?([A-Za-z][^•\n]+?)(?:\s*•|\s*$)/i) ||
                               text.match(/Course:\s*([^•\n]+)/i) ||
                               text.match(/Training[\s\S]*?-\s*([^•\n]+)/i);
      
      if (reportCourseMatch) {
        let courseName = reportCourseMatch[1].trim();
        // "Same as Curriculum Group" is a placeholder, not a real course name.
        if (/^same as/i.test(courseName)) {
          const curr = text.match(/Curriculum Group:\s*([^\n•]+?)(?:\s*•|\n|$)/i);
          if (curr) courseName = curr[1].trim();
        }
        result.courseName = courseName;
        log('Found course name in report format', "routes", { detail: result.courseName });
        
        // Strict module matching (conservative — flags unknown courses as NEW).
        const module = matchCertificationModule(result.courseName, modules);
        result.module = module || null;
        result.isNewModule = !module;
      }

      // Date extraction. Prefer the explicitly labeled completion/expiration dates;
      // fall back to positional (first/second date) only if labels are missing.
      log('Searching for dates in report format...', "routes");
      const completionLabel = text.match(/Completion Date:\s*(\d{1,2}-\w{3}-\d{4})/i);
      const expirationLabel = text.match(/Expiration Date:\s*(\d{1,2}-\w{3}-\d{4})/i);
      if (completionLabel) {
        result.completionDate = convertDateFormat(completionLabel[1]);
        log('Found completion date (labeled) in report format', "routes", { detail: result.completionDate });
      }
      if (expirationLabel) {
        result.expirationDate = convertDateFormat(expirationLabel[1]);
        log('Found expiration date (labeled) in report format', "routes", { detail: result.expirationDate });
      }
      if (!result.completionDate || !result.expirationDate) {
        const allDates = text.match(/(\d{1,2}-\w{3}-20\d{2})/g);
        if (allDates && allDates.length > 0) {
          if (!result.completionDate) {
            result.completionDate = convertDateFormat(allDates[0]);
            log('Found completion date (positional) in report format', "routes", { detail: result.completionDate });
          }
          if (!result.expirationDate && allDates.length > 1) {
            // Use the latest distinct date as expiration (module rows repeat the
            // completion date, so the largest year is the real expiration).
            const distinct = Array.from(new Set(allDates))
              .map((d) => convertDateFormat(d))
              .filter((d): d is string => !!d);
            const latest = distinct.sort((a, b) => a.localeCompare(b)).pop();
            if (latest && latest !== result.completionDate) {
              result.expirationDate = latest;
              log('Found expiration date (positional) in report format', "routes", { detail: result.expirationDate });
            }
          }
        }
      }

      // Record ID extraction. Prefer the labeled "Record ID:" value.
      log('Searching for record ID in report format...', "routes");
      const reportIdMatch = text.match(/Record ID:\s*(\d+)/i)?.[1] ||
                            text.match(/(\d{8})/g)?.find(match => match.length === 8);
      
      if (reportIdMatch) {
        result.recordId = reportIdMatch;
        log('Found record ID in report format', "routes", { detail: result.recordId });
      }

      // Institution extraction
      const institutionMatch = text.match(/Institution Affiliation:\s*([^\n\r•(]+)/i) ||
                               text.match(/Institution:\s*([^\n\r•]+)/i);
      if (institutionMatch) {
        result.institution = institutionMatch[1].trim();
      }

    } catch (parseError) {
      logError('Error parsing report format', "routes", parseError);
    }

    // Look up scientist ID by name if name was extracted (same logic as certificate format)
    if (result.name) {
      try {
        log('Looking up scientist for name', "routes", { detail: result.name });
        const allScientists = await storage.getScientists();
        
        // Split extracted name into first and last name
        const nameParts = result.name.trim().split(/\s+/);
        if (nameParts.length >= 2) {
          const firstName = nameParts[0];
          const lastName = nameParts[nameParts.length - 1];
          
          // Find scientist by exact first/last name match
          const matchedScientist = allScientists.find(scientist => 
            scientist.firstName.toLowerCase() === firstName.toLowerCase() && 
            scientist.lastName.toLowerCase() === lastName.toLowerCase()
          );
          
          if (matchedScientist) {
            result.scientistId = matchedScientist.id;
            log(`Found scientist match: ${result.name} -> ID ${matchedScientist.id}`, "routes");
          } else {
            log(`No scientist found for name: ${result.name} (${firstName} ${lastName})`, "routes");
            result.scientistId = null;
          }
        }
      } catch (lookupError) {
        logError('Error looking up scientist', "routes", lookupError);
        result.scientistId = null;
      }
    }

    applyModuleSuggestions(result);
    return result;
  }

  // Convert a CITI date like "05-Mar-2025" to ISO "2025-03-05". Returns null
  // for anything it can't parse into a real date, so a partial/garbage match
  // (e.g. just "04") never becomes a malformed string like "undefined-undefined-04"
  // that would crash the DATE column insert downstream.
  function convertDateFormat(dateStr: string): string | null {
    if (!dateStr || typeof dateStr !== 'string') return null;
    const s = dateStr.trim();

    // Already ISO (YYYY-MM-DD) — accept as-is.
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

    const months: { [key: string]: string } = {
      'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04',
      'May': '05', 'Jun': '06', 'Jul': '07', 'Aug': '08',
      'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12'
    };

    const parts = s.split('-');
    if (parts.length !== 3) return null;
    const [day, month, year] = parts;
    const mm = months[month];
    if (!mm || !/^\d{4}$/.test(year) || !/^\d{1,2}$/.test(day)) return null;
    return `${year}-${mm}-${day.padStart(2, '0')}`;
  }

  // Strict ISO YYYY-MM-DD validator used as a final guard before DB writes.
  // Verifies the calendar date is real (round-trips exactly), so values like
  // "2027-11-31" or "2024-02-30" are rejected rather than silently normalized.
  function isValidIsoDate(value: unknown): value is string {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [y, m, d] = value.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  }

  // Test endpoint for parsing certificate text (for debugging)
  app.post("/api/certificates/test-parse", async (req, res) => {
    try {
      const { sampleText } = req.body;
      if (!sampleText) {
        return res.status(400).json({ message: "Sample text is required" });
      }

      const modules = await storage.getCertificationModules();
      const parsedData = await parseCITICertificate(sampleText, modules);
      
      res.json({
        message: "Text parsing test completed",
        input: sampleText.substring(0, 200) + "...",
        parsed: parsedData
      });
    } catch (error) {
      logError("Error testing certificate parsing", "routes", error);
      res.status(500).json({ message: "Failed to test parsing" });
    }
  });

  // Certificate batch confirmation
  app.post("/api/certificates/confirm-batch", requireAuth, async (req: any, res) => {
    try {
      // uploaded_by is NOT NULL. The session user holds the identity in every
      // auth mode (demo/local/ldap/oidc); the old req.user.claims.sub path was
      // always undefined here, which made every certificate insert fail.
      const userId = req.session?.user?.scientistId ?? req.session?.user?.id ?? 1;
      const { certifications } = req.body;

      if (!certifications || !Array.isArray(certifications)) {
        return res.status(400).json({ message: "Certifications array is required" });
      }

      const results = [];
      for (const cert of certifications) {
        try {
          const {
            scientistId,
            startDate,
            endDate,
            certificateFilePath,
            reportFilePath,
            notes,
            newModule
          } = cert;
          let { moduleId } = cert;

          // First-use population: if the row carries a new-module request instead
          // of an existing moduleId, create it now (reusing an existing module with
          // the same name to avoid duplicates) and use the resulting id.
          if (!moduleId && newModule && typeof newModule.name === 'string' && newModule.name.trim()) {
            try {
              const desiredName = newModule.name.trim().replace(/\s+/g, ' ');
              const allModules = await storage.getCertificationModules();
              const existing = allModules.find(
                (m: any) => normalizeModuleName(m.name) === normalizeModuleName(desiredName)
              );
              if (existing) {
                moduleId = existing.id;
              } else {
                const created = await storage.createCertificationModule({
                  name: desiredName,
                  description: newModule.description?.trim() || null,
                  isCore: !!newModule.isCore,
                  expirationMonths: Number(newModule.expirationMonths) || 36,
                  isActive: true,
                });
                moduleId = created.id;
              }
            } catch (moduleErr: any) {
              results.push({
                ...cert,
                status: 'error',
                error: `Could not create new module: ${moduleErr?.message || 'unknown error'}`
              });
              continue;
            }
          }

          // Validate required fields
          if (!scientistId || !moduleId || !startDate || !endDate) {
            results.push({
              ...cert,
              status: 'error',
              error: `Missing required fields: ${!scientistId ? 'scientistId ' : ''}${!moduleId ? 'moduleId ' : ''}${!startDate ? 'startDate ' : ''}${!endDate ? 'endDate ' : ''}`
            });
            continue;
          }

          // Guard against malformed/partial dates (e.g. a bad OCR/parse that
          // produced "undefined-undefined-04"). The DATE column would otherwise
          // reject the whole insert with a raw SQL error.
          if (!isValidIsoDate(startDate) || !isValidIsoDate(endDate)) {
            results.push({
              ...cert,
              status: 'error',
              error: `Could not read the ${!isValidIsoDate(startDate) ? 'completion' : 'expiration'} date correctly. Please set it manually before saving.`
            });
            continue;
          }

          // Check for duplicate certificate (same scientist, module, and start date)
          const existingCertifications = await storage.getCertificationsByScientist(scientistId);
          const duplicateCert = existingCertifications.find(existing => 
            existing.moduleId === moduleId && 
            existing.startDate === startDate
          );
          
          if (duplicateCert) {
            results.push({
              ...cert,
              status: 'error',
              error: `Certificate already exists for this person and module with the same start date (${startDate}). Please check existing records.`
            });
            continue;
          }

          const certification = await storage.createCertification({
            scientistId,
            moduleId,
            startDate,
            endDate,
            certificateFilePath,
            reportFilePath,
            uploadedBy: userId,
            notes
          });

          results.push({
            ...cert,
            status: 'success',
            certificationId: certification.id
          });
        } catch (error: any) {
          results.push({
            ...cert,
            status: 'error',
            error: error?.message || 'Unknown error'
          });
        }
      }

      const successCount = results.filter(r => r.status === 'success').length;
      const errorCount = results.filter(r => r.status === 'error').length;

      // Update PDF import history entries with save status
      for (const cert of certifications) {
        const result = results.find(r => r.fileName === cert.fileName);
        let saveStatus = 'not_saved';
        
        if (result?.status === 'success') {
          saveStatus = 'saved';
        } else if (result?.error?.includes('already exists')) {
          saveStatus = 'duplicate';
        }
        
        try {
          await storage.updatePdfImportHistorySaveStatus(cert.fileName, saveStatus);
        } catch (error) {
          logError(`Failed to update save status for ${cert.fileName}`, "routes", error);
        }
      }

      res.json({
        message: `Processed ${results.length} certifications: ${successCount} successful, ${errorCount} failed`,
        results,
        summary: { total: results.length, successful: successCount, failed: errorCount }
      });
    } catch (error) {
      logError("Error confirming certifications", "routes", error);
      res.status(500).json({ message: "Failed to confirm certifications" });
    }
  });
}
