import NavHeader from "@/components/nav-header";
import FileUploadTest from "@/components/file-upload-test";

export default function UploadTestPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <NavHeader />
      
      <main className="container mx-auto py-6 px-4">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Supabase Storage Upload Test</h1>
        </div>
        
        <p className="mb-6 text-muted-foreground">
          This page demonstrates direct file uploads to Supabase Storage using the client-side SDK.
        </p>
        
        <div className="max-w-md mx-auto">
          <FileUploadTest />
        </div>
      </main>
    </div>
  );
}