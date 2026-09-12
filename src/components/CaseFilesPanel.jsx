import { useState, useEffect, useRef } from "react";
import { Download, Paperclip, Upload } from "lucide-react";
import { supabase } from "../lib/supabase.js";
import { useT } from "../i18n/index.jsx";
import { useCaseDocuments } from "../hooks/useCoreHooks.js";
import { fmtDate } from "../lib/uiUtils.jsx";

const CF_ALLOWED_EXTS = ['pdf','doc','docx','xls','xlsx','ppt','pptx','png','jpg','jpeg','txt','csv'];
const CF_MAX_BYTES    = 10 * 1024 * 1024; // 10 MB

function cfFileIcon(mime) {
  if (!mime) return '📎';
  if (mime.startsWith('image/'))                          return '🖼';
  if (mime.includes('pdf') || mime.includes('word') || mime.startsWith('text/')) return '📄';
  if (mime.includes('excel') || mime.includes('spreadsheet') || mime.includes('csv')) return '📊';
  if (mime.includes('presentation') || mime.includes('powerpoint')) return '📊';
  return '📎';
}

function cfFmtSize(bytes) {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024)           return `${bytes} B`;
  if (bytes < 1024 * 1024)    return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function CaseFilesPanel({ caseId, auth, embedded = false }) {
  const { t }                             = useT();
  const [files, setFiles]                 = useState([]);
  const [loading, setLoading]             = useState(true);
  const [uploading, setUploading]         = useState({});   // { filename: true }
  const [sizeErrors, setSizeErrors]       = useState([]);
  const [fetchError, setFetchError]       = useState(null);
  const fileInputRef                      = useRef();

  async function fetchFiles() {
    setFetchError(null);
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('case_files')
        .select('*')
        .eq('case_id', caseId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setFiles(data ?? []);
    } catch (e) { setFetchError(e?.message ?? 'Failed to load'); }
    setLoading(false);
  }

  useEffect(() => { if (caseId) fetchFiles(); }, [caseId]);

  async function handleFileSelect(e) {
    const selected = Array.from(e.target.files ?? []);
    if (!selected.length) return;
    const errors = [];
    const valid  = selected.filter(f => {
      if (f.size > CF_MAX_BYTES) { errors.push(`${f.name}: ${t("files.size_error")}`); return false; }
      return true;
    });
    setSizeErrors(errors);
    for (const file of valid) {
      const ts   = Date.now();
      const path = `${caseId}/${auth.user.id}/${ts}-${file.name}`;
      setUploading(p => ({ ...p, [file.name]: true }));
      try {
        const { error: upErr } = await supabase.storage.from('case-files').upload(path, file);
        if (upErr) throw upErr;
        const { error: dbErr } = await supabase.from('case_files').insert({
          case_id:   caseId,
          user_id:   auth.user.id,
          file_name: file.name,
          file_path: path,
          file_size: file.size,
          mime_type: file.type || null,
        });
        if (dbErr) throw dbErr;
      } catch (err) { alert(`Upload failed: ${err.message}`); }
      setUploading(p => { const n = { ...p }; delete n[file.name]; return n; });
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
    await fetchFiles();
  }

  async function handleDownload(file) {
    try {
      const { data, error } = await supabase.storage
        .from('case-files').createSignedUrl(file.file_path, 3600);
      if (error) throw error;
      window.open(data.signedUrl, '_blank', 'noopener');
    } catch (e) { alert(`Download failed: ${e.message}`); }
  }

  async function handleDelete(file) {
    if (!window.confirm(`Delete "${file.file_name}"?`)) return;
    try {
      await supabase.storage.from('case-files').remove([file.file_path]);
      const { error } = await supabase.from('case_files').delete().eq('id', file.id);
      if (error) throw error;
      await fetchFiles();
    } catch (e) { alert(`Delete failed: ${e.message}`); }
  }

  const isUploading = Object.keys(uploading).length > 0;

  if (loading) return <Spinner />;

  return (
    <div className="space-y-4">
      {fetchError && <p className="text-sm text-red-500 p-3">{fetchError}</p>}
      {!embedded && (
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-gray-700">
            {files.length} file{files.length !== 1 ? 's' : ''}
          </div>
          <button onClick={() => fileInputRef.current?.click()}
            className="px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 flex items-center gap-1.5">
            <Upload className="w-3.5 h-3.5" />{t("files.upload")}
          </button>
        </div>
      )}
      {embedded && (
        <div className="flex justify-end">
          <button onClick={() => fileInputRef.current?.click()}
            className="px-3 py-1.5 bg-amber-500 text-white text-xs font-semibold rounded-lg hover:bg-amber-600 flex items-center gap-1.5">
            <Upload className="w-3.5 h-3.5" />{t("files.upload")}
          </button>
        </div>
      )}

      <input ref={fileInputRef} type="file" multiple className="hidden"
        accept={CF_ALLOWED_EXTS.map(e => `.${e}`).join(',')}
        onChange={handleFileSelect} />

      {sizeErrors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700 space-y-0.5">
          {sizeErrors.map((err, i) => <div key={i}>{err}</div>)}
        </div>
      )}

      {isUploading && (
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 space-y-1">
          {Object.keys(uploading).map(name => (
            <div key={name} className="flex items-center gap-2 text-sm text-blue-700">
              <div className="w-4 h-4 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin flex-shrink-0" />
              <span>{t("files.uploading")} <span className="font-medium">{name}</span></span>
            </div>
          ))}
        </div>
      )}

      {/* Drop / click zone — hidden when embedded inside a section */}
      {!embedded && (
        <div onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center cursor-pointer hover:border-blue-300 hover:bg-blue-50 transition-colors select-none">
          <div className="text-gray-400 text-sm">
            <Paperclip className="w-6 h-6 mx-auto mb-2 text-gray-300" />
            <div className="font-medium">{t("files.drop_hint")}</div>
            <div className="text-xs text-gray-300 mt-0.5">{t("files.max_size")}</div>
          </div>
        </div>
      )}

      {/* File list */}
      <div className="space-y-2">
        {files.map(file => (
          <div key={file.id}
            className="flex items-center gap-3 p-3 border border-gray-100 rounded-xl hover:bg-gray-50 transition-colors">
            <span className="text-xl flex-shrink-0 leading-none">{cfFileIcon(file.mime_type)}</span>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm text-gray-900 truncate">{file.file_name}</div>
              <div className="text-xs text-gray-400 mt-0.5">
                {cfFmtSize(file.file_size)}{file.file_size ? ' · ' : ''}
                {file.users?.full_name ?? '—'} · {fmtDate(file.created_at)}
              </div>
            </div>
            <button onClick={() => handleDownload(file)}
              className="text-xs text-blue-500 hover:text-blue-700 px-2 py-1 rounded border border-blue-100 hover:bg-blue-50 flex-shrink-0 flex items-center gap-1 transition-colors">
              <Download className="w-3 h-3" />{t("files.download")}
            </button>
            {(file.user_id === auth.user?.id || auth.isAdmin || auth.isManager) && (
              <button onClick={() => handleDelete(file)}
                className="text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded border border-red-100 hover:bg-red-50 flex-shrink-0 transition-colors">
                {t("files.delete")}
              </button>
            )}
          </div>
        ))}
        {files.length === 0 && (
          <div className={embedded ? "text-xs text-gray-400 py-2 pl-1" : "text-center py-10 text-gray-400"}>
            {embedded
              ? t("files.no_files")
              : <><div className="mb-2 flex justify-center"><Paperclip className="w-8 h-8 text-gray-300" /></div><p className="text-sm">{t("files.no_files")}</p></>
            }
          </div>
        )}
      </div>
    </div>
  );
}

export { CF_ALLOWED_EXTS, CF_MAX_BYTES, cfFileIcon, cfFmtSize, CaseFilesPanel };
