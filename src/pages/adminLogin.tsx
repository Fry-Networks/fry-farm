const AdminLogin = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      {/* Container */}
      <div className="bg-white shadow-lg rounded-lg p-8 w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center justify-center mb-6">
          <img
            src="/path-to-logo.png" // Replace with the actual logo path
            alt="Logo"
            className="h-12 w-auto"
          />
        </div>
        {/* Header */}
        <h2 className="text-2xl font-bold text-gray-800 text-center mb-4">Admin Login</h2>
        <p className="text-gray-500 text-center mb-6">Welcome back! Please log in to your account.</p>
        {/* Form */}
        <form className="space-y-6">
          {/* Email */}
          <div>
            <label htmlFor="email" className="block text-gray-700 font-medium mb-2">
              Email Address
            </label>
            <input
              type="email"
              id="email"
              placeholder="Enter your email"
              className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-red-400"
            />
          </div>
          {/* Password */}
          <div>
            <label htmlFor="password" className="block text-gray-700 font-medium mb-2">
              Password
            </label>
            <input
              type="password"
              id="password"
              placeholder="Enter your password"
              className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-red-400"
            />
          </div>
          {/* Login Button */}
          <button
            type="submit"
            className="w-full bg-red-500 flex items-center justify-center text-white py-2 rounded-lg font-medium bg-red transition-all"
          >
            Log In
          </button>
        </form>
        {/* Additional Links */}
        <div className="flex items-center justify-between mt-6">
          <a href="#" className="text-sm text-gray-500 hover:underline">
            Forgot Password?
          </a>
          <a href="#" className="text-sm text-red-500 hover:underline">
            Create an Account
          </a>
        </div>
      </div>
    </div>
  )
}

export default AdminLogin
