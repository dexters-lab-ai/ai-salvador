// Preload critical fonts for better performance
export const preloadFonts = () => {
  if (typeof document === 'undefined') return;

  const preloadLinks = [
    { href: '/assets/fonts/upheaval_pro.woff2', as: 'font', type: 'font/woff2', crossOrigin: 'anonymous' },
    { href: '/assets/fonts/vcr_osd_mono.woff2', as: 'font', type: 'font/woff2', crossOrigin: 'anonymous' }
  ];

  preloadLinks.forEach(({ href, as, type, crossOrigin }) => {
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = as;
    link.type = type;
    link.href = href;
    if (crossOrigin) link.crossOrigin = crossOrigin;
    document.head.appendChild(link);
  });
};

// Add font loading class to document
export const handleFontLoading = () => {
  if (typeof document === 'undefined') return;

  // Add loading class
  document.documentElement.classList.add('fonts-loading');

  // Check if fonts are loaded
  if ('fonts' in document) {
    Promise.all([
      document.fonts.load('1em Upheaval Pro'),
      document.fonts.load('1em VCR OSD Mono')
    ]).then(() => {
      document.documentElement.classList.remove('fonts-loading');
      document.documentElement.classList.add('fonts-loaded');
    }).catch(() => {
      document.documentElement.classList.remove('fonts-loading');
      document.documentElement.classList.add('fonts-failed');
    });
  } else {
    // Fallback for browsers that don't support Font Loading API
    const timer = setTimeout(() => {
      document.documentElement.classList.remove('fonts-loading');
      document.documentElement.classList.add('fonts-loaded');
    }, 3000);
  }
};
