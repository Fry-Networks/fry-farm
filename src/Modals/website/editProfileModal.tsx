import { Icon } from '@iconify/react'
import { Input, Modal } from 'antd'
import { useFormik } from 'formik'
import React, { useEffect, useState } from 'react'
import * as Yup from 'yup'
import Button from '../../components/shared/button'
import { toast } from 'react-toastify'
import { authAxios } from '../../services/apiClient'
import { useAuth } from '../../hooks/useAuth'
import '../../styles/shared/scrollbar.css'

interface editprofileProps {
  iseditProfileOpen: boolean
  setiseditProfileOpen: (state: boolean) => void
  userData: any
  setUserData: (data: any) => void
  walletId: string | any
}
// Accept only these file types (frontend validation)
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
// Keep well below server 10MB multer limit
const MAX_FILE_MB = Number(import.meta.env.VITE_MAX_IMAGE_MB ?? 2) // default 2 MB
const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024

// Helpers
const fileToDataURL = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(fr.result as string)
    fr.onerror = () => reject(fr.error)
    fr.readAsDataURL(file)
  })

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })

const canvasToBlob = (canvas: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality))

// Compress to File + preview (webp for smaller size)
async function compressToFile(
  inputFile: File,
  opts: { maxW?: number; maxH?: number; quality?: number; mime?: string } = {},
): Promise<{ file: File; preview: string }> {
  const { maxW = 1024, maxH = 1024, quality = 0.75, mime = 'image/webp' } = opts
  const src = await fileToDataURL(inputFile)
  const img = await loadImage(src)

  let { width, height } = img
  const ratio = Math.min(maxW / width, maxH / height, 1)
  width = Math.round(width * ratio)
  height = Math.round(height * ratio)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas not supported')
  ctx.drawImage(img, 0, 0, width, height)

  const blob = await canvasToBlob(canvas, mime, quality)
  if (!blob) throw new Error('Failed to compress image')

  const outFile = new File([blob], (inputFile.name.split('.')[0] || 'image') + (mime === 'image/webp' ? '.webp' : '.jpg'), {
    type: mime,
    lastModified: Date.now(),
  })
  const preview = URL.createObjectURL(outFile)
  return { file: outFile, preview }
}

// Validate + optionally compress; return File + preview URL
async function prepareUploadFile(file: File): Promise<{ file: File; preview: string }> {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    throw new Error('Only JPG, PNG, or WEBP images are allowed.')
  }
  // If file already small enough, keep it as-is
  if (file.size <= MAX_FILE_BYTES) {
    return { file, preview: URL.createObjectURL(file) }
  }
  // Compress; if still large, block
  const { file: compressed, preview } = await compressToFile(file, { maxW: 1024, maxH: 1024, quality: 0.7, mime: 'image/webp' })
  if (compressed.size > MAX_FILE_BYTES) {
    throw new Error(`Image too large. Max ${MAX_FILE_MB} MB.`)
  }
  return { file: compressed, preview }
}

