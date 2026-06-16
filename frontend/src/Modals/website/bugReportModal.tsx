import { Icon } from '@iconify/react'
import { Input, Modal, Select } from 'antd'
import { useFormik } from 'formik'
import React, { useEffect, useState } from 'react'
import * as Yup from 'yup'
import Button from '../../components/shared/button'
import { toast } from 'react-toastify'
import { authAxios } from '../../services/apiClient'
import { useAuth } from '../../hooks/useAuth'
import { useChain } from '../../context/ChainContext'
import { useMultiChainWallet } from '../../hooks/useMultiChainWallet'
import '../../styles/shared/scrollbar.css'

const InfoTooltip = ({ text }: { text: string }) => (
  <span className="relative group inline-block ml-1 cursor-help">
    <span className="text-gray-400 hover:text-gray-200 text-xs border border-gray-500 rounded-full px-1">i</span>
    <span className="absolute left-0 bottom-full mb-1 w-72 p-2 text-xs text-gray-200 bg-gray-800 border border-gray-600 rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50 pointer-events-none whitespace-normal">
      {text}
    </span>
  </span>
)

const CHUNK_SIZE = 4 * 1024 * 1024 // 4MB

interface BugReportModalProps {
  isOpen: boolean
  setIsOpen: (state: boolean) => void
}

const CATEGORIES = [
  { value: 'ui', label: 'UI' },
  { value: 'staking', label: 'Staking' },
  { value: 'farming', label: 'Farming' },
  { value: 'nft-staking', label: 'NFT Staking' },
  { value: 'swap', label: 'Swap' },
  { value: 'prediction', label: 'Prediction' },
  { value: 'device-staking', label: 'Device Staking' },
  { value: 'other', label: 'Other' },
]

async function uploadFileInChunks(
  file: File,
  fieldName: string,
  uploadId: string,
  onProgress: (current: number, total: number) => void,
): Promise<string | null> {
  if (file.size <= CHUNK_SIZE) return null // small file — use direct upload

  const totalChunks = Math.ceil(file.size / CHUNK_SIZE)

  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE
    const end = Math.min(start + CHUNK_SIZE, file.size)
    const chunk = file.slice(start, end)

    const form = new FormData()
    form.append('uploadId', uploadId)
    form.append('chunkIndex', String(i))
    form.append('totalChunks', String(totalChunks))
    form.append('fieldName', fieldName)
    form.append('chunk', chunk)

    await authAxios.post('/bug-reports/chunk', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    onProgress(i + 1, totalChunks)
  }

  const finalizeRes = await authAxios.post('/bug-reports/finalize', {
    uploadId,
    fieldName,
    originalName: file.name,
  })

  return finalizeRes.data.filename
}

