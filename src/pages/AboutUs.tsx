import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeftIcon, MapPinIcon, PhoneIcon, EnvelopeIcon } from '@heroicons/react/24/outline';

const AboutUs: React.FC = () => {
  return (
    <div className="min-h-screen bg-[#020408] text-white">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header with back button */}
        <div className="flex items-center mb-8">
          <Link
            to="/"
            className="flex items-center gap-2 text-gray-400 hover:text-cyan-400 transition-colors"
          >
            <ArrowLeftIcon className="w-5 h-5" />
            <span>Back</span>
          </Link>
        </div>

        {/* Main content */}
        <div className="bg-[#0b0f17] border border-gray-800 rounded-2xl p-8 shadow-2xl">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold text-white mb-4">About Propfolio</h1>
            <p className="text-xl text-gray-400 max-w-2xl mx-auto">
              Your comprehensive platform for tracking trading challenges, managing rules, and monitoring ROI performance.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 mb-12">
            {/* Company Info */}
            <div className="space-y-6">
              <h2 className="text-2xl font-semibold text-cyan-400 mb-6">Our Mission</h2>
              <p className="text-gray-300 leading-relaxed">
                At Propfolio, we're dedicated to empowering traders with the tools they need to succeed. 
                Our platform provides comprehensive tracking, analytics, and management features to help 
                you stay disciplined and achieve consistent profitability.
              </p>
              <p className="text-gray-300 leading-relaxed">
                Whether you're participating in prop firm challenges or managing your own trading capital, 
                Propfolio gives you the insights and organization you need to excel.
              </p>
            </div>

            {/* Features */}
            <div className="space-y-6">
              <h2 className="text-2xl font-semibold text-cyan-400 mb-6">Key Features</h2>
              <ul className="space-y-3 text-gray-300">
                <li className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-cyan-400 rounded-full mt-2 flex-shrink-0"></div>
                  <span>Challenge tracking and progress monitoring</span>
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-cyan-400 rounded-full mt-2 flex-shrink-0"></div>
                  <span>Trading rules management and compliance</span>
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-cyan-400 rounded-full mt-2 flex-shrink-0"></div>
                  <span>ROI calculation and performance analytics</span>
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-cyan-400 rounded-full mt-2 flex-shrink-0"></div>
                  <span>Shareable performance statistics</span>
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-cyan-400 rounded-full mt-2 flex-shrink-0"></div>
                  <span>Calendar integration for trade planning</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Contact Information */}
          <div className="border-t border-gray-700 pt-8">
            <h2 className="text-2xl font-semibold text-cyan-400 mb-6 text-center">Contact Information</h2>
            
            <div className="grid md:grid-cols-3 gap-6 text-center">
              {/* Business Address */}
              <div className="bg-[#1a1f2e] border border-gray-700 rounded-lg p-6">
                <MapPinIcon className="w-8 h-8 text-cyan-400 mx-auto mb-4" />
                <h3 className="font-semibold text-white mb-2">Business Address</h3>
                <p className="text-gray-300 text-sm leading-relaxed">
                  1030 W Main St<br />
                  Norristown, PA 19401<br />
                  United States
                </p>
              </div>

              {/* Email */}
              <div className="bg-[#1a1f2e] border border-gray-700 rounded-lg p-6">
                <EnvelopeIcon className="w-8 h-8 text-cyan-400 mx-auto mb-4" />
                <h3 className="font-semibold text-white mb-2">Email Support</h3>
                <p className="text-gray-300 text-sm">
                  support@propfolio.com<br />
                  <span className="text-gray-400">We respond within 24 hours</span>
                </p>
              </div>

              {/* Phone */}
              <div className="bg-[#1a1f2e] border border-gray-700 rounded-lg p-6">
                <PhoneIcon className="w-8 h-8 text-cyan-400 mx-auto mb-4" />
                <h3 className="font-semibold text-white mb-2">Phone Support</h3>
                <p className="text-gray-300 text-sm">
                  (555) 123-4567<br />
                  <span className="text-gray-400">Mon-Fri 9AM-6PM EST</span>
                </p>
              </div>
            </div>
          </div>

          {/* Call to Action */}
          <div className="text-center mt-12">
            <p className="text-gray-400 mb-6">
              Ready to take control of your trading journey?
            </p>
            <div className="flex gap-4 justify-center">
              <Link
                to="/signup"
                className="bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-200"
              >
                Get Started
              </Link>
              <Link
                to="/login"
                className="border border-cyan-500 text-cyan-400 hover:bg-cyan-500 hover:text-white font-semibold py-3 px-6 rounded-lg transition-all duration-200"
              >
                Sign In
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AboutUs;