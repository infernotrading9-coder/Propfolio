import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, Quote } from 'lucide-react';

interface ShowcaseCard {
  id: number;
  image: string;
  testimonial: string;
  author: string;
  role: string;
  stat: string;
  avatar: string;
}

const showcaseCards: ShowcaseCard[] = [
  {
    id: 1,
    image: '/stats-cards/card-1.png',
    testimonial: "Small edge, big confidence. Seeing +8.3% laid out cleanly keeps me disciplined and focused on process.",
    author: "Noah Carter",
    role: "Futures Scalper",
    stat: "+8.3% Profit",
    avatar: "https://i.pravatar.cc/150?img=64"
  },
  {
    id: 2,
    image: '/stats-cards/card-2.png',
    testimonial: "Monster week. The share card makes results look legit for my funding updates—no spreadsheets, no hassle.",
    author: "Jessica Park",
    role: "Indices Trader",
    stat: "+731.7% Profit",
    avatar: "https://i.pravatar.cc/150?img=45"
  },
  {
    id: 3,
    image: '/stats-cards/card-3.png',
    testimonial: "Took a hard hit, but documenting it like this turns a drawdown into a lesson. Even the losses look professional when you track your journey.",
    author: "Alex Rivera",
    role: "FX Day Trader",
    stat: "-100.0% Loss",
    avatar: "https://i.pravatar.cc/150?img=68"
  },
  {
    id: 4,
    image: '/stats-cards/card-4.png',
    testimonial: "Big month. The visuals help me debrief with my coach—what worked, what didn’t, and what to scale.",
    author: "Sarah Martinez",
    role: "Prop Firm Trader",
    stat: "+580.5% Profit",
    avatar: "https://i.pravatar.cc/150?img=47"
  },
  {
    id: 5,
    image: '/stats-cards/card-5.png',
    testimonial: "This dashboard replaced my messy journal. I can share results in seconds and keep momentum.",
    author: "Ryan Thompson",
    role: "Futures & Metals",
    stat: "+363.3% Profit",
    avatar: "https://i.pravatar.cc/150?img=51"
  },
  {
    id: 6,
    image: '/stats-cards/card-6.png',
    testimonial: "+82.1% and zero overthinking. The clean card keeps me accountable to the plan, not the PnL.",
    author: "David Chen",
    role: "Multi‑Asset Trader",
    stat: "+82.1% Profit",
    avatar: "https://i.pravatar.cc/150?img=33"
  }
];

