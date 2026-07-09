import React, { useEffect, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'

interface FileUploaderProps {
  files?: File[]; 
  onFilesChange: (files: File[]) => void;
  existingFiles?: any[]; 
}

// CONFIUGRATION DE LA LIMITE À 50 MO
const MAX_FILE_SIZE = 50 * 1024 * 1024; 

const FileUploader: React.FC<FileUploaderProps> = ({ files = [], onFilesChange, existingFiles = [] }) => {
  const { t } = useTranslation()
  const [isDragging, setIsDragging] = useState<boolean>(false)

  // SÉCURITÉ : Vérification de la taille + Blocage des doublons (Ctrl+V)
  const addFilesWithCheck = useCallback((newFiles: File[]) => {
    let updatedFiles = [...files];
    let duplicateCount = 0;
    let tooLargeCount = 0; // Compteur pour les fichiers qui dépassent 50 Mo

    newFiles.forEach((newFile) => {
      // 1. Contrôle de la taille maximale
      if (newFile.size > MAX_FILE_SIZE) {
        tooLargeCount++;
        return; // On ignore ce fichier et on passe au suivant
      }

      // 2. Contrôle des doublons
      const isDuplicate = updatedFiles.some(f => f.name === newFile.name || f.size === newFile.size);

      if (isDuplicate) {
        duplicateCount++;
      } else {
        updatedFiles.push(newFile);
      }
    });

    // Affichage des alertes i18n si des fichiers sont rejetés
    if (tooLargeCount > 0) {
      alert(t('form.size_alert', `⚠️ ${tooLargeCount} file(s) ignored because they exceed the 50 MB limit.`));
    }
    if (duplicateCount > 0) {
      alert(t('form.duplicate_alert', `⚠️ ${duplicateCount} file(s) ignored (already attached or identical).`));
    }

    onFilesChange(updatedFiles);
  }, [files, onFilesChange, t]);

  // Gestion du Ctrl+V (Copier-Coller)
  const handlePaste = useCallback((event: ClipboardEvent) => {
    const items = event.clipboardData?.items;
    if (!items) return;

    const pastedFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const blob = items[i].getAsFile();
        if (blob) {
          const filename = `screenshot_${new Date().getTime()}.png`;
          const file = new File([blob], filename, { type: blob.type });
          pastedFiles.push(file);
        }
      }
    }
    if (pastedFiles.length > 0) {
      addFilesWithCheck(pastedFiles);
    }
  }, [addFilesWithCheck]);

  useEffect(() => {
    document.addEventListener('paste', handlePaste);
    return () => {
      document.removeEventListener('paste', handlePaste);
    };
  }, [handlePaste]);

  // Drag & Drop
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const filesArray = Array.from(e.dataTransfer.files);
      addFilesWithCheck(filesArray);
      e.dataTransfer.clearData();
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const filesArray = Array.from(e.target.files);
      addFilesWithCheck(filesArray);
      e.target.value = ''; 
    }
  };

  const removeFile = (indexToRemove: number) => {
    onFilesChange(files.filter((_, index) => index !== indexToRemove));
  };

  return (
    <div 
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{ 
        background: isDragging ? '#e6f0ff' : '#fafbfc', 
        padding: '20px', 
        borderRadius: '6px', 
        border: isDragging ? '2px dashed #0052cc' : '2px dashed #dfe1e6',
        transition: 'all 0.2s ease',
        textAlign: 'center'
      }}
    >
      <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '10px', color: '#42526e' }}>
        {t('form.attachments_label', 'Attachments (Photos, Videos, Documents)')}
      </label>
      
      <p style={{ margin: '0 0 15px 0', color: '#5e6c84' }}>
        {t('form.drag_drop_text', 'Drag and drop your files here or click to browse')}
      </p>

      <input 
        type="file" 
        multiple 
        onChange={handleFileInputChange}
        style={{ display: 'block', margin: '0 auto', color: 'transparent', width: '110px' }}
        title="Browse files"
      />
      
      <p style={{ fontSize: '13px', color: '#5e6c84', margin: '15px 0 0 0', fontStyle: 'italic' }}>
        💡 {t('form.paste_tip', 'Tip: You can also paste screenshots directly using Ctrl+V.')}
      </p>
      
      {/* SECTION 1 : FICHIERS DÉJÀ EXISTANTS (LECTURE SEULE VUE SERVEUR) */}
      {existingFiles.length > 0 && (
        <div style={{ marginTop: '20px', borderTop: '1px solid #dfe1e6', paddingTop: '15px', textAlign: 'left' }}>
          <p style={{ fontSize: '14px', color: '#00875a', fontWeight: 'bold', margin: '0 0 10px 0' }}>
            📁 {existingFiles.length} file(s) already saved:
          </p>
          <ul style={{ fontSize: '13px', color: '#42526e', margin: 0, paddingLeft: '20px', listStyleType: 'square' }}>
            {existingFiles.map((file, index) => (
              <li key={`existing-${index}`} style={{ wordBreak: 'break-all', marginBottom: '5px' }}>
                {file.attachment_name || file.name || 'Unknown file'} 
                <span style={{ color: '#00875a', marginLeft: '10px', fontSize: '11px', fontWeight: 'bold' }}>(Saved)</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {files.length > 0 && (
        <div style={{ marginTop: '20px', borderTop: '1px solid #dfe1e6', paddingTop: '15px', textAlign: 'left' }}>
          <p style={{ fontSize: '14px', color: '#0052cc', fontWeight: 'bold', margin: '0 0 10px 0' }}>
            📎 {files.length} new file(s) ready to upload:
          </p>
          <ul style={{ fontSize: '13px', color: '#42526e', margin: 0, paddingLeft: '20px', listStyleType: 'square' }}>
            {files.map((file, index) => (
              <li key={`new-${index}`} style={{ wordBreak: 'break-all', marginBottom: '5px' }}>
                {file.name} ({(file.size / 1024).toFixed(1)} KB) 
                <span 
                  onClick={() => removeFile(index)} 
                  style={{ color: '#bf2600', marginLeft: '10px', cursor: 'pointer', fontWeight: 'bold' }}
                  title="Remove this file"
                >
                  ✕
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export default FileUploader