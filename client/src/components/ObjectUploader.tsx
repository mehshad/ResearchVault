import { useState, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Upload, FileText, X, CheckCircle, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ObjectUploaderProps {
  maxNumberOfFiles?: number;
  maxFileSize?: number;
  acceptedFileTypes?: string[];
  onComplete?: (uploadedFiles: Array<{ url: string; fileName: string; fileSize: number }>) => void;
  buttonClassName?: string;
  children?: ReactNode;
  showDropzone?: boolean;
  resetSignal?: number;
}

interface UploadedFile {
  file: File;
  url?: string;
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
  progress?: number;
}

/**
 * A file upload component with drag-and-drop functionality
 * Features:
 * - Drag and drop interface
 * - File validation
 * - Upload progress tracking
 * - Multiple file support
 */
export function ObjectUploader({
  maxNumberOfFiles = 10,
  maxFileSize = 10485760, // 10MB default
  acceptedFileTypes = ['application/pdf'],
  onComplete,
  buttonClassName,
  children,
  showDropzone = true,
  resetSignal,
}: ObjectUploaderProps) {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const { toast } = useToast();
  const pendingUploadsRef = useRef<Set<File>>(new Set());

  const validateFile = (file: File): string | null => {
    if (file.size > maxFileSize) {
      return `File size must be less than ${(maxFileSize / 1024 / 1024).toFixed(1)}MB`;
    }
    
    if (acceptedFileTypes.length > 0 && !acceptedFileTypes.includes(file.type)) {
      return `File type not supported. Accepted types: ${acceptedFileTypes.join(', ')}`;
    }
    
    return null;
  };

  // Handle uploads when new files are added
  useEffect(() => {
    const filesToUpload = uploadedFiles.filter(f => 
      f.status === 'pending' && !pendingUploadsRef.current.has(f.file)
    );

    if (filesToUpload.length > 0) {
      // Mark files as being processed
      filesToUpload.forEach(f => pendingUploadsRef.current.add(f.file));
      
      // Start uploads asynchronously
      filesToUpload.forEach(uploadFile => {
        uploadSingleFile(uploadFile).finally(() => {
          pendingUploadsRef.current.delete(uploadFile.file);
        });
      });
    }
  }, [uploadedFiles]);

  // Files already handed to onComplete. We track them so re-renders and
  // follow-up batches don't reprocess them, WITHOUT clearing the visible list
  // (the list stays until the parent resets us via resetSignal). This keeps
  // the uploaded files on screen through OCR processing and saving so it never
  // looks like the upload vanished / failed.
  const handedOffRef = useRef<Set<File>>(new Set());

  useEffect(() => {
    if (uploadedFiles.length === 0) {
      handedOffRef.current = new Set();
      return;
    }

    // Wait until every file has settled (success or error) before handing off.
    const allDone = uploadedFiles.every(f => f.status === 'success' || f.status === 'error');
    const newSuccessful = uploadedFiles.filter(
      f => f.status === 'success' && !handedOffRef.current.has(f.file)
    );

    if (allDone && newSuccessful.length > 0) {
      newSuccessful.forEach(f => handedOffRef.current.add(f.file));

      // Break out of React's render cycle.
      setTimeout(() => {
        onComplete?.(newSuccessful.map(f => ({
          url: f.url!,
          fileName: f.file.name,
          fileSize: f.file.size
        })));
      }, 0);
    }
  }, [uploadedFiles]); // Remove onComplete from deps to prevent loops

  // Parent-driven reset: clears the file list once a save attempt has settled
  // (succeeded or failed), so the list persists through the whole flow and only
  // disappears when the parent says the work is done.
  const isFirstResetRef = useRef(true);
  useEffect(() => {
    if (isFirstResetRef.current) {
      isFirstResetRef.current = false;
      return;
    }
    setUploadedFiles([]);
    handedOffRef.current = new Set();
  }, [resetSignal]);

  const handleFiles = (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    
    if (uploadedFiles.length + fileArray.length > maxNumberOfFiles) {
      toast({
        title: "Too many files",
        description: `Maximum ${maxNumberOfFiles} files allowed`,
        variant: "destructive",
      });
      return;
    }

    const newFiles: UploadedFile[] = [];
    
    for (const file of fileArray) {
      const error = validateFile(file);
      if (error) {
        toast({
          title: "File validation failed",
          description: `${file.name}: ${error}`,
          variant: "destructive",
        });
        continue;
      }
      
      newFiles.push({
        file,
        status: 'pending'
      });
    }

    if (newFiles.length > 0) {
      setUploadedFiles(prev => [...prev, ...newFiles]);
    }
  };

  const uploadSingleFile = async (uploadFile: UploadedFile) => {
    try {
      // Update status to uploading
      setUploadedFiles(prev => 
        prev.map(f => f.file === uploadFile.file ? { ...f, status: 'uploading' as const, progress: 0 } : f)
      );

      // Get upload URL from backend
      const uploadResponse = await fetch('/api/objects/upload', {
        method: 'POST'
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to get upload URL');
      }

      const { uploadURL, objectPath, finalizeToken } = await uploadResponse.json();

      // Upload file to object storage
      const uploadFileResponse = await fetch(uploadURL, {
        method: 'PUT',
        body: uploadFile.file,
        headers: {
          'Content-Type': uploadFile.file.type,
        },
      });

      if (!uploadFileResponse.ok) {
        throw new Error('Failed to upload file');
      }

      // Set ACL on the uploaded object (best-effort; non-fatal if it fails)
      if (objectPath) {
        await fetch('/api/uploads/finalize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ objectPath, finalizeToken }),
        }).catch(() => { /* ACL finalization failure is non-fatal */ });
      }

      // Update success status
      setUploadedFiles(prev => 
        prev.map(f => f.file === uploadFile.file ? 
          { ...f, status: 'success' as const, url: objectPath || uploadURL, progress: 100 } : f
        )
      );

      // Note: onComplete will be called by useEffect watching uploadedFiles

    } catch (error) {
      console.error('Upload error:', error);
      setUploadedFiles(prev => 
        prev.map(f => f.file === uploadFile.file ? 
          { ...f, status: 'error' as const, error: error instanceof Error ? error.message : 'Upload failed' } : f
        )
      );
    }
  };

  const removeFile = (file: File) => {
    setUploadedFiles(prev => prev.filter(f => f.file !== file));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    handleFiles(e.dataTransfer.files);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleFiles(e.target.files);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const getStatusIcon = (status: UploadedFile['status']) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'error':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      case 'uploading':
        return <div className="h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />;
      default:
        return <FileText className="h-4 w-4 text-gray-400 dark:text-gray-500" />;
    }
  };

  if (!showDropzone) {
    return (
      <div>
        <input
          type="file"
          accept={acceptedFileTypes.join(',')}
          multiple={maxNumberOfFiles > 1}
          onChange={handleFileInputChange}
          className="hidden"
          id="file-upload"
        />
        <label htmlFor="file-upload">
          <Button type="button" className={buttonClassName} asChild>
            <span>{children || "Upload Files"}</span>
          </Button>
        </label>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card
        className={`p-8 border-2 border-dashed transition-colors ${
          isDragOver ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40' : 'border-gray-300 dark:border-gray-700'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="text-center">
          <Upload className="h-12 w-12 mx-auto text-gray-400 dark:text-gray-500 mb-4" />
          <h3 className="text-lg font-medium mb-2">Upload Certificate Files</h3>
          <p className="text-gray-500 dark:text-gray-400 mb-4">
            Drag and drop PDF files here, or click to browse
          </p>
          
          <input
            type="file"
            accept={acceptedFileTypes.join(',')}
            multiple={maxNumberOfFiles > 1}
            onChange={handleFileInputChange}
            className="hidden"
            id="file-upload-dropzone"
          />
          
          <label htmlFor="file-upload-dropzone">
            <Button type="button" variant="outline" asChild>
              <span>Browse Files</span>
            </Button>
          </label>
          
          <div className="mt-4 text-sm text-gray-500 dark:text-gray-400">
            <p>Maximum {maxNumberOfFiles} files, {(maxFileSize / 1024 / 1024).toFixed(1)}MB each</p>
            <p>Supported formats: {acceptedFileTypes.map(type => type.split('/')[1]).join(', ')}</p>
          </div>
        </div>
      </Card>

      {uploadedFiles.length > 0 && (
        <div className="space-y-2">
          <h4 className="font-medium">Uploaded Files</h4>
          {uploadedFiles.map((uploadFile, index) => (
            <div key={index} className="flex items-center justify-between p-3 border rounded">
              <div className="flex items-center gap-3">
                {getStatusIcon(uploadFile.status)}
                <div>
                  <div className="font-medium text-sm">{uploadFile.file.name}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {formatFileSize(uploadFile.file.size)}
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                {uploadFile.status === 'error' && uploadFile.error && (
                  <span className="text-xs text-red-500">{uploadFile.error}</span>
                )}
                
                {uploadFile.status === 'uploading' && uploadFile.progress !== undefined && (
                  <div className="w-20 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div 
                      className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${uploadFile.progress}%` }}
                    />
                  </div>
                )}
                
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeFile(uploadFile.file)}
                  disabled={uploadFile.status === 'uploading'}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}