export const ShareStatsShowcase: React.FC = () => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  // Auto-rotate every 5 seconds
  useEffect(() => {
    if (isPaused) return;

    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % showcaseCards.length);
    }, 5000);

    return () => clearInterval(interval);
  }, [isPaused]);

  const goToSlide = (index: number) => {
    setCurrentIndex(index);
  };

  const goToPrevious = () => {
    setCurrentIndex((prev) => (prev - 1 + showcaseCards.length) % showcaseCards.length);
  };

  const goToNext = () => {
    setCurrentIndex((prev) => (prev + 1) % showcaseCards.length);
  };

  const currentCard = showcaseCards[currentIndex];

  return (
    <section className="py-20 px-4 bg-gradient-to-b from-transparent via-purple-500/5 to-transparent relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse delay-1000"></div>
      </div>

      <div className="max-w-7xl mx-auto relative z-10">
        {/* Section Header */}
        <div className="text-center mb-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-500/20 to-purple-500/20 border border-cyan-400/30 rounded-full mb-6"
          >
            <Quote className="w-4 h-4 text-cyan-400" />
            <span className="text-cyan-200 text-sm font-medium">Share Your Journey</span>
          </motion.div>

          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.1 }}
            viewport={{ once: true }}
            className="text-3xl md:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 to-purple-300 mb-6"
          >
            Beautiful Stats, Shareable Moments
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            viewport={{ once: true }}
            className="text-xl text-white/70 max-w-3xl mx-auto"
          >
            Generate stunning trading performance cards in seconds. Perfect for social media, coaching sessions, or personal tracking.
          </motion.p>
        </div>

        {/* Carousel Container */}
        <div 
          className="relative"
          onMouseEnter={() => setIsPaused(true)}
          onMouseLeave={() => setIsPaused(false)}
        >
          <div className="flex flex-col lg:flex-row gap-8 items-center">
            {/* Card Display */}
            <div className="flex-1 relative">
              <div className="relative aspect-[9/16] sm:aspect-[3/4] max-w-md mx-auto">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={currentIndex}
                    initial={{ opacity: 0, scale: 0.9, rotateY: -10 }}
                    animate={{ opacity: 1, scale: 1, rotateY: 0 }}
                    exit={{ opacity: 0, scale: 0.9, rotateY: 10 }}
                    transition={{ duration: 0.5 }}
                    className="absolute inset-0"
                  >
                    {/* Glow effect behind card */}
                    <div 
                      className="absolute inset-0 bg-gradient-to-br from-cyan-500/20 to-purple-500/20 rounded-3xl blur-3xl scale-105"
                      style={{ 
                        animation: 'pulse 2s ease-in-out infinite'
                      }}
                    />
                    
                    {/* Card Image */}
                    <div className="relative h-full bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-sm rounded-3xl overflow-hidden border border-white/20 shadow-2xl">
                      <img
                        src={currentCard.image}
                        alt={`Trading stats for ${currentCard.author}`}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          // Fallback to a gradient if image fails to load
                          (e.currentTarget as HTMLElement).style.display = 'none';
                          const parent = (e.currentTarget as HTMLElement).parentElement;
                          if (parent) {
                            parent.style.background = 'linear-gradient(135deg, rgba(6, 182, 212, 0.2) 0%, rgba(168, 85, 247, 0.2) 100%)';
                            const text = document.createElement('div');
                            text.className = 'flex items-center justify-center h-full text-white/60 text-center p-8';
                            text.textContent = `${currentCard.stat}\n${currentCard.author}'s Stats`;
                            parent.appendChild(text);
                          }
                        }}
                      />
                    </div>
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* Navigation Arrows */}
              <button
                onClick={goToPrevious}
                className="absolute left-2 top-1/2 -translate-y-1/2 w-12 h-12 bg-black/60 hover:bg-black/80 backdrop-blur-sm border border-white/20 rounded-full flex items-center justify-center text-white/80 hover:text-white transition-all duration-300 hover:scale-110 z-10"
                aria-label="Previous card"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>

              <button
                onClick={goToNext}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-12 h-12 bg-black/60 hover:bg-black/80 backdrop-blur-sm border border-white/20 rounded-full flex items-center justify-center text-white/80 hover:text-white transition-all duration-300 hover:scale-110 z-10"
                aria-label="Next card"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            </div>

            {/* Testimonial Side */}
            <div className="flex-1 max-w-xl">
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentIndex}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.5 }}
                  className="space-y-6"
                >
                  {/* Quote Icon */}
                  <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-cyan-500/20 to-purple-500/20 border border-cyan-400/30 rounded-2xl">
                    <Quote className="w-8 h-8 text-cyan-400" />
                  </div>

                  {/* Testimonial */}
                  <blockquote className="text-2xl md:text-3xl font-medium text-white/90 leading-relaxed">
                    "{currentCard.testimonial}"
                  </blockquote>

                  {/* Author Info */}
                  <div className="flex items-center gap-4 pt-4">
                    <img 
                      src={currentCard.avatar}
                      alt={currentCard.author}
                      className="w-14 h-14 rounded-full border-2 border-cyan-400/50 object-cover"
                    />
                    <div>
                      <div className="font-bold text-lg text-white">{currentCard.author}</div>
                      <div className="text-white/60">{currentCard.role}</div>
                    </div>
                  </div>

                  {/* Performance Badge */}
                  <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-500/20 to-purple-500/20 border border-cyan-400/30 rounded-full">
                    <span className={`text-sm font-bold ${
                      currentCard.stat.startsWith('+') ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {currentCard.stat}
                    </span>
                    <span className="text-white/60 text-sm">this period</span>
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>

          {/* Navigation Dots */}
          <div className="flex justify-center gap-3 mt-12">
            {showcaseCards.map((_, index) => (
              <button
                key={index}
                onClick={() => goToSlide(index)}
                className={`transition-all duration-300 rounded-full ${
                  index === currentIndex
                    ? 'w-12 h-3 bg-gradient-to-r from-cyan-400 to-purple-400'
                    : 'w-3 h-3 bg-white/20 hover:bg-white/40'
                }`}
                aria-label={`Go to slide ${index + 1}`}
              />
            ))}
          </div>
        </div>

        {/* Feature Callout */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          viewport={{ once: true }}
          className="mt-16 text-center"
        >
          <p className="text-white/60 text-lg">
            One click to generate. Zero hassle.
          </p>
        </motion.div>
      </div>
    </section>
  );
};
