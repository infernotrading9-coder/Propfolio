import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, Star } from 'lucide-react';

export interface TestimonialItem {
  name: string;
  role: string;
  avatar: string;
  fallback?: string;
  content: string;
  rating?: number;
}

interface TestimonialsCarouselProps {
  items: TestimonialItem[];
  autoPlayMs?: number;
}

export const TestimonialsCarousel: React.FC<TestimonialsCarouselProps> = ({ items, autoPlayMs = 5000 }) => {
  const [index, setIndex] = React.useState(0);
  const count = items.length;

  const next = React.useCallback(() => setIndex((i) => (i + 1) % count), [count]);
  const prev = React.useCallback(() => setIndex((i) => (i - 1 + count) % count), [count]);

  React.useEffect(() => {
    const id = setInterval(next, autoPlayMs);
    return () => clearInterval(id);
  }, [next, autoPlayMs]);

  const item = items[index];

  return (
    <div className="relative w-full overflow-hidden">
      <div className="relative bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 p-6 min-h-[220px]">
        <AnimatePresence initial={false} mode="wait">
          <motion.div
            key={index}
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ duration: 0.35 }}
          >
            <div className="flex flex-col sm:flex-row gap-4 items-start">
              <img
                src={item.avatar}
                alt={`${item.name} avatar`}
                width={56}
                height={56}
                loading="lazy"
                onError={(e) => { (e.currentTarget as HTMLImageElement).src = item.fallback || '/avatars/avatar-1.svg'; (e.currentTarget as HTMLImageElement).onerror = null; }}
                className="w-14 h-14 rounded-full object-cover border border-white/10"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <div className="font-semibold text-white">{item.name}</div>
                  <div className="text-xs text-white/50">• {item.role}</div>
                </div>
                <div className="flex items-center gap-1 mb-2">
                  {Array.from({ length: item.rating || 5 }).map((_, i) => (
                    <Star key={i} className="w-4 h-4 text-yellow-400 fill-current" />
                  ))}
                </div>
                <p className="text-white/80 leading-relaxed">“{item.content}”</p>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Controls */}
        <div className="absolute inset-y-0 left-0 right-0 flex items-center justify-between px-2 pointer-events-none">
          <button
            aria-label="Previous"
            onClick={prev}
            className="pointer-events-auto p-2 rounded-lg bg-black/30 hover:bg-black/40 border border-white/10 text-white/80 hover:text-white transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            aria-label="Next"
            onClick={next}
            className="pointer-events-auto p-2 rounded-lg bg-black/30 hover:bg-black/40 border border-white/10 text-white/80 hover:text-white transition-colors"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* Dots */}
        <div className="mt-4 flex items-center justify-center gap-2">
          {items.map((_, i) => (
            <button
              key={i}
              onClick={() => setIndex(i)}
              className={`h-2 rounded-full transition-all ${i === index ? 'w-6 bg-cyan-400' : 'w-2 bg-white/30 hover:bg-white/50'}`}
              aria-label={`Go to slide ${i + 1}`}
            />)
          )}
        </div>
      </div>
    </div>
  );
};
