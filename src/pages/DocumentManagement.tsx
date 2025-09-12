// src/pages/DocumentManagement.tsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Plus, Search, Edit, Trash2, Loader2, Download, Upload, Eye, File as FileIcon,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Header } from '@/components/layout/Header';
import { motion } from 'framer-motion';
import { format } from 'date-fns';

// ====== Types ======
type DocKind = 'financial' | 'transaction' | 'general';

interface Document {
  id: string;
  original_name: string;
  file_path: string;
  upload_date: string;
  type: DocKind;
  expiry_date?: string | null; // YYYY-MM-DD
  items?: Array<{ label: string; qty?: number; amount?: number }>;
  remind_before_days?: number | null;
}

interface DocumentFormData {
  original_name: string;
  type: DocKind;
  expiry_date?: string | null;
  items?: Array<{ label: string; qty?: number; amount?: number }>;
  remind_before_days?: number | null;
}

// ====== Config ======
const API_BASE_URL = 'https://quantnow.onrender.com';

// ====== Form Component ======
function DocumentForm({
  document,
  onSave,
  onCancel,
}: {
  document?: Document;
  onSave: (data: DocumentFormData, file?: File | null) => void;
  onCancel: () => void;
}) {
  const [formData, setFormData] = useState<DocumentFormData>({
    original_name: document?.original_name || '',
    type: (document?.type as DocKind) || 'general',
    expiry_date: document?.expiry_date || '',
    items: (Array.isArray(document?.items) ? document?.items : []) || [],
    remind_before_days: document?.remind_before_days ?? null,
  });

  useEffect(() => {
    setFormData({
      original_name: document?.original_name || '',
      type: (document?.type as DocKind) || 'general',
      expiry_date: document?.expiry_date || '',
      items: (Array.isArray(document?.items) ? document?.items : []) || [],
      remind_before_days: document?.remind_before_days ?? null,
    });
  }, [document]);

  const addItem = () =>
    setFormData((p) => ({
      ...p,
      items: [...(p.items || []), { label: '', qty: 1, amount: 0 }],
    }));

  const updateItem = (i: number, field: 'label' | 'qty' | 'amount', val: string) =>
    setFormData((p) => {
      const items = [...(p.items || [])];
      const parsed = field === 'qty' || field === 'amount' ? Number(val) : val;
      items[i] = { ...items[i], [field]: parsed };
      return { ...p, items };
    });

  const removeItem = (i: number) =>
    setFormData((p) => ({
      ...p,
      items: (p.items || []).filter((_, idx) => idx !== i),
    }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      ...formData,
      expiry_date: formData.expiry_date ? formData.expiry_date : null,
      remind_before_days:
        formData.remind_before_days !== null && formData.remind_before_days !== undefined
          ? Number(formData.remind_before_days)
          : null,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <DialogDescription className="sr-only">
        {document ? 'Edit document.' : 'Add new document.'}
      </DialogDescription>

      <div>
        <Label htmlFor="original_name">Document Name *</Label>
        <Input
          id="original_name"
          value={formData.original_name}
          onChange={(e) => setFormData({ ...formData, original_name: e.target.value })}
          required
        />
      </div>

      <div>
        <Label htmlFor="type">Document Type *</Label>
        <select
          id="type"
          className="w-full border rounded-md h-9 px-3"
          value={formData.type}
          onChange={(e) => setFormData({ ...formData, type: e.target.value as DocKind })}
          required
        >
          <option value="financial">Financial</option>
          <option value="transaction">Transaction</option>
          <option value="general">General</option>
        </select>
      </div>

      <div>
        <Label htmlFor="expiry_date">Expiry Date (optional)</Label>
        <Input
          id="expiry_date"
          type="date"
          value={formData.expiry_date || ''}
          onChange={(e) => setFormData({ ...formData, expiry_date: e.target.value })}
        />
        <div className="text-xs text-muted-foreground mt-1">
          We’ll flag this as expiring/expired in the list. You can also set a reminder below.
        </div>
      </div>

      
      <div>
        <Label htmlFor="remind_before_days">Reminder (days before expiry)</Label>
        <Input
          id="remind_before_days"
          type="number"
          min={0}
          placeholder="e.g. 7"
          value={formData.remind_before_days ?? ''}
          onChange={(e) =>
            setFormData({
              ...formData,
              remind_before_days: e.target.value === '' ? null : Number(e.target.value),
            })
          }
        />
        <div className="text-xs text-muted-foreground mt-1">
          If set, the server can schedule a notification this many days before the expiry date.
        </div>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">{document ? 'Update' : 'Add'} Document</Button>
      </DialogFooter>
    </form>
  );
}

// ====== Row Actions (isolates per-row dialog open state) ======
function RowActions({
  doc,
  onDownload,
  onDelete,
  onSave,
}: {
  doc: Document;
  onDownload: (id: string) => void;
  onDelete: (id: string) => void;
  onSave: (data: DocumentFormData) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex items-center gap-2">
      {/* Download */}
      <Button variant="ghost" size="sm" onClick={() => onDownload(doc.id)}>
        <Download className="h-4 w-4" />
      </Button>

      {/* Edit */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
            <Edit className="h-4 w-4" />
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Document</DialogTitle>
          </DialogHeader>
          <DocumentForm
            document={doc}
            onSave={async (formData) => {
              await onSave(formData);
              setOpen(false);
            }}
            onCancel={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Delete */}
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="ghost" size="sm">
            <Trash2 className="h-4 w-4" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Document</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{doc.original_name}&quot;? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => onDelete(doc.id)}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ====== Main Component ======
export function DocumentManagement() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | DocKind>('all');

  const [showForm, setShowForm] = useState(false);
  const [editingDocument, setEditingDocument] = useState<Document | undefined>();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const { toast } = useToast();

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [quickType, setQuickType] = useState<DocKind>('general');

  // ====== Data helpers ======
  const fetchDocuments = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/documents`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Failed to fetch documents');
      const data = (await response.json()) as Document[];
      setDocuments(
        data.map((d) => ({
          ...d,
          items: Array.isArray(d.items) ? d.items : (d.items ? [d.items as any] : []), // normalize
        }))
      );
    } catch (err: any) {
      console.error('Error fetching documents:', err);
      setError(err.message || 'Failed to load documents.');
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  // revoke object url on change/unmount
  useEffect(() => {
    return () => {
      if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
    };
  }, [filePreviewUrl]);

  const handleSaveDocument = useCallback(
    async (formData: DocumentFormData, file?: File | null) => {
      if (!token) {
        toast({ title: 'Authentication error', description: 'Please log in again.', variant: 'destructive' });
        return;
      }

      const isEditing = !!editingDocument;
      setIsLoading(true);
      setError(null);

      try {
        if (isEditing) {
          const response = await fetch(`${API_BASE_URL}/documents/${editingDocument!.id}`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              original_name: formData.original_name,
              type: formData.type,
              expiry_date: formData.expiry_date || null,
              items: formData.items || [],
              remind_before_days: formData.remind_before_days ?? null,
            }),
          });
          if (!response.ok) throw new Error('Failed to update document metadata.');
          toast({ title: 'Document updated successfully' });
        } else {
          if (!file) {
            toast({ title: 'No File Selected', description: 'Please select a file to upload.', variant: 'destructive' });
            setIsLoading(false);
            return;
          }
          const fd = new FormData();
          fd.append('document', file);
          fd.append('original_name', formData.original_name);
          fd.append('type', formData.type);
          if (formData.expiry_date) fd.append('expiry_date', formData.expiry_date);
          if (formData.items && formData.items.length) fd.append('items', JSON.stringify(formData.items));
          if (formData.remind_before_days !== null && formData.remind_before_days !== undefined) {
            fd.append('remind_before_days', String(formData.remind_before_days));
          }

          const response = await fetch(`${API_BASE_URL}/upload-document`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: fd,
          });
          if (!response.ok) {
            const t = await response.text().catch(() => '');
            throw new Error(t || 'Failed to upload document');
          }
          toast({ title: 'Document uploaded successfully' });
        }

        setShowForm(false);
        setEditingDocument(undefined);
        setSelectedFile(null);
        if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
        setFilePreviewUrl(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
        fetchDocuments();
      } catch (err: any) {
        console.error('Error saving document:', err);
        setError(err.message || 'Failed to save document.');
        toast({ title: 'Failed to save document', description: err.message, variant: 'destructive' });
      } finally {
        setIsLoading(false);
      }
    },
    [editingDocument, fetchDocuments, toast, token, filePreviewUrl]
  );

  const handleDeleteDocument = useCallback(
    async (documentId: string) => {
      if (!token) return;
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(`${API_BASE_URL}/documents/${documentId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) throw new Error('Failed to delete document');
        toast({ title: 'Document deleted successfully' });
        fetchDocuments();
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

  const handleDownloadDocument = useCallback(
    async (documentId: string) => {
      if (!token) {
        toast({ title: 'Authentication error', description: 'Please log in again.', variant: 'destructive' });
        return;
      }
      try {
        const response = await fetch(`${API_BASE_URL}/documents/${documentId}/download`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) throw new Error('Failed to get download link.');
        window.open(response.url, '_blank');
      } catch (err: any) {
        console.error('Error during download:', err);
        toast({ title: 'Download Failed', description: err.message || 'Could not download the document.', variant: 'destructive' });
      }
    },
    [token, toast]
  );

  // ====== Upload UI ======
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files ? event.target.files[0] : null;
    if (file) {
      setSelectedFile(file);
      if (file.type.startsWith('image/')) {
        if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
        setFilePreviewUrl(URL.createObjectURL(file));
      } else {
        if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
        setFilePreviewUrl(null);
      }
    } else {
      setSelectedFile(null);
      if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
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
        if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
        setFilePreviewUrl(URL.createObjectURL(file));
      } else {
        if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
        setFilePreviewUrl(null);
      }
    } else {
      setSelectedFile(null);
      if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
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
      toast({ title: 'No File Selected', description: 'Please select a file to preview.', variant: 'destructive' });
      return;
    }
    if (filePreviewUrl) {
      window.open(filePreviewUrl, '_blank');
    } else {
      toast({ title: 'Preview Not Available', description: 'Only image previews are supported here.', variant: 'default' });
    }
  };

  // ====== Derived ======
  const filteredDocuments = documents
    .filter((doc) => doc.original_name.toLowerCase().includes(searchTerm.toLowerCase()))
    .filter((doc) => (typeFilter === 'all' ? true : doc.type === typeFilter));

  // ====== Render ======
  return (
    <div className="flex-1 bg-white p-4 md:p-6 lg:p-8">
      <Header title="Document Management">
        <Dialog open={showForm} onOpenChange={setShowForm}>
          <DialogTrigger asChild>
            <Button onClick={() => { setEditingDocument(undefined); setShowForm(true); }}>
              <Plus className="h-4 w-4 mr-2" />
              Add Document
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingDocument ? 'Edit Document' : 'Add New Document'}</DialogTitle>
            </DialogHeader>
            <DocumentForm
              document={editingDocument}
              onSave={handleSaveDocument}
              onCancel={() => setShowForm(false)}
            />
          </DialogContent>
        </Dialog>
      </Header>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }} className="space-y-4 mt-4">
        <Card className="flex flex-col">
          <CardContent className="space-y-4 flex-1 flex flex-col p-4">
            {/* Search + Filter */}
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
              <div className="flex gap-2">
                {(['all', 'financial', 'transaction', 'general'] as const).map((t) => (
                  <Button
                    key={t}
                    size="sm"
                    variant={typeFilter === t ? 'default' : 'outline'}
                    onClick={() => setTypeFilter(t)}
                  >
                    {t[0].toUpperCase() + t.slice(1)}
                  </Button>
                ))}
              </div>
            </div>

            {/* Drag & Drop */}
            <div
              className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center bg-gray-50 hover:bg-gray-100 transition duration-300 ease-in-out transform hover:scale-[1.01] cursor-pointer relative"
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
            >
              <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
              <Upload className="mx-auto h-12 w-12 text-gray-400" />
              <p className="mt-2 text-sm text-gray-600">
                Drag and drop files here, or <span className="text-blue-600 font-medium">click to browse</span>
              </p>
              <p className="mt-1 text-xs text-gray-500">PDF, Images (JPG, PNG)</p>
              {selectedFile && (
                <p className="mt-2 text-sm text-gray-700 flex items-center justify-center">
                  <FileIcon className="h-4 w-4 mr-2" /> Selected file:{' '}
                  <span className="font-semibold ml-1">{selectedFile.name}</span>
                </p>
              )}
            </div>

            {/* Actions (Preview / Quick Add) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-center">
              <Button onClick={handlePreviewDocument} variant="outline" className="w-full" disabled={!selectedFile}>
                <Eye className="h-4 w-4 mr-2" /> Preview Document
              </Button>

              {/* Quick type select */}
              <div className="flex items-center gap-2">
                <Label className="whitespace-nowrap">Quick type</Label>
                <select
                  className="border rounded-md h-9 px-2 flex-1"
                  value={quickType}
                  onChange={(e) => setQuickType(e.target.value as DocKind)}
                >
                  <option value="financial">Financial</option>
                  <option value="transaction">Transaction</option>
                  <option value="general">General</option>
                </select>
              </div>

              <Button
                onClick={() => {
                  if (!selectedFile) {
                    return toast({ title: 'No file selected', description: 'Please select a file to quick upload.', variant: 'destructive' });
                  }
                  handleSaveDocument(
                    {
                      original_name: selectedFile.name,
                      type: quickType,
                      expiry_date: null,
                      items: [],
                      remind_before_days: null,
                    },
                    selectedFile
                  );
                }}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                disabled={!selectedFile}
              >
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                Quick Add Document
              </Button>
            </div>

            {/* Table */}
            {isLoading ? (
              <div className="flex justify-center items-center flex-1">
                <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
                <span className="ml-2 text-gray-600">Loading documents...</span>
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
                      <TableHead>Expiry</TableHead>
                      
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredDocuments.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-4 text-muted-foreground">
                          No documents found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredDocuments.map((doc) => (
                        <TableRow key={doc.id}>
                          <TableCell className="font-medium">{doc.original_name}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{doc.type}</Badge>
                          </TableCell>
                          <TableCell>{format(new Date(doc.upload_date), 'PPP')}</TableCell>
                          <TableCell>
                            {doc.expiry_date ? (
                              (() => {
                                const today = new Date(); today.setHours(0,0,0,0);
                                const exp = new Date(doc.expiry_date as string); exp.setHours(0,0,0,0);
                                const days = Math.round((+exp - +today) / 86400000);
                                const label =
                                  days < 0 ? `Expired ${Math.abs(days)}d ago` :
                                  days === 0 ? 'Expires today' :
                                  `In ${days}d`;
                                const variant =
                                  days < 0 ? 'destructive' :
                                  days <= 7 ? 'default' : 'outline';
                                return <Badge variant={variant}>{label}</Badge>;
                              })()
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>

                          <TableCell>
                            <RowActions
                              doc={doc}
                              onDownload={handleDownloadDocument}
                              onDelete={handleDeleteDocument}
                              onSave={async (data) => {
                                // wire into same save; set current editing doc for PATCH
                                setEditingDocument(doc);
                                await handleSaveDocument(data);
                              }}
                            />
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

export default DocumentManagement;
