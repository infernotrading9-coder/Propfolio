import React from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, CheckCircle, TrendingUp, BarChart3, Shield, Zap, Star } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ShareStatsShowcase } from './ShareStatsShowcase';

export const LandingPage: React.FC = () => {
  const navigate = useNavigate();

  const features = [
    {
      icon: <TrendingUp className="w-6 h-6" />,
      title: "Track All Your Challenges",
      description: "Manage unlimited prop firm challenges from all the major firms in one beautiful dashboard."
    },
    {
      icon: <BarChart3 className="w-6 h-6" />,
      title: "Advanced Analytics",
      description: "Get deep insights into your ROI, success rates, and performance across all your trading accounts."
    },
    {
      icon: <Shield className="w-6 h-6" />,
      title: "Never Break Rules Again",
      description: "Visual rule tracking calendar ensures you stay compliant with all your prop firm requirements."
    },
    {
      icon: <Zap className="w-6 h-6" />,
      title: "Beautiful Share Cards",
      description: "Generate professional trading performance cards to share your success on social media."
    }
  ];

  const testimonials = [
    {
      name: "Alex Chen",
      role: "Full-Time Prop Trader",
      avatar: "https://randomuser.me/api/portraits/men/12.jpg",
      fallback: "/avatars/avatar-1.svg",
      content: "Finally stopped using spreadsheets! Propfolio helped me track 12 challenges and I'm now profitable with 5 firms.",
      rating: 5
    },
    {
      name: "Sarah Johnson",
      role: "Trading Coach",
      avatar: "https://randomuser.me/api/portraits/women/32.jpg", 
      fallback: "/avatars/avatar-2.svg",
      content: "My students love the rule tracking feature. No more blown accounts due to missed daily loss limits!",
      rating: 5
    },
    {
      name: "Mike Rodriguez",
      role: "Prop Trader",
      avatar: "https://randomuser.me/api/portraits/men/45.jpg",
      fallback: "/avatars/avatar-3.svg",
      content: "The ROI insights are incredible. I can see exactly which firms are most profitable for my strategy.",
      rating: 5
    }
  ];

  const stats = [
    { number: "1,200+", label: "Active Traders" },
    { number: "$2.4M+", label: "Tracked Revenue" },
    { number: "98%", label: "Success Rate" },
    { number: "20,000+", label: "Challenges Tracked" }
  ];

  return (
    <div className="min-h-screen bg-[#020408] text-white overflow-x-hidden">
      {/* Navigation */}
      <nav className="relative z-50 px-4 py-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 to-purple-400">
            Propfolio
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/login')}
              className="px-4 py-2 text-white/80 hover:text-white transition-colors"
            >
              Login
            </button>
            <button
              onClick={() => navigate('/signup')}
              className="px-6 py-2 bg-gradient-to-r from-cyan-500/20 to-purple-500/20 border border-cyan-400/30 text-cyan-200 hover:from-cyan-400/30 hover:to-purple-400/30 hover:border-cyan-300/50 rounded-lg transition-all duration-300"
            >
              Sign Up Free
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center px-4 py-20 -mt-20">
        {/* Background Effects */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse delay-1000"></div>
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-full h-px bg-gradient-to-r from-transparent via-cyan-500/20 to-transparent"></div>
        </div>

        <div className="relative z-10 max-w-6xl mx-auto text-center">
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-500/20 to-purple-500/20 border border-cyan-400/30 rounded-full mb-8"
          >
            <Zap className="w-4 h-4 text-cyan-400" />
            <span className="text-cyan-200 text-sm font-medium">The #1 Prop Trading Portfolio</span>
          </motion.div>

          {/* Main Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="text-4xl md:text-7xl font-black mb-6 leading-tight"
          >
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-blue-400 to-purple-400">
              Stop Using
            </span>
            <br />
            <span className="text-white">Spreadsheets for</span>
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-400 to-red-400">
              Prop Trading
            </span>
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="text-xl md:text-2xl text-white/70 mb-12 max-w-4xl mx-auto leading-relaxed"
          >
            Track Challenges, Trading Rules, and ROI across all prop firms in one beautiful dashboard. 
            <span className="text-cyan-300"> Join 1,200+ traders</span> who have tracked their prop firm trading journey, no more guessing if you've made money!!
          </motion.p>

          {/* CTA Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.6 }}
            className="flex justify-center items-center mb-16"
          >
            <button
              onClick={() => navigate('/signup')}
              className="group px-8 py-4 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold rounded-xl transition-all duration-300 hover:scale-105 shadow-lg hover:shadow-cyan-500/25 flex items-center gap-2"
            >
              Start Free Trial
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>
          </motion.div>

          {/* Social Proof */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1, delay: 0.8 }}
            className="flex flex-wrap justify-center items-center gap-8 text-white/40"
          >
            <div className="flex items-center gap-2">
              <div className="flex -space-x-2">
                {[
                  { src: 'https://randomuser.me/api/portraits/thumb/men/15.jpg', fallback: '/avatars/avatar-1.svg' },
                  { src: 'https://randomuser.me/api/portraits/thumb/women/28.jpg', fallback: '/avatars/avatar-2.svg' },
                  { src: 'https://randomuser.me/api/portraits/thumb/men/36.jpg', fallback: '/avatars/avatar-3.svg' },
                  { src: 'https://randomuser.me/api/portraits/thumb/women/53.jpg', fallback: '/avatars/avatar-4.svg' },
                  { src: 'https://randomuser.me/api/portraits/thumb/men/67.jpg', fallback: '/avatars/avatar-5.svg' },
                ].map((a, i) => (
                  <img
                    key={i}
                    src={a.src}
                    alt="Trader avatar"
                    width={32}
                    height={32}
                    loading="lazy"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).src = a.fallback; (e.currentTarget as HTMLImageElement).onerror = null; }}
                    className="w-8 h-8 rounded-full object-cover border border-white/10"
                  />
                ))}
              </div>
              <span className="text-sm">1,200+ traders trust Propfolio</span>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-16 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((stat, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
                viewport={{ once: true }}
                className="text-center"
              >
                <div className="text-3xl md:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 to-purple-400 mb-2">
                  {stat.number}
                </div>
                <div className="text-white/60 text-sm font-medium">{stat.label}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
              viewport={{ once: true }}
              className="text-3xl md:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 to-purple-300 mb-6"
            >
              Everything You Need to Succeed
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              viewport={{ once: true }}
              className="text-xl text-white/70 max-w-3xl mx-auto"
            >
              Stop juggling spreadsheets and notebooks. Get professional-grade tools that prop traders actually use.
            </motion.p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {features.map((feature, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
                viewport={{ once: true }}
                className="bg-gradient-to-br from-white/5 to-white/[0.02] backdrop-blur-sm rounded-2xl p-8 border border-white/10 hover:border-cyan-400/30 transition-all duration-300 hover:bg-white/[0.08]"
              >
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-r from-cyan-500/20 to-purple-500/20 border border-cyan-400/30 mb-6">
                  <div className="text-cyan-400">
                    {feature.icon}
                  </div>
                </div>
                <h3 className="text-xl font-bold text-white mb-4">{feature.title}</h3>
                <p className="text-white/70 leading-relaxed">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Shareable Stats Showcase (carousel with screenshots) */}
      <ShareStatsShowcase />

      {/* Testimonials Section */}
      <section className="py-20 px-4 bg-gradient-to-br from-cyan-500/5 to-purple-500/5">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
              viewport={{ once: true }}
              className="text-3xl md:text-5xl font-bold text-white mb-6"
            >
              Loved by Prop Traders Worldwide
            </motion.h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {testimonials.map((testimonial, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: index * 0.2 }}
                viewport={{ once: true }}
                className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10"
              >
                <div className="flex items-center mb-4">
                  {[...Array(testimonial.rating)].map((_, i) => (
                    <Star key={i} className="w-5 h-5 text-yellow-400 fill-current" />
                  ))}
                </div>
                <p className="text-white/80 mb-6 leading-relaxed">"{testimonial.content}"</p>
                <div className="flex items-center gap-3">
                  <img
                    src={(testimonial as any).avatar}
                    alt={`${testimonial.name} avatar`}
                    width={40}
                    height={40}
                    loading="lazy"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).src = (testimonial as any).fallback || '/avatars/avatar-1.svg'; (e.currentTarget as HTMLImageElement).onerror = null; }}
                    className="w-10 h-10 rounded-full object-cover border border-white/10"
                  />
                  <div>
                    <div className="font-semibold text-white">{testimonial.name}</div>
                    <div className="text-sm text-white/60">{testimonial.role}</div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Shareable Stats Showcase (carousel with screenshots) */}
      <ShareStatsShowcase />

      {/* Final CTA Section */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
            className="bg-gradient-to-br from-cyan-500/10 to-purple-500/10 backdrop-blur-sm rounded-3xl p-12 border border-cyan-400/20"
          >
            <h2 className="text-3xl md:text-5xl font-bold text-white mb-6">
              Ready to Stop Losing Money?
            </h2>
            <p className="text-xl text-white/70 mb-8 max-w-2xl mx-auto">
              Join the prop traders who've eliminated preventable losses and 3x'd their success rate with Propfolio.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-8">
              <button
                onClick={() => navigate('/signup')}
                className="px-10 py-4 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold rounded-xl transition-all duration-300 hover:scale-105 shadow-lg hover:shadow-cyan-500/25"
              >
                Start Your Free Trial
              </button>
              <button
                onClick={() => navigate('/pricing')}
                className="px-10 py-4 border border-white/20 hover:border-white/40 text-white/90 hover:text-white font-bold rounded-xl transition-all duration-300 hover:bg-white/5"
              >
                View Pricing
              </button>
            </div>

            <div className="flex items-center justify-center gap-6 text-sm text-white/60">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-400" />
                Free 14-day trial
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-400" />
                No credit card required
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-400" />
                Cancel anytime
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 border-t border-white/10">
        <div className="max-w-6xl mx-auto text-center">
          <div className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 to-purple-400 mb-4">
            Propfolio
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-4">
            <button
              onClick={() => navigate('/about')}
              className="text-white/60 hover:text-cyan-400 text-sm transition-colors"
            >
              About Us
            </button>
            <span className="hidden sm:block text-white/30">•</span>
            <button
              onClick={() => navigate('/pricing')}
              className="text-white/60 hover:text-cyan-400 text-sm transition-colors"
            >
              Pricing
            </button>
            <span className="hidden sm:block text-white/30">•</span>
            <button
              onClick={() => navigate('/login')}
              className="text-white/60 hover:text-cyan-400 text-sm transition-colors"
            >
              Login
            </button>
          </div>
          <div className="text-white/40 text-sm">
            © 2024 Propfolio. Built for prop traders, by prop traders.
          </div>
        </div>
      </footer>
    </div>
  );
};