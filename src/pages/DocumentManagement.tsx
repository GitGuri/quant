import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Plus,
  Search,
  Edit,
  Trash2,
  Loader2,
  Download,
  Upload,
  ScanEye,
  Eye,
  File as FileIcon,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Header } from '@/components/layout/Header';
import { motion } from 'framer-motion';
import { useAuth } from '../AuthPage';
import { format } from 'date-fns';

// Update the Document interface to match your database schema
interface Document {
  id: string;
  original_name: string;
  file_path: string;
  upload_date: string;
  type: string; // Add this new property
}

// Interface for the document form when editing metadata
interface DocumentFormData {
  original_name: string;
  type: string; // Add this new property
}

// API_BASE_URL to connect to your backend
const API_BASE_URL = 'https://quantnow-cu1v.onrender.com';

function DocumentForm({ document, onSave, onCancel }: any) {
  const [formData, setFormData] = useState<DocumentFormData>({
    original_name: document?.original_name || '',
    type: document?.type || '',
  });

  useEffect(() => {
    setFormData({
      original_name: document?.original_name || '',
      type: document?.type || '',
    });
  }, [document]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <DialogDescription className="sr-only">
        {document ? 'Edit an existing document.' : 'Add a new document.'}
      </DialogDescription>
      <div>
        <Label htmlFor="original_name">Document Name *</Label>
        <Input
          id="original_name"
          value={formData.original_name}
          onChange={(e) =>
            setFormData({ ...formData, original_name: e.target.value })
          }
          required
        />
      </div>
      <div>
        <Label htmlFor="type">Document Type *</Label>
        <Input
          id="type"
          value={formData.type}
          onChange={(e) =>
            setFormData({ ...formData, type: e.target.value })
          }
          required
        />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">
          {document ? 'Update' : 'Add'} Document
        </Button>
      </DialogFooter>
    </form>
  );
}

