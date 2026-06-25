export interface TeamDocument {
  id?: string;
  teamId: string;
  clubId: string;
  name: string;           // display name (original filename)
  fileType: string;       // MIME type
  fileSize: number;       // bytes
  url: string;            // Firebase Storage download URL
  storagePath: string;    // path used for deletion
  uploadedBy: string;     // userId
  uploadedByName: string;
  createdAt: string;      // ISO timestamp
}