// ...existing props & component signature...
const EditProfileModal: React.FC<editprofileProps> = ({ iseditProfileOpen, setiseditProfileOpen, userData, setUserData, walletId }) => {
  const { ensureAuth } = useAuth();
  // Previews (string URL) and Files (for upload)
  const [bannerImage, setBannerImage] = useState<string | null>(userData?.banner || null)
  const [profileImage, setProfileImage] = useState<string | null>(userData?.profilePicture || null)
  const [bannerFile, setBannerFile] = useState<File | null>(null)
  const [profileFile, setProfileFile] = useState<File | null>(null)

  useEffect(() => {
    setBannerImage(userData?.banner || null)
    setProfileImage(userData?.profilePicture || null)
    setBannerFile(null)
    setProfileFile(null)
  }, [userData])

  // Upload handlers -> validate + compress -> set file + preview
  const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    try {
      const { file, preview } = await prepareUploadFile(f)
      setBannerFile(file)
      setBannerImage(preview)
    } catch (err: any) {
      toast.error(err?.message || 'Invalid banner image')
    } finally {
      e.currentTarget.value = ''
    }
  }

  const handleProfileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    try {
      const { file, preview } = await prepareUploadFile(f)
      setProfileFile(file)
      setProfileImage(preview)
    } catch (err: any) {
      toast.error(err?.message || 'Invalid profile image')
    } finally {
      e.currentTarget.value = ''
    }
  }

  const formik = useFormik({
    enableReinitialize: true,
    initialValues: {
      name: userData.name || '',
      bio: userData.bio || '',
    },
    validationSchema: Yup.object({
      name: Yup.string().required('Name is required'),
      bio: Yup.string().max(200, 'Bio must be 200 characters or less'),
    }),
    onSubmit: async (values) => {
      if (!walletId) {
        toast.error('Please connect your wallet to edit profile')
        return
      }
      try {
        await ensureAuth();
        const form = new FormData()
        form.append('walletId', walletId)
        form.append('name', values.name.trim())
        form.append('bio', values.bio.trim())

        // Append files only if user picked new ones; backend keeps old if absent
        if (profileFile) form.append('profilePicture', profileFile)
        if (bannerFile) form.append('banner', bannerFile)

        const response = await authAxios.post(
          '/user/create-or-update',
          form,
          { headers: { 'Content-Type': 'multipart/form-data' } }
        )

        if (response.status >= 200 && response.status < 300) {
          setUserData(response.data.data)
          toast.success('Profile updated successfully!')
          setiseditProfileOpen(false)
        } else {
          toast.error('Failed to update profile. Please try again.')
        }
      } catch (error: any) {
        // Handle multer 413 or custom limits
        if (error?.response?.status === 413) {
          toast.error(`Upload too large. Please use images <= ${MAX_FILE_MB} MB.`)
        } else {
          console.error('Error updating user:', error)
          toast.error(error.response?.data?.message || 'Failed to update profile.')
        }
      }
    },
  })

  return (
    <Modal open={iseditProfileOpen} onCancel={() => setiseditProfileOpen(false)} centered width="415px">
      <div className="modal-content flex flex-col pt-[24px] pb-[31px] px-[31px]">
        <h5 className="text-[var(--text-primary)] font-apex text-center">Edit Profile</h5>
        {!walletId && (
          <p className="italic text-sm text-center mt-2" style={{ color: '#f87171' }}>
            Wallet must be connected to edit profile
          </p>
        )}
        <div className="red-line w-full h-[1px] mt-[25px] mb-[33px]"></div>

        <div className="max-h-[80vh] overflow-y-auto custom-scrollbar pr-2">
          <form onSubmit={formik.handleSubmit}>
            <div className="flex flex-col mb-[24px]">
              <div
                className="flex flex-col items-center justify-center gap-[8px] relative rounded-[10px] bg-[var(--bg-secondary)] border-dashed border-2 border-[var(--border-color)] h-[155px] cursor-pointer"
                onClick={() => document.getElementById('bannerUpload')?.click()}
              >
                {bannerImage ? (
                  <img src={bannerImage} alt="Banner" className="w-full h-full object-cover rounded-[10px]" />
                ) : (
                  <>
                    <Icon icon="pajamas:upload" width={42} height={42} color="var(--border-color)" />
                    <p className="text-[var(--text-secondary)] font-bold e-small">Upload Banner</p>
                  </>
                )}
                <input
                  type="file"
                  id="bannerUpload"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={handleBannerUpload}
                />
              </div>

              <div className="flex flex-col px-[9px]">
                <img
                  src={profileImage || '../../assets/images/home/mainDP.png'}
                  alt="Profile"
                  className="w-[81px] h-[81px] mt-[-47px] z-[1] object-cover rounded-full"
                  onClick={() => document.getElementById('profileUpload')?.click()}
                />
                <p className="text-link small underline cursor-pointer" onClick={() => document.getElementById('profileUpload')?.click()}>
                  Upload profile
                </p>
                <input
                  type="file"
                  id="profileUpload"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={handleProfileUpload}
                />
              </div>

              <div className="flex flex-col gap-[10px] mt-[10px]">
                <p className="large text-[var(--text-primary)]">Name</p>
                <Input
                  type="text"
                  name="name"
                  placeholder="Name"
                  className="input-wrapper bg-[var(--input-bg)] text-[var(--input-text)] rounded-[10px] text-[16px] w-full"
                  value={formik.values.name}
                  onChange={formik.handleChange}
                />
              </div>

              <div className="flex flex-col gap-[10px] mt-[10px]">
                <p className="large text-[var(--text-primary)]">Bio</p>
                <Input.TextArea
                  name="bio"
                  placeholder="Bio"
                  rows={5}
                  value={formik.values.bio}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  className="text-[var(--input-text)]"
                />
              </div>
            </div>

            <p className="text-xs text-gray-500 mt-2">
              Allowed: JPG, PNG, WEBP. Max {MAX_FILE_MB} MB. Larger files will be compressed automatically.
            </p>

            <Button
              text={formik.isSubmitting ? 'Saving...' : 'Save Changes'}
              className="button btn-primary mt-4"
              height={53}
              width="100%"
              onClick={() => formik.handleSubmit()}
              disabled={!walletId || formik.isSubmitting}
            />
          </form>
        </div>
      </div>
    </Modal>
  )
}

export default EditProfileModal
