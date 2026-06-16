import { Checkbox, Col, Row } from 'antd'
import { ErrorMessage, Field, Form, Formik } from 'formik'
import React, { useState } from 'react'
import * as Yup from 'yup'
import Button from '../../components/shared/button'
import Input from '../../components/shared/input'

const GeneralSetting: React.FC = () => {
  const [notifications, setNotifications] = useState([
    { id: 'medicationReminder', label: 'Notify me for medication reminder', checked: true },
    { id: 'notifyWhen', label: 'Notify me when', checked: false },
    { id: 'achievement', label: 'Notify me for the achievement', checked: true },
    { id: 'newQuestionnaire', label: 'Notify me for new questionnaire', checked: true },
    { id: 'newAchievement', label: 'Notify me for the achievement', checked: false },
  ])

  const handleNotificationChange = (id: string, checked: boolean) => {
    setNotifications((prevNotifications) =>
      prevNotifications.map((notification) => (notification.id === id ? { ...notification, checked } : notification)),
    )
  }

  const passwordValidationSchema = Yup.object().shape({
    currentPassword: Yup.string().required('Current Password is required'),
    newPassword: Yup.string().required('New Password is required').min(6, 'Password must be at least 6 characters'),
    confirmPassword: Yup.string()
      .required('Confirm Password is required')
      .oneOf([Yup.ref('newPassword')], 'Passwords must match'),
  })

  return (
    <>
      <div className="w-full mt-[5px] mb-[71px] flex flex-col gap-[37px]">
        {/* Notification Section */}
        <div className="flex flex-col gap-[20px] pb-[20px] border-solid border-b-2 border-[#E7E7E7]">
          <p className="elarge text-black font-semibold">Notification</p>
          <Row gutter={[16, 16]}>
            {notifications.map((item) => (
              <Col span={12} key={item.id} xs={24} sm={12}>
                <Checkbox checked={item.checked} onChange={(e) => handleNotificationChange(item.id, e.target.checked)}>
                  {item.label}
                </Checkbox>
              </Col>
            ))}
          </Row>
        </div>

        {/* Password Update Section */}
        <Formik
          initialValues={{
            currentPassword: '',
            newPassword: '',
            confirmPassword: '',
          }}
          validationSchema={passwordValidationSchema}
          onSubmit={(values) => {
            console.log('Form Submitted', values)
            alert('Password updated successfully!')
          }}
        >
          {({ handleSubmit }) => (
            <Form onSubmit={handleSubmit} className="flex flex-col gap-[32px] w-full">
              <div className="flex gap-[20px] w-full flex-row sm-s:flex-col">
                <div className="flex flex-col gap-[10px] w-full">
                  <p className="text-black large">Current Password</p>
                  <Field
                    as={Input}
                    type="password"
                    name="currentPassword"
                    placeholder="Enter current Password"
                    className="input-wrapper bg-[#F5F5F5] rounded-[10px] text-[16px] !w-full !h-[55px]"
                  />
                  <ErrorMessage name="currentPassword" component="p" className="text-darkRed e-small" />
                </div>
                <div className="flex flex-col gap-[10px] w-full">
                  <p className="text-black large">New Password</p>
                  <Field
                    as={Input}
                    type="password"
                    name="newPassword"
                    placeholder="Enter new Password"
                    className="input-wrapper bg-[#F5F5F5] rounded-[10px] text-[16px] !w-full !h-[55px]"
                  />
                  <ErrorMessage name="newPassword" component="p" className="text-darkRed e-small" />
                </div>
                <div className="flex flex-col gap-[10px] w-full">
                  <p className="text-black large">Confirm Password</p>
                  <Field
                    as={Input}
                    type="password"
                    name="confirmPassword"
                    placeholder="Enter confirm Password"
                    className="input-wrapper bg-[#F5F5F5] rounded-[10px] text-[16px] !w-full !h-[55px]"
                  />
                  <ErrorMessage name="confirmPassword" component="p" className="text-darkRed e-small" />
                </div>
              </div>
              <Button text="Update" className="button btn-primary" height={45} width={168} />
            </Form>
          )}
        </Formik>
      </div>
    </>
  )
}

export default GeneralSetting