const BugReportModal: React.FC<BugReportModalProps> = ({ isOpen, setIsOpen }) => {
  const { ensureAuth } = useAuth()
  const { chainId } = useChain()
  const { activeAddress } = useMultiChainWallet()

  const [screenshotFile, setScreenshotFile] = useState<File | null>(null)
  const [screenshotName, setScreenshotName] = useState('')
  const [consoleLogFile, setConsoleLogFile] = useState<File | null>(null)
  const [consoleLogName, setConsoleLogName] = useState('')
  const [harFileData, setHarFileData] = useState<File | null>(null)
  const [harFileName, setHarFileName] = useState('')
  const [uploadStatus, setUploadStatus] = useState('')

  // Reset file state when modal opens
  useEffect(() => {
    if (isOpen) {
      setScreenshotFile(null)
      setScreenshotName('')
      setConsoleLogFile(null)
      setConsoleLogName('')
      setHarFileData(null)
      setHarFileName('')
      setUploadStatus('')
    }
  }, [isOpen])

  const formik = useFormik({
    enableReinitialize: true,
    initialValues: {
      chain: chainId === 'voi-mainnet' ? 'voi' : 'algorand',
      walletAddress: activeAddress || '',
      title: '',
      category: '',
      description: '',
    },
    validationSchema: Yup.object({
      chain: Yup.string().oneOf(['algorand', 'voi']).required('Chain is required'),
      walletAddress: Yup.string().required('Wallet address is required'),
      title: Yup.string().max(100, 'Title must be 100 characters or less').required('Title is required'),
      category: Yup.string().oneOf(CATEGORIES.map(c => c.value)).required('Category is required'),
      description: Yup.string().max(2000, 'Description must be 2000 characters or less').required('Description is required'),
    }),
    onSubmit: async (values, { resetForm }) => {
      if (!activeAddress) {
        toast.error('Please connect your wallet first')
        return
      }
      if (!consoleLogFile) {
        toast.error('Console log is required')
        return
      }
      if (!harFileData) {
        toast.error('HAR file is required')
        return
      }
      try {
        await ensureAuth()
        const uploadId = Math.random().toString(36).slice(2) + Date.now().toString(36)

        // Upload large files via chunks
        const preUploaded: Record<string, string> = {}
        const filesToChunk: [File, string, string][] = []
        if (harFileData) filesToChunk.push([harFileData, 'harFile', 'HAR file'])
        if (consoleLogFile) filesToChunk.push([consoleLogFile, 'consoleLog', 'Console log'])
        if (screenshotFile) filesToChunk.push([screenshotFile, 'screenshot', 'Screenshot'])

        for (const [file, fieldName, label] of filesToChunk) {
          const result = await uploadFileInChunks(file, fieldName, uploadId, (current, total) => {
            setUploadStatus(`Uploading ${label}... (${current}/${total})`)
          })
          if (result) {
            preUploaded[fieldName] = result
          }
        }

        setUploadStatus('Submitting report...')

        const form = new FormData()
        form.append('chain', values.chain)
        form.append('walletAddress', values.walletAddress)
        form.append('title', values.title.trim())
        form.append('category', values.category)
        form.append('description', values.description.trim())

        // Attach small files directly, pass pre-uploaded filenames for large ones
        if (screenshotFile && !preUploaded.screenshot) form.append('screenshot', screenshotFile)
        if (preUploaded.screenshot) form.append('screenshotPreUploaded', preUploaded.screenshot)

        if (consoleLogFile && !preUploaded.consoleLog) form.append('consoleLog', consoleLogFile)
        if (preUploaded.consoleLog) form.append('consoleLogPreUploaded', preUploaded.consoleLog)

        if (harFileData && !preUploaded.harFile) form.append('harFile', harFileData)
        if (preUploaded.harFile) form.append('harFilePreUploaded', preUploaded.harFile)

        const response = await authAxios.post('/bug-reports', form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })

        if (response.data.success) {
          toast.success('Bug report submitted. Thank you!')
          resetForm()
          setScreenshotFile(null)
          setScreenshotName('')
          setConsoleLogFile(null)
          setConsoleLogName('')
          setHarFileData(null)
          setHarFileName('')
          setUploadStatus('')
          setIsOpen(false)
        }
      } catch (error: any) {
        setUploadStatus('')
        if (error?.response?.status === 429) {
          toast.error('Too many bug reports. Please try again later.')
        } else {
          toast.error(error.response?.data?.message || 'Failed to submit bug report.')
        }
      }
    },
  })

  const handleFileChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    setFile: (f: File | null) => void,
    setName: (n: string) => void,
    maxSize: number,
    allowedExts: string[],
    label: string,
  ) => {
    const f = e.target.files?.[0]
    if (!f) return
    if (f.size > maxSize) {
      toast.error(`${label} must be under ${Math.round(maxSize / 1024 / 1024)}MB`)
      e.currentTarget.value = ''
      return
    }
    const ext = f.name.substring(f.name.lastIndexOf('.')).toLowerCase()
    if (allowedExts.length > 0 && !allowedExts.includes(ext)) {
      toast.error(`${label}: only ${allowedExts.join(', ')} files allowed`)
      e.currentTarget.value = ''
      return
    }
    setFile(f)
    setName(f.name)
    e.currentTarget.value = ''
  }

  return (
    <Modal open={isOpen} onCancel={() => setIsOpen(false)} centered width="500px" footer={null}>
      <div className="modal-content flex flex-col pt-[24px] pb-[31px] px-[31px]">
        <h5 className="text-[var(--text-primary)] font-apex text-center">Report a Bug</h5>
        {!activeAddress && (
          <p className="italic text-sm text-center mt-2" style={{ color: '#f87171' }}>
            Wallet must be connected to report a bug
          </p>
        )}
        <div className="red-line w-full h-[1px] mt-[25px] mb-[33px]"></div>

        <div className="max-h-[70vh] overflow-y-auto custom-scrollbar pr-2">
          <form onSubmit={formik.handleSubmit}>
            {/* Chain */}
            <div className="flex flex-col gap-[8px] mb-[16px]">
              <p className="large text-[var(--text-primary)]">Chain</p>
              <Select
                value={formik.values.chain}
                onChange={(val) => formik.setFieldValue('chain', val)}
                className="w-full"
                options={[
                  { value: 'algorand', label: 'Algorand' },
                  { value: 'voi', label: 'Voi' },
                ]}
              />
              {formik.touched.chain && formik.errors.chain && (
                <p className="text-xs text-red-500">{formik.errors.chain}</p>
              )}
            </div>

            {/* Wallet Address */}
            <div className="flex flex-col gap-[8px] mb-[16px]">
              <p className="large text-[var(--text-primary)]">Wallet Address</p>
              <Input
                name="walletAddress"
                placeholder="Your wallet address"
                value={formik.values.walletAddress}
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                className="input-wrapper bg-[var(--input-bg)] text-[var(--input-text)] rounded-[10px] text-[16px] w-full"
              />
              {formik.touched.walletAddress && formik.errors.walletAddress && (
                <p className="text-xs text-red-500">{formik.errors.walletAddress}</p>
              )}
            </div>

            {/* Title */}
            <div className="flex flex-col gap-[8px] mb-[16px]">
              <p className="large text-[var(--text-primary)]">Title</p>
              <Input
                name="title"
                placeholder="Brief description of the issue"
                maxLength={100}
                value={formik.values.title}
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                className="input-wrapper bg-[var(--input-bg)] text-[var(--input-text)] rounded-[10px] text-[16px] w-full"
              />
              {formik.touched.title && formik.errors.title && (
                <p className="text-xs text-red-500">{formik.errors.title}</p>
              )}
            </div>

            {/* Category */}
            <div className="flex flex-col gap-[8px] mb-[16px]">
              <p className="large text-[var(--text-primary)]">Category</p>
              <Select
                value={formik.values.category || undefined}
                onChange={(val) => formik.setFieldValue('category', val)}
                placeholder="Select category"
                className="w-full"
                options={CATEGORIES}
              />
              {formik.touched.category && formik.errors.category && (
                <p className="text-xs text-red-500">{formik.errors.category}</p>
              )}
            </div>

            {/* Description */}
            <div className="flex flex-col gap-[8px] mb-[16px]">
              <div className="flex justify-between items-center">
                <p className="large text-[var(--text-primary)]">Description</p>
                <span className="text-xs text-[var(--text-secondary)]">
                  {formik.values.description.length}/2000
                </span>
              </div>
              <Input.TextArea
                name="description"
                placeholder="Describe what happened, what you expected, and steps to reproduce"
                rows={5}
                maxLength={2000}
                value={formik.values.description}
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                className="text-[var(--input-text)]"
              />
              {formik.touched.description && formik.errors.description && (
                <p className="text-xs text-red-500">{formik.errors.description}</p>
              )}
            </div>

            {/* Attachments */}
            <div className="flex flex-col gap-[12px] mb-[16px]">
              <p className="large text-[var(--text-primary)]">Attachments</p>

              {/* Screenshot */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => document.getElementById('bugScreenshot')?.click()}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-[8px] border border-[var(--border-color)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] cursor-pointer transition-colors"
                >
                  <Icon icon="mdi:image-outline" width={16} />
                  Screenshot
                </button>
                {screenshotName && (
                  <span className="text-xs text-[var(--text-secondary)] truncate max-w-[200px]">{screenshotName}</span>
                )}
                <input
                  type="file"
                  id="bugScreenshot"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => handleFileChange(e, setScreenshotFile, setScreenshotName, 5 * 1024 * 1024, [], 'Screenshot')}
                />
              </div>

              {/* Console Log */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => document.getElementById('bugConsoleLog')?.click()}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-[8px] border border-[var(--border-color)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] cursor-pointer transition-colors"
                >
                  <Icon icon="mdi:console" width={16} />
                  Console Log *
                  <InfoTooltip text="In Chrome/Brave: Right-click the page → Inspect → Console tab → Right-click anywhere in the console → Save as... → Save as .txt file. Include errors from the time the bug occurred." />
                </button>
                {consoleLogName && (
                  <span className="text-xs text-[var(--text-secondary)] truncate max-w-[200px]">{consoleLogName}</span>
                )}
                <input
                  type="file"
                  id="bugConsoleLog"
                  accept=".txt,.log"
                  className="hidden"
                  onChange={(e) => handleFileChange(e, setConsoleLogFile, setConsoleLogName, 2 * 1024 * 1024, ['.txt', '.log'], 'Console log')}
                />
              </div>

              {/* HAR File */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => document.getElementById('bugHarFile')?.click()}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-[8px] border border-[var(--border-color)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] cursor-pointer transition-colors"
                >
                  <Icon icon="mdi:file-code-outline" width={16} />
                  HAR File *
                  <InfoTooltip text="In Chrome/Brave: Right-click the page → Inspect → Network tab → Right-click any request → Save all as HAR with content. Capture this while reproducing the bug." />
                </button>
                {harFileName && (
                  <span className="text-xs text-[var(--text-secondary)] truncate max-w-[200px]">{harFileName}</span>
                )}
                <input
                  type="file"
                  id="bugHarFile"
                  accept=".har,.json"
                  className="hidden"
                  onChange={(e) => handleFileChange(e, setHarFileData, setHarFileName, 1 * 1024 * 1024 * 1024, ['.har', '.json'], 'HAR file')}
                />
              </div>

              <p className="text-xs text-gray-500">
                Screenshot: JPG/PNG/WebP (max 5MB) | Console Log: .txt/.log (max 2MB) | HAR: .har/.json (max 1GB)
              </p>
            </div>

            {uploadStatus && (
              <p className="text-xs text-[var(--text-secondary)] mb-2 text-center">{uploadStatus}</p>
            )}

            <Button
              text={formik.isSubmitting ? (uploadStatus || 'Submitting...') : 'Submit Bug Report'}
              className="button btn-primary mt-2"
              height={53}
              width="100%"
              onClick={() => formik.handleSubmit()}
              disabled={!activeAddress || formik.isSubmitting}
            />
          </form>
        </div>
      </div>
    </Modal>
  )
}

export default BugReportModal
