import { Header } from '@/components/layout/Header'
import { ProfileForm } from '@/components/profile/ProfileForm'
import { motion } from 'framer-motion'

const ProfileSetup = () => {
  return (
    <div className='flex-1 space-y-4 p-4 md:p-6 lg:p-8'>
      <Header title='Profile Setup' />

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        <ProfileForm />
      </motion.div>
    </div>
  )
}

export default ProfileSetup