// Main DocumentManagement Component
export function DocumentManagement() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingDocument, setEditingDocument] = useState<Document | undefined>();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

   const token = localStorage.getItem('token'); // Get the authentication token
  const { toast } = useToast();

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Function to fetch documents from the backend
  const fetchDocuments = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/documents`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch documents');
      }

      const data = await response.json();
      setDocuments(data);
    } catch (err: any) {
      console.error('Error fetching documents:', err);
      setError(err.message || 'Failed to load documents.');
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  // Fetch documents on component mount
  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const handleSaveDocument = useCallback(
    async (formData: DocumentFormData, file?: File | null) => {
      if (!token) {
        toast({ title: 'Authentication error', description: 'Please log in again.', variant: 'destructive' });
        return;
      }

      // If there's no file and we're adding, we can't save.
      if (!file && !editingDocument) {
        toast({ title: 'No File Selected', description: 'Please select a file to upload.', variant: 'destructive' });
        return;
      }
      
      const isEditing = !!editingDocument;

      setIsLoading(true);
      setError(null);

      try {
        if (isEditing) {
          // New PATCH request to update document metadata
          const response = await fetch(`${API_BASE_URL}/documents/${editingDocument.id}`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify(formData),
          });

          if (!response.ok) {
            throw new Error('Failed to update document metadata.');
          }
          toast({ title: 'Document updated successfully' });
        } else {
          // Add new document
          const formDataToUpload = new FormData();
          formDataToUpload.append('document', file as Blob);

          const response = await fetch(`${API_BASE_URL}/upload-document`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
            },
            body: formDataToUpload,
          });

          if (!response.ok) {
            throw new Error('Failed to upload document');
          }

          toast({ title: 'Document uploaded successfully' });
        }
        
        setShowForm(false);
        setEditingDocument(undefined);
        setSelectedFile(null); // Clear selected file after saving
        setFilePreviewUrl(null); // Clear preview
        if (fileInputRef.current) {
          fileInputRef.current.value = ''; // Clear file input
        }

        // Re-fetch the documents list to show the new one
        fetchDocuments();
      } catch (err: any) {
        console.error('Error saving document:', err);
        setError(err.message || 'Failed to save document.');
        toast({ title: 'Failed to save document', description: err.message, variant: 'destructive' });
      } finally {
        setIsLoading(false);
      }
    },
    [editingDocument, fetchDocuments, toast, token]
  );

  const handleDeleteDocument = useCallback(
    async (documentId: string) => {
      if (!token) return;
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(`${API_BASE_URL}/documents/${documentId}`, {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error('Failed to delete document');
        }

        toast({ title: 'Document deleted successfully' });
        fetchDocuments(); // Re-fetch the list to show the change
      } catch (err: any) {
        console.error('Error deleting document:', err);
        setError(err.message || 'Failed to delete document.');
        toast({ title: 'Failed to delete document', description: err.message, variant: 'destructive' });
      } finally {
        setIsLoading(false);
      }
    },
    [fetchDocuments, toast, token]
  );

  // ADDED: New function to handle the download request
  const handleDownloadDocument = useCallback(
    async (documentId: string) => {
      if (!token) {
        toast({
          title: 'Authentication error',
          description: 'Please log in again.',
          variant: 'destructive',
        });
        return;
      }
      try {
        const response = await fetch(`${API_BASE_URL}/documents/${documentId}/download`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error('Failed to get download link.');
        }

        window.open(response.url, '_blank');

      } catch (err: any) {
        console.error('Error during download:', err);
        toast({
          title: 'Download Failed',
          description: err.message || 'Could not download the document.',
          variant: 'destructive',
        });
      }
    },
    [token, toast]
  );
  
  const handleEditDocument = (document: Document) => {
    setEditingDocument(document);
    setShowForm(true);
  };
  
  const handleAddDocument = () => {
    setEditingDocument(undefined);
    setShowForm(true);
  };

  const filteredDocuments = documents.filter((doc) =>
    doc.original_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files ? event.target.files[0] : null;
    if (file) {
      setSelectedFile(file);
      // Create a URL for a simple image preview if it's an image
      if (file.type.startsWith('image/')) {
        setFilePreviewUrl(URL.createObjectURL(file));
      } else {
        setFilePreviewUrl(null);
      }
    } else {
      setSelectedFile(null);
      setFilePreviewUrl(null);
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.classList.remove('border-blue-500', 'bg-blue-50');
    const file = event.dataTransfer.files ? event.dataTransfer.files[0] : null;
    if (file) {
      setSelectedFile(file);
      if (file.type.startsWith('image/')) {
        setFilePreviewUrl(URL.createObjectURL(file));
      } else {
        setFilePreviewUrl(null);
      }
    } else {
      setSelectedFile(null);
      setFilePreviewUrl(null);
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.classList.add('border-blue-500', 'bg-blue-50');
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.currentTarget.classList.remove('border-blue-500', 'bg-blue-50');
  };

  const handlePreviewDocument = () => {
    if (!selectedFile) {
      toast({
        title: 'No File Selected',
        description: 'Please select a file to preview.',
        variant: 'destructive',
      });
      return;
    }

    if (filePreviewUrl) {
      window.open(filePreviewUrl, '_blank');
    } else {
      toast({
        title: 'Preview Not Available',
        description:
          'Only image previews are supported in this demo.',
        variant: 'default',
      });
    }
  };

  return (
    <div className="flex-1 bg-white p-4 md:p-6 lg:p-8">
      <Header title="Document Management">
        <Dialog open={showForm} onOpenChange={setShowForm}>
          <DialogTrigger asChild>
            <Button onClick={handleAddDocument}>
              <Plus className="h-4 w-4 mr-2" />
              Add Document
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {editingDocument ? 'Edit Document' : 'Add New Document'}
              </DialogTitle>
            </DialogHeader>
            <DocumentForm
              document={editingDocument}
              onSave={handleSaveDocument}
              onCancel={() => setShowForm(false)}
            />
          </DialogContent>
        </Dialog>
      </Header>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="space-y-4 mt-4"
      >
        <Card className="flex flex-col">
          <CardContent className="space-y-4 flex-1 flex flex-col p-4">
            {/* Search Input */}
            <div className="flex items-center gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search documents..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            {/* Drag and Drop / Upload Section */}
            <div
              className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center bg-gray-50 hover:bg-gray-100 transition duration-300 ease-in-out transform hover:scale-[1.01] cursor-pointer relative"
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()} // Click to open file dialog
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                className="hidden"
              />
              <Upload className="mx-auto h-12 w-12 text-gray-400" />
              <p className="mt-2 text-sm text-gray-600">
                Drag and drop files here, or{' '}
                <span className="text-blue-600 font-medium">
                  click to browse
                </span>
              </p>
              <p className="mt-1 text-xs text-gray-500">
                PDF, Images (JPG, PNG)
              </p>
              {selectedFile && (
                <p className="mt-2 text-sm text-gray-700 flex items-center justify-center">
                  <FileIcon className="h-4 w-4 mr-2" /> Selected file:{' '}
                  <span className="font-semibold ml-1">
                    {selectedFile.name}
                  </span>
                </p>
              )}
            </div>

            {/* Action Buttons for Uploaded/Scanned Document */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <Button
                onClick={handlePreviewDocument}
                variant="outline"
                className="w-full"
                disabled={!selectedFile}
              >
                <Eye className="h-4 w-4 mr-2" /> Preview Document
              </Button>
              <Button
                onClick={() => {
                  if (selectedFile) {
                    // Quick add now uses the new API save handler
                    handleSaveDocument({ original_name: selectedFile.name, type: selectedFile.type }, selectedFile);
                  } else {
                    toast({
                      title: 'No file selected',
                      description: 'Please select a file to quick upload.',
                      variant: 'destructive',
                    });
                  }
                }}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                disabled={!selectedFile}
              >
                {isLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4 mr-2" />
                )}
                Quick Add Document
              </Button>
            </div>

            {/* Document Table */}
            {isLoading ? (
              <div className="flex justify-center items-center flex-1">
                <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
                <span className="ml-2 text-gray-600">
                  Loading documents...
                </span>
              </div>
            ) : error ? (
              <div className="text-center text-red-500 p-4 border border-red-300 rounded-md flex-1 flex flex-col justify-center items-center">
                <p>Error: {error}</p>
                <Button onClick={fetchDocuments} className="mt-2">
                  Retry
                </Button>
              </div>
            ) : (
              <div className="border rounded-lg overflow-auto flex-1">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Upload Date</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredDocuments.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={4}
                          className="text-center py-4 text-muted-foreground"
                        >
                          No documents found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredDocuments.map((doc) => (
                        <TableRow key={doc.id}>
                          <TableCell className="font-medium">
                            {doc.original_name}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{doc.type}</Badge>
                          </TableCell>
                          <TableCell>
                            {format(new Date(doc.upload_date), 'PPP')}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {/* Corrected Download Button */}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDownloadDocument(doc.id)}
                              >
                                <Download className="h-4 w-4" />
                              </Button>

                              {/* Edit Button */}
                              <Dialog>
                                <DialogTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleEditDocument(doc)}
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                </DialogTrigger>
                                <DialogContent className="max-w-2xl">
                                  <DialogHeader>
                                    <DialogTitle>Edit Document</DialogTitle>
                                  </DialogHeader>
                                  <DocumentForm
                                    document={doc}
                                    onSave={(formData: DocumentFormData) =>
                                      handleSaveDocument(formData)
                                    }
                                    onCancel={() => setShowForm(false)}
                                  />
                                </DialogContent>
                              </Dialog>

                              {/* Delete Button with Confirmation */}
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="ghost" size="sm">
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>
                                      Delete Document
                                    </AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Are you sure you want to delete "
                                      {doc.original_name}"? This action cannot
                                      be undone.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>
                                      Cancel
                                    </AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => handleDeleteDocument(doc.id)}
                                    >
                                      Delete
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}