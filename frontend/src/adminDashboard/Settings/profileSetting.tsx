import { ErrorMessage, Field, Form, Formik } from 'formik'
import React, { useState } from 'react'
import * as Yup from 'yup'
import Button from '../../components/shared/button'
import Input from '../../components/shared/input'

const ProfileSetting = () => {
  const [selectedImage, setSelectedImage] = useState<string | null>(null)

  const validationSchema = Yup.object().shape({
    name: Yup.string().required('Name is required').min(3, 'Name must be at least 3 characters'),
    email: Yup.string().required('Email is required').email('Invalid email address'),
  })

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0]
      const reader = new FileReader()
      reader.onload = () => setSelectedImage(reader.result as string)
      reader.readAsDataURL(file)
    }
  }

  const handleSubmit = (values: { name: string; email: string }) => {
    console.log('Form Values:', values)
    alert('Profile updated successfully!')
  }

  return (
    <>
      <div className="w-full my-[71px] m-auto">
        <div className="profile-setting flex flex-col items-center gap-[47px] m-auto max-w-[60%]  max-xxxl:max-w-[80%] max-sm:!max-w-full w-full">
          <div className="flex flex-col items-center">
            <img
              src={selectedImage || '../../assets/images/home/mainDP.png'}
              alt="Profile"
              className="w-[156px] h-[156px] rounded-full object-cover"
            />
            <label htmlFor="change-image" className="small font-medium text-link underline cursor-pointer">
              Change Image
            </label>
            <input id="change-image" type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
          </div>

          <Formik initialValues={{ name: '', email: '' }} validationSchema={validationSchema} onSubmit={handleSubmit}>
            {() => (
              <Form className="w-full">
                <div className="flex flex-col gap-[32px] w-full ">
                  <div className="flex gap-[20px] w-full sm-s:flex-col">
                    <div className="flex flex-col gap-[10px] w-full">
                      <p className="text-black large">Name</p>
                      <Field
                        as={Input}
                        type="text"
                        name="name"
                        placeholder="Name"
                        className="input-wrapper bg-[#F5F5F5] rounded-[10px] text-[16px] !w-full !h-[55px]"
                      />
                      <ErrorMessage name="name" component="p" className="text-darkRed e-small" />
                    </div>
                    <div className="flex flex-col gap-[10px] w-full">
                      <p className="text-black large">Email</p>
                      <Field
                        as={Input}
                        type="email"
                        name="email"
                        placeholder="johnwick@gmail.com"
                        className="input-wrapper bg-[#F5F5F5] rounded-[10px] text-[16px] !w-full !h-[55px]"
                      />
                      <ErrorMessage name="email" component="p" className="text-darkRed e-small" />
                    </div>
                  </div>
                  <Button text="Update" className="button btn-primary" height={45} width={168} />
                </div>
              </Form>
            )}
          </Formik>
        </div>
      </div>
    </>
  )
}

export default ProfileSetting
