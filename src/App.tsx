import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { SettingsProvider } from './contexts/SettingsContext';
import { SubscriptionProvider } from './contexts/SubscriptionContext';
import Login from './components/auth/Login';
import Signup from './components/auth/Signup';
import VerifyEmail from './components/auth/VerifyEmail';
import ProtectedRoute from './components/auth/ProtectedRoute';
import Dashboard from './components/Dashboard';
import { PricingPage } from './components/PricingPage';
import { LandingPage } from './components/LandingPage';
import AboutUs from './pages/AboutUs';

function App() {
  return (
    <AuthProvider>
      <SubscriptionProvider>
        <SettingsProvider>
          <Router>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/about" element={<AboutUs />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/verify-email" element={<VerifyEmail />} />
            <Route 
              path="/dashboard" 
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/pricing" 
              element={
                <ProtectedRoute>
                  <PricingPage />
                </ProtectedRoute>
              } 
            />
          </Routes>
          </Router>
        </SettingsProvider>
      </SubscriptionProvider>
    </AuthProvider>
  );
}

export default App;
